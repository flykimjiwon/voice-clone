"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Waves,
  Sparkles,
  Languages,
  Terminal,
  Clock,
  Volume2,
  Zap,
  AlertTriangle,
  Loader2,
  Mic2,
  Save,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import VoiceUploader from "@/components/VoiceUploader";
import ParamsPanel from "@/components/ParamsPanel";
import AudioPlayer from "@/components/AudioPlayer";
import ServerLogModal from "@/components/ServerLogModal";
import VoicePresetPanel from "@/components/VoicePresetPanel";
import { fetchEngineStatus, synthesize, getAudioUrl, prepareVoice, saveVoicePreset, API_BASE } from "@/lib/api";
import { splitSentences } from "@/lib/split-sentences";
import type {
  EngineStatus,
  EngineProgress,
  SynthesisParams,
  SynthesizeResponse,
  UploadVoiceResponse,
} from "@/lib/types";

const LANGUAGES = [
  { code: "ko", label: "\uD55C\uAD6D\uC5B4" },
  { code: "en", label: "English" },
  { code: "zh-cn", label: "\u4E2D\u6587" },
  { code: "ja", label: "\u65E5\u672C\u8A9E" },
  { code: "es", label: "Espa\u00F1ol" },
  { code: "fr", label: "Fran\u00E7ais" },
  { code: "de", label: "Deutsch" },
];

const SAMPLE_TEXTS: Record<string, string> = {
  ko: "\uC548\uB155\uD558\uC138\uC694. \uC774\uAC83\uC740 Chatterbox \uC74C\uC131 \uD569\uC131 \uD14C\uC2A4\uD2B8\uC785\uB2C8\uB2E4. \uC74C\uC131 \uD074\uB860\uC758 \uC74C\uC9C8\uACFC \uC790\uC5F0\uC2A4\uB7EC\uC6C0\uC744 \uD655\uC778\uD574 \uBCF4\uC138\uC694.",
  en: "Hello. This is a Chatterbox voice synthesis test. Check the quality and naturalness of the voice clone.",
  "zh-cn": "\u4F60\u597D\u3002\u8FD9\u662F\u4E00\u4E2AChatterbox\u8BED\u97F3\u5408\u6210\u6D4B\u8BD5\u3002\u8BF7\u68C0\u67E5\u8BED\u97F3\u514B\u9686\u7684\u97F3\u8D28\u548C\u81EA\u7136\u5EA6\u3002",
  ja: "\u3053\u3093\u306B\u3061\u306F\u3002\u3053\u308C\u306FChatterbox\u97F3\u58F0\u5408\u6210\u30C6\u30B9\u30C8\u3067\u3059\u3002\u97F3\u58F0\u30AF\u30ED\u30FC\u30F3\u306E\u97F3\u8CEA\u3068\u81EA\u7136\u3055\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  es: "Hola. Esta es una prueba de s\u00EDntesis de voz con Chatterbox. Compruebe la calidad y naturalidad del clon de voz.",
  fr: "Bonjour. Ceci est un test de synth\u00E8se vocale Chatterbox. V\u00E9rifiez la qualit\u00E9 et le naturel du clone vocal.",
  de: "Hallo. Dies ist ein Chatterbox-Sprachsynthesetest. \u00DCberpr\u00FCfen Sie die Qualit\u00E4t und Nat\u00FCrlichkeit des Stimmklons.",
};

const DEFAULT_PARAMS: SynthesisParams = {
  exaggeration: 0.5,
  cfg_weight: 0.5,
  temperature: 0.8,
  repetition_penalty: 2.0,
  min_p: 0.05,
  top_p: 1.0,
};

interface QueueItem {
  id: string;
  text: string;
  status: "pending" | "generating" | "done" | "error";
  result?: SynthesizeResponse;
  error?: string;
}

