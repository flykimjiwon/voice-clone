"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload,
  Mic,
  X,
  FileAudio,
  Square,
  Play,
  Pause,
  RotateCcw,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { uploadVoice } from "@/lib/api";
import type { UploadVoiceResponse } from "@/lib/types";

interface VoiceUploaderProps {
  onVoicesChanged: (voices: UploadVoiceResponse[]) => void;
}

type Mode = "upload" | "record";
type RecordState = "idle" | "recording" | "recorded";

const ACCEPT = ".wav,.mp3,.flac,.ogg,.m4a,.webm";
const LS_KEY = "tts_voices";

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function saveVoices(voices: UploadVoiceResponse[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(voices)); } catch {}
}

function loadVoices(): UploadVoiceResponse[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as UploadVoiceResponse[]) : [];
  } catch { return []; }
}

export default function VoiceUploader({ onVoicesChanged }: VoiceUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const [voices, setVoices] = useState<UploadVoiceResponse[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<Mode>("upload");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recordState, setRecordState] = useState<RecordState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  useEffect(() => {
    const restored = loadVoices();
    if (restored.length > 0) setVoices(restored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) onVoicesChanged(voices);
  }, [voices, hydrated, onVoicesChanged]);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  // ─── Voice list management ───

  const addVoice = useCallback((v: UploadVoiceResponse) => {
    setVoices((prev) => {
      const next = [...prev, v];
      saveVoices(next);
      return next;
    });
  }, []);

  const removeVoice = useCallback((voiceId: string) => {
    setVoices((prev) => {
      const next = prev.filter((vi) => vi.voice_id !== voiceId);
      saveVoices(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setVoices([]);
    saveVoices([]);
  }, []);

  // ─── File upload ───

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setError(null);
      setUploading(true);
      try {
        for (const file of Array.from(files)) {
          const result = await uploadVoice(file);
          addVoice(result);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "\uC5C5\uB85C\uB4DC \uC2E4\uD328");
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [addVoice],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const onSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
    },
    [handleFiles],
  );

  // ─── Recording ───

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
          ? "audio/ogg;codecs=opus"
          : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(blob));
        setRecordState("recorded");
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setRecordState("recording");
      setElapsed(0);

      const start = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - start) / 1000));
      }, 200);
    } catch {
      setError("\uB9C8\uC774\uD06C \uC811\uADFC\uC774 \uAC70\uBD80\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uBE0C\uB77C\uC6B0\uC800 \uC124\uC815\uC5D0\uC11C \uB9C8\uC774\uD06C\uB97C \uD5C8\uC6A9\uD574 \uC8FC\uC138\uC694.");
    }
  }, [previewUrl]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const resetRecordingState = useCallback(() => {
    stopRecording();
    setRecordState("idle");
    setRecordedBlob(null);
    setElapsed(0);
    setPreviewPlaying(false);
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
  }, [stopRecording, previewUrl]);

  const uploadRecording = useCallback(async () => {
    if (!recordedBlob) return;
    setError(null);
    setUploading(true);

    const ext = recordedBlob.type.includes("ogg") ? "ogg" : "webm";
    const file = new File([recordedBlob], `recording_${Date.now()}.${ext}`, { type: recordedBlob.type });

    try {
      const result = await uploadVoice(file);
      addVoice(result);
      resetRecordingState();
    } catch (e) {
      setError(e instanceof Error ? e.message : "\uC5C5\uB85C\uB4DC \uC2E4\uD328");
    } finally {
      setUploading(false);
    }
  }, [recordedBlob, addVoice, resetRecordingState]);

  const togglePreview = useCallback(() => {
    const audio = previewAudioRef.current;
    if (!audio) return;
    if (previewPlaying) { audio.pause(); } else { audio.play(); }
    setPreviewPlaying(!previewPlaying);
  }, [previewPlaying]);

  // ─── Render ───

  return (
    <div className="flex flex-col gap-3">
      {voices.length > 0 && (
        <Card className="py-0 gap-0">
          <CardContent className="flex flex-col gap-2 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {"\uC5C5\uB85C\uB4DC\uB41C \uC74C\uC131"} ({voices.length}{"\uAC1C"})
              </span>
              <button
                onClick={clearAll}
                className="text-[10px] text-muted-foreground/60 hover:text-destructive transition-colors"
              >
                {"\uC804\uCCB4 \uC0AD\uC81C"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {voices.map((v) => (
                <div
                  key={v.voice_id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5"
                >
                  <FileAudio className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-foreground max-w-[140px] truncate">
                    {v.filename}
                  </span>
                  {v.duration_seconds > 0 && (
                    <span className="text-[10px] font-mono text-muted-foreground/60">
                      {v.duration_seconds.toFixed(1)}s
                    </span>
                  )}
                  <button
                    onClick={() => removeVoice(v.voice_id)}
                    className="text-muted-foreground/60 hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs
        value={mode}
        onValueChange={(val) => { setMode(val as Mode); setError(null); }}
        className="gap-3"
      >
        <TabsList className="self-start">
          <TabsTrigger value="upload">
            <Upload className="h-3 w-3" />
            {"\uD30C\uC77C \uC5C5\uB85C\uB4DC"}
          </TabsTrigger>
          <TabsTrigger value="record">
            <Mic className="h-3 w-3" />
            {"\uC9C1\uC811 \uB179\uC74C"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-all",
              dragOver
                ? "border-amber-500 bg-amber-500/5"
                : "border-border hover:border-muted-foreground/40 hover:bg-muted/50",
              uploading && "pointer-events-none opacity-60",
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              multiple
              onChange={onSelect}
              className="hidden"
            />
            {uploading ? (
              <>
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-amber-500" />
                <span className="text-sm text-muted-foreground">{"\uC5C5\uB85C\uB4DC \uC911..."}</span>
              </>
            ) : (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted group-hover:bg-accent transition-colors">
                  {dragOver ? (
                    <Upload className="h-6 w-6 text-amber-500" />
                  ) : voices.length > 0 ? (
                    <Plus className="h-6 w-6 text-muted-foreground group-hover:text-foreground" />
                  ) : (
                    <FileAudio className="h-6 w-6 text-muted-foreground group-hover:text-foreground" />
                  )}
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-sm font-medium text-foreground">
                    {voices.length > 0 ? "\uC74C\uC131 \uD30C\uC77C \uCD94\uAC00\uD558\uAE30" : "\uC74C\uC131 \uD30C\uC77C\uC744 \uB4DC\uB798\uADF8\uD558\uAC70\uB098 \uD074\uB9AD\uD558\uC138\uC694"}
                  </span>
                  <span className="text-xs text-muted-foreground/60">
                    WAV, MP3, FLAC, OGG, M4A &middot; {"\uC5EC\uB7EC \uD30C\uC77C \uC120\uD0DD \uAC00\uB2A5"} &middot; 5~30{"\uCD08 \uAD8C\uC7A5"}
                  </span>
                </div>
              </>
            )}
          </div>
          <p className="text-center text-[11px] text-muted-foreground/60 mt-2">
            또는 위 프리셋에서 기존 음성을 선택하세요
          </p>
        </TabsContent>

        <TabsContent value="record">
          <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-border p-8">
            {recordState === "idle" && (
              <>
                <button
                  onClick={startRecording}
                  className="group relative flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10 transition-all hover:bg-red-500/20"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 transition-transform group-hover:scale-105 group-active:scale-95">
                    <Mic className="h-6 w-6 text-white" />
                  </div>
                </button>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-sm font-medium text-foreground">
                    {"\uD074\uB9AD\uD558\uC5EC \uB179\uC74C\uC744 \uC2DC\uC791\uD558\uC138\uC694"}
                  </span>
                  <span className="text-xs text-muted-foreground/60">
                    5~30{"\uCD08 \uAD8C\uC7A5"} &middot; {"\uC5EC\uB7EC \uBC88 \uB179\uC74C \uAC00\uB2A5"}
                  </span>
                </div>
              </>
            )}

            {recordState === "recording" && (
              <>
                <div className="relative flex h-20 w-20 items-center justify-center">
                  <div className="absolute inset-0 animate-ping rounded-full bg-red-500/20" />
                  <div
                    className="absolute inset-2 rounded-full bg-red-500/10"
                    style={{ animation: "ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite 0.3s" }}
                  />
                  <button
                    onClick={stopRecording}
                    className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-red-500 transition-transform hover:scale-105 active:scale-95"
                  >
                    <Square className="h-5 w-5 text-white fill-white" />
                  </button>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-lg font-mono font-semibold text-foreground">
                      {formatTime(elapsed)}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {"\uB179\uC74C \uC911... \uC815\uC9C0 \uBC84\uD2BC\uC744 \uB20C\uB7EC \uC644\uB8CC\uD558\uC138\uC694"}
                  </span>
                </div>
              </>
            )}

            {recordState === "recorded" && previewUrl && (
              <>
                <audio
                  ref={previewAudioRef}
                  src={previewUrl}
                  onEnded={() => setPreviewPlaying(false)}
                />
                <div className="flex items-center gap-4">
                  <button
                    onClick={togglePreview}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-zinc-950 hover:bg-amber-400 transition-colors"
                  >
                    {previewPlaying ? (
                      <Pause className="h-5 w-5" />
                    ) : (
                      <Play className="h-5 w-5 ml-0.5" />
                    )}
                  </button>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">{"\uB179\uC74C \uC644\uB8CC"}</span>
                    <span className="text-xs font-mono text-muted-foreground">{formatTime(elapsed)}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={resetRecordingState}
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                  >
                    <RotateCcw className="h-3 w-3" />
                    {"\uB2E4\uC2DC \uB179\uC74C"}
                  </Button>
                  <Button
                    onClick={uploadRecording}
                    disabled={uploading}
                    size="sm"
                    className="gap-1.5 bg-amber-500 text-zinc-950 hover:bg-amber-400 active:scale-[0.98]"
                  >
                    {uploading ? (
                      <>
                        <div className="h-3 w-3 animate-spin rounded-full border border-muted-foreground/30 border-t-muted-foreground" />
                        {"\uC5C5\uB85C\uB4DC \uC911..."}
                      </>
                    ) : (
                      <>
                        <Upload className="h-3 w-3" />
                        {"\uC774 \uB179\uC74C \uCD94\uAC00\uD558\uAE30"}
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {voices.length === 0 && (
        <p className="text-center text-[10px] text-muted-foreground/60">
          또는 위 프리셋에서 기존 음성을 선택하세요
        </p>
      )}

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-2.5">
          <span className="text-xs text-destructive">{error}</span>
        </div>
      )}
    </div>
  );
}
