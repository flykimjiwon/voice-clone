"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { Mic2, Save, Trash2, Archive, Loader2, Play, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  fetchVoicePresets,
  saveVoicePreset,
  loadVoicePreset,
  deleteVoicePreset,
  getAudioUrl,
} from "@/lib/api";
import type { VoicePreset } from "@/lib/types";

type TabType = "all" | "female" | "male" | "user";

interface VoicePresetPanelProps {
  canSave: boolean;
  activePresetId: string | null;
  onPresetLoaded: (presetId: string, presetName: string) => void;
  onPresetSaved: () => void;
}

function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

export default function VoicePresetPanel({
  canSave,
  activePresetId,
  onPresetLoaded,
  onPresetSaved,
}: VoicePresetPanelProps) {
  const [presets, setPresets] = useState<VoicePreset[]>([]);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ─── Fetch presets ───

  const fetchPresets = useCallback(async (tab: TabType) => {
    try {
      let list: VoicePreset[];
      if (tab === "female") list = await fetchVoicePresets("female");
      else if (tab === "male") list = await fetchVoicePresets("male");
      else {
        list = await fetchVoicePresets();
        if (tab === "user") list = list.filter((p) => !p.is_builtin);
      }
      list.sort((a, b) => {
        if (!!a.is_builtin !== !!b.is_builtin) return a.is_builtin ? -1 : 1;
        return b.created_at - a.created_at;
      });
      setPresets(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "프리셋 목록을 불러올 수 없습니다.");
    }
  }, []);

  const refresh = useCallback(() => fetchPresets(activeTab), [fetchPresets, activeTab]);

  useEffect(() => {
    fetchPresets(activeTab);
  }, [activeTab, fetchPresets]);

  // ─── Save ───

  const handleSave = useCallback(async () => {
    if (!canSave || !name.trim() || saving) return;
    setError(null);
    setSaving(true);
    try {
      await saveVoicePreset(name.trim());
      setName("");
      await refresh();
      onPresetSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "프리셋 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }, [canSave, name, saving, refresh, onPresetSaved]);

  // ─── Load ───

  const handleLoad = useCallback(
    async (preset: VoicePreset) => {
      if (loadingId) return;
      setError(null);
      setLoadingId(preset.id);
      try {
        await loadVoicePreset(preset.id);
        onPresetLoaded(preset.id, preset.name);
      } catch (e) {
        setError(e instanceof Error ? e.message : "프리셋 로드에 실패했습니다.");
      } finally {
        setLoadingId(null);
      }
    },
    [loadingId, onPresetLoaded],
  );

  // ─── Delete ───

  const handleDelete = useCallback(
    async (e: React.MouseEvent, presetId: string) => {
      e.stopPropagation();
      setError(null);
      try {
        await deleteVoicePreset(presetId);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "프리셋 삭제에 실패했습니다.");
      }
    },
    [refresh],
  );

  // ─── Preview ───

  const handlePreview = useCallback(
    (e: React.MouseEvent, preset: VoicePreset) => {
      e.stopPropagation();
      if (!preset.preview_audio_url) return;
      if (playingPreviewId === preset.id) {
        audioRef.current?.pause();
        audioRef.current = null;
        setPlayingPreviewId(null);
        return;
      }
      audioRef.current?.pause();
      const audio = new Audio(getAudioUrl(preset.preview_audio_url));
      audio.onended = () => setPlayingPreviewId(null);
      audio.play();
      audioRef.current = audio;
      setPlayingPreviewId(preset.id);
    },
    [playingPreviewId],
  );

  const canSubmit = canSave && name.trim().length > 0 && !saving;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card/40 p-5">
      {/* ─── Tab Filter ─── */}

      <div className="flex gap-1 rounded-lg bg-muted p-1 self-start">
        {(["all", "female", "male", "user"] as TabType[]).map((tab) => {
          const label = { all: "전체", female: "여성", male: "남성", user: "사용자" }[tab];
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                activeTab === tab
                  ? "bg-accent text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ─── Save Form ─── */}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
          }}
          placeholder={canSave ? "프리셋 이름 입력..." : "음성을 먼저 로드하세요"}
          disabled={!canSave}
          className="flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-ring transition-colors disabled:opacity-40"
        />
        <Button
          onClick={handleSave}
          disabled={!canSubmit}
          variant="ghost"
          size="xs"
          className={cn(
            "gap-1.5 text-xs font-medium disabled:opacity-100",
            canSubmit
              ? "border border-violet-500/40 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 hover:text-violet-300 active:scale-[0.97]"
              : "border border-border bg-accent/50 text-muted-foreground/60",
          )}
        >
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Save className="h-3 w-3" />
          )}
          저장
        </Button>
      </div>

      {/* ─── Error ─── */}

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2">
          <span className="text-[11px] text-destructive">{error}</span>
        </div>
      )}

      {/* ─── Preset List ─── */}

      {presets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground/60">
          <Archive className="h-5 w-5" />
          <span className="text-xs">저장된 음성 프리셋이 없습니다</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {(() => {
            const dividerIdx = presets.findIndex(
              (p, i) => i > 0 && !p.is_builtin && presets[i - 1]?.is_builtin,
            );
            return presets.map((preset, idx) => {
              const isActive = preset.id === activePresetId;
              const isLoading = preset.id === loadingId;
              const isPlaying = preset.id === playingPreviewId;
              const subParts = [preset.description, preset.tone, preset.age_group].filter(Boolean);
              return (
                <Fragment key={preset.id}>
                  {idx === dividerIdx && dividerIdx > 0 && (
                    <div className="flex items-center gap-2 py-1">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-[9px] text-muted-foreground/60">사용자 프리셋</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <div
                    onClick={() => handleLoad(preset)}
                    className={cn(
                      "group flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors",
                      isActive
                        ? "border-violet-500/40 bg-violet-500/5"
                        : "border-border/60 bg-background/40 hover:border-border hover:bg-card/60",
                    )}
                  >
                    <div className="flex flex-1 items-center gap-3 min-w-0">
                      {isLoading ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-violet-400" />
                      ) : (
                        <Mic2
                          className={cn(
                            "h-3.5 w-3.5 shrink-0 transition-colors",
                            isActive
                              ? "text-violet-400"
                              : "text-muted-foreground/60 group-hover:text-violet-400",
                          )}
                        />
                      )}
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "truncate text-xs font-medium transition-colors",
                              isActive
                                ? "text-violet-300"
                                : "text-foreground group-hover:text-foreground",
                            )}
                          >
                            {preset.name}
                          </span>
                          {preset.is_builtin && (
                            <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-medium bg-violet-900/40 text-violet-400 border border-violet-700/30">
                              내장
                            </span>
                          )}
                          {preset.language && (
                            <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-medium bg-muted text-muted-foreground border border-border">
                              {preset.language.toUpperCase()}
                            </span>
                          )}
                        </div>
                        {subParts.length > 0 && (
                          <span className="truncate text-[10px] text-muted-foreground">
                            {subParts.join(" · ")}
                          </span>
                        )}
                      </div>
                    </div>

                    {preset.preview_audio_url && (
                      <button
                        onClick={(e) => handlePreview(e, preset)}
                        className={cn(
                          "shrink-0 rounded-md p-1 transition-colors",
                          isPlaying
                            ? "bg-violet-500/10 text-violet-400"
                            : "text-muted-foreground/60 hover:bg-accent hover:text-foreground",
                        )}
                        title={isPlaying ? "미리듣기 중지" : "미리듣기"}
                      >
                        {isPlaying ? (
                          <Square className="h-3 w-3" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                      </button>
                    )}

                    <span className="shrink-0 text-[10px] text-muted-foreground/60">
                      {formatDate(preset.created_at)}
                    </span>

                    {!preset.is_builtin && (
                      <button
                        onClick={(e) => handleDelete(e, preset.id)}
                        className="shrink-0 rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                        title="삭제"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </Fragment>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}