export default function Home() {
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [voiceIds, setVoiceIds] = useState<string[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [activePresetName, setActivePresetName] = useState<string | null>(null);
  const [voicePresetMode, setVoicePresetMode] = useState(false);
  const [text, setText] = useState(SAMPLE_TEXTS.ko);
  const [language, setLanguage] = useState("ko");
  const [params, setParams] = useState<SynthesisParams>({ ...DEFAULT_PARAMS });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SynthesizeResponse | null>(null);
  const [streamMode, setStreamMode] = useState(false);
  const [streamResults, setStreamResults] = useState<Array<{ text: string; result: SynthesizeResponse }>>([]);
  const [streamIndex, setStreamIndex] = useState(0);
  const [streamTotal, setStreamTotal] = useState(0);
  const [cancelled, setCancelled] = useState(false);
  const [queueInput, setQueueInput] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueOpen, setQueueOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [progress, setProgress] = useState<EngineProgress | null>(null);
  const progressEsRef = useRef<EventSource | null>(null);
  const cancelledRef = useRef(false);

  // ─── Engine status fetch ───

  useEffect(() => {
    fetchEngineStatus()
      .then(setEngineStatus)
      .catch(() =>
        setApiError(
          "\uBC31\uC5D4\uB4DC \uC11C\uBC84\uC5D0 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. http://localhost:8000 \uC5D0\uC11C \uC11C\uBC84\uAC00 \uC2E4\uD589 \uC911\uC778\uC9C0 \uD655\uC778\uD558\uC138\uC694.",
        ),
      );
  }, []);

  // ─── SSE progress stream ───

  useEffect(() => {
    if (!loading) {
      if (progressEsRef.current) {
        progressEsRef.current.close();
        progressEsRef.current = null;
      }
      return;
    }

    const es = new EventSource(`${API_BASE}/api/logs/stream`);
    progressEsRef.current = es;

    es.onmessage = (event) => {
      try {
        const entry: { level: string; msg: string } = JSON.parse(event.data);
        if (entry.level === "PROGRESS") {
          const payload: EngineProgress = JSON.parse(entry.msg);
          setProgress(payload);
        }
      } catch {
      }
    };

    es.onerror = () => {
      es.close();
      progressEsRef.current = null;
    };

    return () => {
      es.close();
      progressEsRef.current = null;
    };
  }, [loading]);

  // ─── Callbacks ───

  const onVoicesChanged = useCallback((voices: UploadVoiceResponse[]) => {
    setVoiceIds(voices.map((v) => v.voice_id));
  }, []);

  const onLanguageChange = useCallback((code: string) => {
    setLanguage(code);
    if (SAMPLE_TEXTS[code]) {
      setText(SAMPLE_TEXTS[code]);
    }
  }, []);

  const onPresetLoaded = useCallback((presetId: string, presetName: string) => {
    setActivePresetId(presetId);
    setActivePresetName(presetName);
    setVoicePresetMode(true);
  }, []);

  const onPresetSaved = useCallback(() => {
    fetchEngineStatus().then(setEngineStatus).catch(() => {});
  }, []);

  const [presetRefreshKey, setPresetRefreshKey] = useState(0);
  const [savePresetName, setSavePresetName] = useState("");
  const [savePresetLoading, setSavePresetLoading] = useState(false);
  const [savePresetDone, setSavePresetDone] = useState(false);

  const handleSaveAsPreset = useCallback(async () => {
    if (!savePresetName.trim() || voiceIds.length === 0) return;
    setSavePresetLoading(true);
    setSavePresetDone(false);
    setError(null);
    try {
      await prepareVoice(voiceIds, params.exaggeration);
      await saveVoicePreset(savePresetName.trim());
      setSavePresetName("");
      setSavePresetDone(true);
      setPresetRefreshKey((k) => k + 1);
      fetchEngineStatus().then(setEngineStatus).catch(() => {});
      setTimeout(() => setSavePresetDone(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "프리셋 저장 실패");
    } finally {
      setSavePresetLoading(false);
    }
  }, [savePresetName, voiceIds, params.exaggeration]);

  useEffect(() => {
    setStreamMode(splitSentences(text).length > 1);
  }, [text]);

  const textSentences = splitSentences(text);
  const queueHasPending = queue.some((item) => item.status === "pending");
  const queueIsGenerating = queue.some((item) => item.status === "generating");
  const canStart = (voiceIds.length > 0 || voicePresetMode) && engineStatus?.available === true && !loading;
  const canGenerateText = canStart && text.trim().length > 0;
  const canProcessQueue = canStart && queueHasPending;

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    setCancelled(true);
  }, []);

  const playStreamAudio = useCallback((audioPath: string) => {
    const audio = new Audio(getAudioUrl(audioPath));
    void audio.play().catch(() => {});
  }, []);

  const runSynthesis = useCallback(
    async (sourceText: string) => {
      const ids = voicePresetMode ? [] : voiceIds;
      return synthesize(sourceText, language, ids, params);
    },
    [voicePresetMode, voiceIds, language, params],
  );

  const processQueue = useCallback(async () => {
    if (!canProcessQueue) return;

    cancelledRef.current = false;
    setCancelled(false);
    setError(null);
    setProgress(null);
    setLogOpen(true);
    setResult(null);
    setStreamResults([]);
    setStreamIndex(0);
    setStreamTotal(0);
    setLoading(true);

    const queueSnapshot = [...queue];
    for (let i = 0; i < queueSnapshot.length; i++) {
      if (cancelledRef.current) break;
      if (queueSnapshot[i].status !== "pending") continue;

      setQueue((prev) =>
        prev.map((item) =>
          item.id === queueSnapshot[i].id
            ? { ...item, status: "generating", error: undefined }
            : item,
        ),
      );

      try {
        const res = await runSynthesis(queueSnapshot[i].text);
        if (cancelledRef.current) break;
        setQueue((prev) =>
          prev.map((item) =>
            item.id === queueSnapshot[i].id
              ? { ...item, status: "done", result: res, error: undefined }
              : item,
          ),
        );
      } catch (err) {
        if (cancelledRef.current) break;
        setQueue((prev) =>
          prev.map((item) =>
            item.id === queueSnapshot[i].id
              ? {
                  ...item,
                  status: "error",
                  error: err instanceof Error ? err.message : "실패",
                }
              : item,
          ),
        );
      }
    }

    setLoading(false);
    if (cancelledRef.current) {
      setError("큐 생성을 중단했습니다.");
    }
  }, [canProcessQueue, queue, runSynthesis]);

  const handleGenerate = useCallback(async () => {
    if (!canGenerateText) return;

    const sentences = splitSentences(text);
    const useStream = streamMode && sentences.length > 1;

    cancelledRef.current = false;
    setCancelled(false);
    setResult(null);
    setStreamResults([]);
    setStreamIndex(0);
    setStreamTotal(useStream ? sentences.length : 0);
    setError(null);
    setProgress(null);
    setLoading(true);
    setLogOpen(true);

    try {
      if (!useStream) {
        const res = await runSynthesis(text);
        if (!cancelledRef.current) {
          setResult(res);
        }
      } else {
        for (let i = 0; i < sentences.length; i++) {
          if (cancelledRef.current) break;
          setStreamIndex(i);
          const sentence = sentences[i];
          const res = await runSynthesis(sentence);
          if (cancelledRef.current) break;
          setStreamResults((prev) => [...prev, { text: sentence, result: res }]);
          playStreamAudio(res.audio_url);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "\uC74C\uC131 \uD569\uC131\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    } finally {
      setLoading(false);
      if (cancelledRef.current) {
        setError("생성을 중단했습니다.");
      }
    }
  }, [canGenerateText, text, streamMode, runSynthesis, playStreamAudio]);

  const addQueueItem = useCallback(() => {
    const trimmed = queueInput.trim();
    if (!trimmed) return;

    setQueue((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        text: trimmed,
        status: "pending",
      },
    ]);
    setQueueInput("");
  }, [queueInput]);

  const removeQueueItem = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  const canGenerate = queueHasPending ? canProcessQueue : canGenerateText;
  const generateLabel = queueHasPending
    ? "큐 생성"
    : textSentences.length > 1
      ? "스트리밍 생성"
      : "음성 생성";
  const streamProcessingTime = streamResults.reduce((acc, item) => acc + item.result.processing_time_seconds, 0);
  const streamDuration = streamResults.reduce((acc, item) => acc + item.result.duration_seconds, 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ─── Header ─── */}

      <header className="border-b border-border/50">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-purple-500">
              <Waves className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                Chatterbox TTS
              </h1>
              <p className="text-xs text-muted-foreground">
                Resemble AI &middot; Zero-shot Voice Cloning
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {engineStatus && (
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-full text-[10px]",
                    engineStatus.available
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
                  )}
                >
                  {engineStatus.available ? "\uC0AC\uC6A9 \uAC00\uB2A5" : "\uC0AC\uC6A9 \uBD88\uAC00"}
                </Badge>
              )}
              <ModeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* ─── Main ─── */}

      <main className="mx-auto max-w-3xl px-6 py-8 flex flex-col gap-10">
        {apiError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
            <p className="text-sm text-destructive">{apiError}</p>
          </div>
        )}

        {engineStatus && !engineStatus.available && engineStatus.error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
            <p className="text-sm text-destructive/80 leading-relaxed">
              {engineStatus.error}
            </p>
          </div>
        )}

        {/* ─── Section 1: Voice Presets ─── */}

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/10 text-xs font-bold text-violet-500">
              1
            </span>
            <h2 className="text-sm font-semibold text-foreground">
              음성 프리셋
            </h2>
          </div>
          {voicePresetMode && activePresetName && (
            <div className="flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/5 px-3 py-2">
              <Mic2 className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
              <span className="text-xs text-violet-700 dark:text-violet-300">
                프리셋 음성 사용 중: <strong>{activePresetName}</strong>
              </span>
              <button
                onClick={() => {
                  setVoicePresetMode(false);
                  setActivePresetId(null);
                  setActivePresetName(null);
                }}
                className="ml-auto text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                해제
              </button>
            </div>
          )}
          <VoicePresetPanel
            key={presetRefreshKey}
            canSave={engineStatus?.voice_prepared === true}
            activePresetId={activePresetId}
            onPresetLoaded={onPresetLoaded}
            onPresetSaved={onPresetSaved}
          />
        </section>

        {/* ─── Section 2: Voice Upload/Record ─── */}

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/10 text-xs font-bold text-violet-500">
              2
            </span>
            <h2 className="text-sm font-semibold text-foreground">
              새 음성 추가
            </h2>
            <span className="text-[11px] text-muted-foreground">
              업로드/녹음 후 프리셋으로 저장하거나 바로 생성
            </span>
          </div>
          <VoiceUploader onVoicesChanged={onVoicesChanged} />

          {voiceIds.length > 0 && !voicePresetMode && (
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/40 p-3">
              <Save className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Input
                value={savePresetName}
                onChange={(e) => setSavePresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleSaveAsPreset();
                  }
                }}
                placeholder="프리셋 이름을 입력하여 저장"
                disabled={savePresetLoading}
                className="h-8 text-xs"
              />
              <Button
                onClick={() => void handleSaveAsPreset()}
                disabled={!savePresetName.trim() || savePresetLoading}
                size="xs"
                className="shrink-0 gap-1.5 bg-violet-500 text-white hover:bg-violet-400 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
              >
                {savePresetLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                저장
              </Button>
              {savePresetDone && (
                <span className="shrink-0 text-[11px] text-emerald-500">저장됨</span>
              )}
            </div>
          )}
        </section>

        {/* ─── Section 3: Text Input ─── */}

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/10 text-xs font-bold text-violet-500">
              3
            </span>
            <h2 className="text-sm font-semibold text-foreground">
              {"\uD14D\uC2A4\uD2B8 \uC785\uB825"}
            </h2>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            <div className="flex items-center gap-2 sm:w-48">
              <Languages className="h-4 w-4 text-muted-foreground" />
              <select
                value={language}
                onChange={(e) => onLanguageChange(e.target.value)}
                className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:border-ring transition-colors dark:bg-input/30"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void handleGenerate();
                }
              }}
              rows={3}
              placeholder={"\uC74C\uC131\uC73C\uB85C \uBCC0\uD658\uD560 \uD14D\uC2A4\uD2B8\uB97C \uC785\uB825\uD558\uC138\uC694..."}
              className="flex-1 resize-none rounded-xl"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">⌘+Enter로 생성</p>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/10 text-xs font-bold text-violet-500">
              3.5
            </span>
            <h2 className="text-sm font-semibold text-foreground">텍스트 큐</h2>
            <Button
              variant="ghost"
              size="xs"
              className="ml-auto"
              onClick={() => setQueueOpen((prev) => !prev)}
            >
              {queueOpen ? "접기" : "펼치기"}
            </Button>
          </div>

          {queueOpen && (
            <Card className="rounded-xl py-0 gap-0">
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-2">
                  <Input
                    value={queueInput}
                    onChange={(e) => setQueueInput(e.target.value)}
                    placeholder="큐에 넣을 텍스트를 입력하세요"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addQueueItem();
                      }
                    }}
                  />
                  <Button size="xs" onClick={addQueueItem} disabled={!queueInput.trim()}>
                    추가
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    onClick={() => void processQueue()}
                    disabled={!canProcessQueue || loading}
                  >
                    전체 생성
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={clearQueue}
                    disabled={queue.length === 0 || loading}
                  >
                    전체 삭제
                  </Button>
                  {loading && queueIsGenerating && (
                    <Button size="xs" variant="ghost" onClick={handleCancel}>
                      중단
                    </Button>
                  )}
                </div>

                {queue.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {queue.map((item) => (
                      <div key={item.id} className="rounded-lg border border-border/70 bg-background p-3">
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            <p className="text-xs text-muted-foreground leading-relaxed">{item.text}</p>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full text-[10px]",
                              item.status === "pending" && "border-border text-muted-foreground",
                              item.status === "generating" && "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
                              item.status === "done" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                              item.status === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
                            )}
                          >
                            {item.status === "pending" && "대기"}
                            {item.status === "generating" && "생성 중"}
                            {item.status === "done" && "완료"}
                            {item.status === "error" && "오류"}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="shrink-0"
                            onClick={() => removeQueueItem(item.id)}
                            disabled={item.status === "generating"}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>

                        {item.error && <p className="mt-2 text-[11px] text-destructive/80">{item.error}</p>}
                        {item.result && (
                          <div className="mt-3">
                            <AudioPlayer src={getAudioUrl(item.result.audio_url)} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">큐가 비어 있습니다.</p>
                )}
              </CardContent>
            </Card>
          )}
        </section>

        {/* ─── Section 4: Advanced Params ─── */}

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/10 text-xs font-bold text-violet-500">
              4
            </span>
            <h2 className="text-sm font-semibold text-foreground">
              {"\uD30C\uB77C\uBBF8\uD130 \uC124\uC815"}
            </h2>
          </div>
          <ParamsPanel params={params} onChange={setParams} />
        </section>

        {/* ─── Section 5: Generate + Result ─── */}

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/10 text-xs font-bold text-violet-500">
                5
              </span>
              <h2 className="text-sm font-semibold text-foreground">
                {"\uC74C\uC131 \uC0DD\uC131"}
              </h2>
            </div>
            <Button
              onClick={queueHasPending ? () => void processQueue() : () => void handleGenerate()}
              disabled={!canGenerate}
              size="lg"
              className="gap-2 rounded-xl px-6 bg-violet-500 text-white hover:bg-violet-400 active:scale-[0.98] disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
            >
              <Sparkles className="h-4 w-4" />
              {loading ? "생성 중..." : generateLabel}
              {!queueHasPending && textSentences.length > 1 && !loading && (
                <Badge
                  variant="outline"
                  className="ml-1 rounded-full border-violet-500/30 bg-violet-500/10 text-[10px] text-violet-600 dark:text-violet-300"
                >
                  {textSentences.length}문장
                </Badge>
              )}
            </Button>
          </div>

          {!loading && result?.voice_cached && (
            <p className="text-[11px] text-muted-foreground">
              {"\uD83D\uDCA1 \uAC19\uC740 \uC74C\uC131\uC73C\uB85C \uD14D\uC2A4\uD2B8\uB9CC \uBCC0\uACBD\uD558\uC5EC \uBE60\uB974\uAC8C \uC7AC\uC0DD\uC131 \uAC00\uB2A5"}
            </p>
          )}

          {loading && streamTotal > 1 && (
            <Card className="py-0 gap-0">
              <CardContent className="flex flex-col gap-2.5 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
                    문장 {Math.min(streamIndex + 1, streamTotal)}/{streamTotal} 생성 중...
                  </span>
                  <Button variant="ghost" size="xs" onClick={handleCancel}>
                    중단
                  </Button>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-600 to-purple-400 transition-all"
                    style={{ width: `${(streamIndex / streamTotal) * 100}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {loading && streamTotal <= 1 && progress && progress.percent >= 0 && (
            <Card className="py-0 gap-0">
              <CardContent className="flex flex-col gap-2.5 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
                    {progress.percent}%
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {progress.stage}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-600 to-purple-400 transition-all duration-500 ease-out"
                    style={{
                      width: `${Math.min(100, Math.max(0, progress.percent))}%`,
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {loading && streamTotal <= 1 && progress && progress.percent === -1 && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
              <span className="text-xs text-destructive/80">{progress.stage}</span>
            </div>
          )}

          {loading && !progress && streamTotal <= 1 && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
              <span className="text-xs text-muted-foreground">{"\uC74C\uC131 \uC0DD\uC131 \uC911..."}</span>
            </div>
          )}

          {error && !loading && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
              <span className="text-xs text-destructive/80">{error}</span>
            </div>
          )}

          {cancelled && !loading && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <span className="text-xs text-amber-700 dark:text-amber-300">중단되었습니다.</span>
            </div>
          )}

          {streamResults.length > 0 && !loading && (
            <div className="flex flex-col gap-3">
              {streamResults.map((item, i) => (
                <Card key={`${item.result.audio_url}-${i}`} className="rounded-xl py-0 gap-0">
                  <CardContent className="flex flex-col gap-2 p-4">
                    <span className="text-xs text-muted-foreground">{item.text}</span>
                    <AudioPlayer src={getAudioUrl(item.result.audio_url)} />
                  </CardContent>
                </Card>
              ))}
              <div className="flex items-center gap-4 rounded-lg bg-muted/50 p-3">
                <span className="text-[11px] font-mono text-muted-foreground">
                  총 {streamResults.length}개 문장 · 처리 {streamProcessingTime.toFixed(2)}초 · {streamDuration.toFixed(2)}초 오디오
                </span>
              </div>
            </div>
          )}

          {result && !loading && streamResults.length === 0 && (
            <Card className="rounded-2xl py-0 gap-0">
              <CardContent className="flex flex-col gap-4 p-5">
                <AudioPlayer src={getAudioUrl(result.audio_url)} />

                <div className="flex items-center gap-4 rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {"\uCC98\uB9AC"} {result.processing_time_seconds}{"\uCD08"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Volume2 className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {result.duration_seconds}{"\uCD08"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {result.sample_rate / 1000}kHz
                    </span>
                  </div>
                  {result.voice_cached && (
                    <div className="flex items-center gap-1.5">
                      <Zap className="h-3 w-3 text-amber-500 dark:text-amber-400" />
                      <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400">
                        {"\uCE90\uC2DC \uC0AC\uC6A9"}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </section>

      </main>

      {/* ─── Footer ─── */}

      <footer className="border-t border-border/50 mt-12">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <p className="text-xs text-muted-foreground/60 text-center">
            Chatterbox TTS &middot; Resemble AI &middot; Zero-shot Voice Cloning
          </p>
        </div>
      </footer>

      {/* ─── Server Log ─── */}

      <ServerLogModal open={logOpen} onClose={() => setLogOpen(false)} />

      <Button
        onClick={() => setLogOpen((v) => !v)}
        variant="outline"
        className={cn(
          "fixed right-5 z-[60] h-auto gap-2 rounded-full bg-card px-4 py-2.5 text-xs font-medium shadow-lg transition-all hover:border-violet-500/40 hover:text-violet-400 dark:bg-card",
          logOpen
            ? "bottom-[calc(40vh+12px)] border-violet-500/50 text-violet-500"
            : "bottom-5",
        )}
      >
        <Terminal className="h-4 w-4" />
        {logOpen ? "\uB85C\uADF8 \uB2EB\uAE30" : "\uC11C\uBC84 \uB85C\uADF8"}
        {loading && !logOpen && (
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-violet-500" />
          </span>
        )}
      </Button>
    </div>
  );
}
