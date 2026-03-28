"use client";

import { memo, useState, useCallback } from "react";
import { Music, Loader2, BarChart3, Star, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { analyzeVocalRange, getSongRecommendations } from "@/lib/api";
import type {
  VocalAnalysisResponse,
  SongRecommendation,
} from "@/lib/types";

const DIFFICULTY_COLORS: Record<string, string> = {
  "쉬움": "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "보통": "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "도전": "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

interface VocalAnalysisPanelProps {
  voiceId?: string;
  presetId?: string;
  disabled?: boolean;
}

function VocalAnalysisPanel({
  voiceId,
  presetId,
  disabled,
}: VocalAnalysisPanelProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<VocalAnalysisResponse | null>(null);
  const [songs, setSongs] = useState<SongRecommendation[]>([]);
  const [songLang, setSongLang] = useState<string | undefined>(undefined);
  const [loadingSongs, setLoadingSongs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAnalyze = !disabled && (!!voiceId || !!presetId);

  const handleAnalyze = useCallback(async () => {
    if (!canAnalyze) return;
    setAnalyzing(true);
    setError(null);
    setAnalysis(null);
    setSongs([]);

    try {
      const result = await analyzeVocalRange(voiceId, presetId);
      setAnalysis(result);

      // Auto-fetch song recommendations
      setLoadingSongs(true);
      const songResult = await getSongRecommendations(
        result.pitch.low_hz,
        result.pitch.high_hz,
        songLang,
      );
      setSongs(songResult.songs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석 실패");
    } finally {
      setAnalyzing(false);
      setLoadingSongs(false);
    }
  }, [canAnalyze, voiceId, presetId, songLang]);

  const handleLangFilter = useCallback(
    async (lang: string | undefined) => {
      setSongLang(lang);
      if (!analysis) return;
      setLoadingSongs(true);
      try {
        const songResult = await getSongRecommendations(
          analysis.pitch.low_hz,
          analysis.pitch.high_hz,
          lang,
        );
        setSongs(songResult.songs);
      } catch {
        // keep existing songs
      } finally {
        setLoadingSongs(false);
      }
    },
    [analysis],
  );


  return (
    <div className="flex flex-col gap-4">
      {/* Analyze Button */}
      <Button
        onClick={() => void handleAnalyze()}
        disabled={!canAnalyze || analyzing}
        variant="outline"
        className={cn(
          "w-full gap-2 rounded-xl",
          canAnalyze &&
            !analyzing &&
            "border-violet-500/40 text-violet-500 hover:bg-violet-500/10",
        )}
      >
        {analyzing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <BarChart3 className="h-4 w-4" />
        )}
        {analyzing ? "음역대 분석 중..." : "내 음역대 분석하기"}
      </Button>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {/* Analysis Result */}
      {analysis && (
        <Card className="rounded-2xl py-0 gap-0 overflow-hidden">
          <CardContent className="flex flex-col gap-5 p-5">
            {/* Pitch Range Visual */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Music className="h-4 w-4 text-violet-400" />
                <span className="text-sm font-semibold">내 음역대</span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-pink-500/10 border border-violet-500/20 px-5 py-4">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">최저음</span>
                  <span className="text-lg font-bold text-violet-600 dark:text-violet-400 font-mono">
                    {analysis.pitch.low_note}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {analysis.pitch.low_hz}Hz
                  </span>
                </div>

                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">범위</span>
                  <span className="text-2xl font-bold text-foreground">
                    {analysis.pitch.range_semitones}
                    <span className="text-sm font-normal text-muted-foreground ml-1">반음</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    약 {analysis.pitch.range_octaves}옥타브
                  </span>
                </div>

                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">최고음</span>
                  <span className="text-lg font-bold text-pink-600 dark:text-pink-400 font-mono">
                    {analysis.pitch.high_note}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {analysis.pitch.high_hz}Hz
                  </span>
                </div>
              </div>

              {/* Voice Type Classification */}
              {analysis.voice_types.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    성악 분류
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {analysis.voice_types.slice(0, 3).map((vt) => (
                      <div
                        key={vt.type}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-3 py-2",
                          vt.match_percent >= 70
                            ? "border-violet-500/30 bg-violet-500/5"
                            : "border-border/60 bg-card/40",
                        )}
                      >
                        {vt.match_percent >= 70 && (
                          <Star className="h-3 w-3 text-violet-400" />
                        )}
                        <span className="text-xs font-medium">{vt.type}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {vt.match_percent}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Song Recommendations */}
            <div className="flex flex-col gap-3 border-t border-border/60 pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="h-4 w-4 text-violet-400" />
                  <span className="text-sm font-semibold">추천 노래</span>
                  {songs.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {songs.length}곡
                    </span>
                  )}
                </div>

                {/* Language filter */}
                <div className="flex gap-1">
                  {[
                    { label: "전체", value: undefined },
                    { label: "한국어", value: "ko" },
                    { label: "English", value: "en" },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => void handleLangFilter(opt.value)}
                      className={cn(
                        "rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                        songLang === opt.value
                          ? "bg-violet-500/10 text-violet-500"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {loadingSongs && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
                </div>
              )}

              {!loadingSongs && songs.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">
                  음역대에 맞는 노래가 없습니다.
                </p>
              )}

              {!loadingSongs && songs.length > 0 && (
                <div className="flex flex-col gap-2">
                  {songs.map((song) => (
                    <div
                      key={`${song.title}-${song.artist}`}
                      className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 px-4 py-3 transition-colors hover:bg-card/60"
                    >
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold truncate">
                            {song.title}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full text-[9px] shrink-0",
                              DIFFICULTY_COLORS[song.difficulty],
                            )}
                          >
                            {song.difficulty}
                          </Badge>
                        </div>
                        <span className="text-[10px] text-muted-foreground truncate">
                          {song.artist} · {song.genre}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {song.song_range}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] font-medium",
                              song.key_shift === 0
                                ? "text-emerald-500"
                                : "text-amber-500",
                            )}
                          >
                            {song.key_shift_label}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                song.coverage_percent >= 90
                                  ? "bg-emerald-500"
                                  : song.coverage_percent >= 70
                                    ? "bg-amber-500"
                                    : "bg-red-400",
                              )}
                              style={{ width: `${song.coverage_percent}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground w-7 text-right">
                            {song.coverage_percent}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default memo(VocalAnalysisPanel);
