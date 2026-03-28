"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Trash2, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/api";

interface LogEntry {
  ts: number;
  level: string;
  msg: string;
  parsed_text?: string;
}

interface ServerLogModalProps {
  open: boolean;
  onClose: () => void;
}

const MAX_LINES = 500;

const LEVEL_COLOR: Record<string, string> = {
  INFO: "text-muted-foreground",
  STDOUT: "text-emerald-400",
  WARNING: "text-amber-400",
  ERROR: "text-red-400",
  PROGRESS: "text-violet-400",
  ENGINE_INFO: "text-blue-400",
  ENGINE_ERROR: "text-red-400",
};

function parseEntry(entry: LogEntry): LogEntry {
  if (entry.level === "PROGRESS" || entry.level.startsWith("ENGINE_")) {
    try {
      const parsed = JSON.parse(entry.msg);
      const displayText =
        (parsed.stage as string | undefined) ||
        (parsed.text as string | undefined) ||
        entry.msg;
      return { ...entry, parsed_text: displayText };
    } catch {
      return entry;
    }
  }
  return entry;
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function ServerLogModal({ open, onClose }: ServerLogModalProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const appendLogs = useCallback((newLogs: LogEntry[]) => {
    setLogs((prev) => {
      const parsed = newLogs.map(parseEntry);
      const merged = [...prev, ...parsed];
      return merged.length > MAX_LINES
        ? merged.slice(merged.length - MAX_LINES)
        : merged;
    });
  }, []);

  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`${API_BASE}/api/logs/stream`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const entry: LogEntry = JSON.parse(event.data);
        appendLogs([entry]);
      } catch {
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      retryTimerRef.current = setTimeout(connectSSE, 3000);
    };
  }, [appendLogs]);

  const disconnect = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      disconnect();
      return;
    }

    fetch(`${API_BASE}/api/logs/recent`)
      .then((res) => res.json())
      .then((data) => {
        if (data.logs) {
          const parsed = (data.logs as LogEntry[]).map(parseEntry);
          setLogs((prev) => {
            const merged = [...prev, ...parsed];
            return merged.length > MAX_LINES
              ? merged.slice(merged.length - MAX_LINES)
              : merged;
          });
        }
      })
      .catch(() => {});

    connectSSE();

    return () => {
      disconnect();
    };
  }, [open, connectSSE, disconnect]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleClear = useCallback(() => {
    setLogs([]);
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 flex flex-col border-t border-border bg-background/98 backdrop-blur-sm transition-transform duration-300 ease-out",
        open ? "translate-y-0" : "translate-y-full",
      )}
      style={{ height: "40vh" }}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Terminal className="h-3.5 w-3.5 text-violet-500" />
            <span className="text-xs font-semibold tracking-wide text-foreground uppercase">
              Server Log
            </span>
          </div>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
            {logs.length} lines
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            onClick={handleClear}
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-2 font-mono text-xs leading-relaxed"
      >
        {logs.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <span className="text-muted-foreground/60">Waiting for logs...</span>
          </div>
        )}
        {logs.map((entry, i) => (
          <div key={`${entry.ts}-${i}`} className="flex gap-2 py-px">
            <span className="shrink-0 select-none text-muted-foreground/60">
              {formatTime(entry.ts)}
            </span>
            <span
              className={cn(
                "shrink-0 w-16 select-none text-right",
                LEVEL_COLOR[entry.level] || "text-muted-foreground",
              )}
            >
              {entry.level}
            </span>
            <span
              className={cn(
                "min-w-0 break-all",
                LEVEL_COLOR[entry.level] || "text-muted-foreground",
              )}
            >
              {entry.parsed_text || entry.msg}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
