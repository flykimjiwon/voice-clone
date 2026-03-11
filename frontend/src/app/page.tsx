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
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import VoiceUploader from "@/components/VoiceUploader";
import ParamsPanel, { DEFAULT_PARAMS, FISH_SPEECH_DEFAULT_PARAMS } from "@/components/ParamsPanel";
import AudioPlayer from "@/components/AudioPlayer";
import ServerLogModal from "@/components/ServerLogModal";
import VoicePresetPanel from "@/components/VoicePresetPanel";
import {
  fetchEngineStatus,
  synthesize,
  getAudioUrl,
  prepareVoice,
  saveVoicePreset,
  API_BASE,
} from "@/lib/api";
import { splitSentences } from "@/lib/split-sentences";
import type {
  EngineId,
  EngineStatus,
  EngineProgress,
  SynthesisParams,
  SynthesizeResponse,
  UploadVoiceResponse,
} from "@/lib/types";

const LANGUAGES = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
  { code: "zh-cn", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
];

const SAMPLE_TEXTS: Record<string, string> = {
  ko: "안녕하세요. 이것은 음성 합성 테스트입니다. 음성 클론의 음질과 자연스러움을 확인해 보세요.",
  en: "Hello. This is a voice synthesis test. Check the quality and naturalness of the voice clone.",
  "zh-cn": "你好。这是一个语音合成测试。请检查语音克隆的音质和自然度。",
  ja: "こんにちは。これは音声合成テストです。音声クローンの音質と自然さを確認してください。",
  es: "Hola. Esta es una prueba de síntesis de voz. Compruebe la calidad y naturalidad del clon de voz.",
  fr: "Bonjour. Ceci est un test de synthèse vocale. Vérifiez la qualité et le naturel du clone vocal.",
  de: "Hallo. Dies ist ein Sprachsynthesetest. Überprüfen Sie die Qualität und Natürlichkeit des Stimmklons.",
};

const ENGINE_LABELS: Record<EngineId, string> = {
  chatterbox: "Chatterbox",
  fish_speech: "Fish Audio S2",
};

interface QueueItem {
  id: string;
  text: string;
  status: "pending" | "generating" | "done" | "error";
  result?: SynthesizeResponse;
  error?: string;
}

export default function Home() {
  // ─── Engine state ───
  const [activeEngine, setActiveEngine] = useState<EngineId>("chatterbox");
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [engineDropdownOpen, setEngineDropdownOpen] = useState(false);

  // ─── Voice state ───
  const [voiceIds, setVoiceIds] = useState<string[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [activePresetName, setActivePresetName] = useState<string | null>(null);
  const [voicePresetMode, setVoicePresetMode] = useState(false);
  const [transcript, setTranscript] = useState("");

  // ─── Text/synthesis state ───
  const [text, setText] = useState(SAMPLE_TEXTS.ko);
  const [language, setLanguage] = useState("ko");
  const [params, setParams] = useState<SynthesisParams>({ ...DEFAULT_PARAMS });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SynthesizeResponse | null>(null);
  const [streamMode, setStreamMode] = useState(false);
  const [streamResults, setStreamResults] = useState<
    Array<{ text: string; result: SynthesizeResponse }>
  >([]);
  const [streamIndex, setStreamIndex] = useState(0);
  const [streamTotal, setStreamTotal] = useState(0);
  const [cancelled, setCancelled] = useState(false);

  // ─── Queue state ───
  const [queueInput, setQueueInput] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueOpen, setQueueOpen] = useState(true);

  // ─── UI state ───
  const [error, setError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [progress, setProgress] = useState<EngineProgress | null>(null);
  const [savePresetName, setSavePresetName] = useState("");
  const [savePresetLoading, setSavePresetLoading] = useState(false);
  const [savePresetDone, setSavePresetDone] = useState(false);
  const [presetRefreshKey, setPresetRefreshKey] = useState(0);

  const progressEsRef = useRef<EventSource | null>(null);
  const cancelledRef = useRef(false);

  // ─── Engine status fetch ───

  const refreshEngineStatus = useCallback(
    (eid: EngineId = activeEngine) => {
      fetchEngineStatus(eid)
        .then(setEngineStatus)
        .catch(() =>
          setApiError(
            "백엔드 서버에 연결할 수 없습니다. http://localhost:8000 에서 서버가 실행 중인지 확인하세요.",
          ),
        );
    },
    [activeEngine],
  );

  useEffect(() => {
    refreshEngineStatus(activeEngine);
  }, [activeEngine]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset voice state when switching engines
  const handleEngineSwitch = useCallback(
    (eid: EngineId) => {
      if (eid === activeEngine) return;
      setActiveEngine(eid);
      setVoicePresetMode(false);
      setActivePresetId(null);
      setActivePresetName(null);
      setVoiceIds([]);
      setTranscript("");
      setResult(null);
      setStreamResults([]);
      // Reset params to engine defaults
      if (eid === "fish_speech") {
        setParams((prev) => ({ ...prev, ...FISH_SPEECH_DEFAULT_PARAMS }));
      } else {
        setParams({ ...DEFAULT_PARAMS });
      }
      setEngineDropdownOpen(false);
    },
    [activeEngine],
  );

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
        // ignore
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
    refreshEngineStatus();
  }, [refreshEngineStatus]);

  const handleSaveAsPreset = useCallback(async () => {
    if (!savePresetName.trim() || voiceIds.length === 0) return;
    setSavePresetLoading(true);
    setSavePresetDone(false);
    setError(null);
    try {
      await prepareVoice(
        voiceIds,
        activeEngine,
        params.exaggeration,
        transcript,
      );
      await saveVoicePreset(savePresetName.trim(), activeEngine);
      setSavePresetName("");
      setSavePresetDone(true);
      setPresetRefreshKey((k) => k + 1);
      refreshEngineStatus();
      setTimeout(() => setSavePresetDone(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "프리셋 저장 실패");
    } finally {
      setSavePresetLoading(false);
    }
  }, [
    savePresetName,
    voiceIds,
    params.exaggeration,
    transcript,
    activeEngine,
    refreshEngineStatus,
  ]);

  useEffect(() => {
    setStreamMode(splitSentences(text).length > 1);
  }, [text]);

  const textSentences = splitSentences(text);
  const queueHasPending = queue.some((item) => item.status === "pending");
  const queueIsGenerating = queue.some((item) => item.status === "generating");
  const canStart =
    (voiceIds.length > 0 || voicePresetMode) &&
    engineStatus?.available === true &&
    !loading;
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
      return synthesize(
        sourceText,
        language,
        ids,
        params,
        activeEngine,
        transcript,
      );
    },
    [voicePresetMode, voiceIds, language, params, activeEngine, transcript],
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
      setError(err instanceof Error ? err.message : "음성 합성에 실패했습니다.");
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
  const streamProcessingTime = streamResults.reduce(
    (acc, item) => acc + item.result.processing_time_seconds,
    0,
  );
  const streamDuration = streamResults.reduce(
    (acc, item) => acc + item.result.duration_seconds,
    0,
  );

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
              <h1 className="text-lg font-bold tracking-tight">Voice Clone</h1>
              <p className="text-xs text-muted-foreground">
                Zero-shot Voice Cloning
              </p>
            </div>

            {/* ─── Engine selector ─── */}
            <div className="ml-4 relative">
              <button
                onClick={() => setEngineDropdownOpen((v) => !v)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  "border-border/60 bg-card hover:border-violet-500/40 hover:text-violet-500",
                  engineDropdownOpen && "border-violet-500/40 text-violet-500",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    engineStatus?.available
                      ? "bg-emerald-500"
                      : "bg-red-500",
                  )}
                />
                {ENGINE_LABELS[activeEngine]}
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform",
                    engineDropdownOpen && "rotate-180",
                  )}
                />
              </button>

              {engineDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 z-50 w-52 rounded-xl border border-border/60 bg-card shadow-lg py-1">
                  {(["chatterbox", "fish_speech"] as EngineId[]).map((eid) => (
                    <button
                      key={eid}
                      onClick={() => handleEngineSwitch(eid)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-xs transition-colors hover:bg-muted/60",
                        activeEngine === eid && "text-violet-600 dark:text-violet-400",
                      )}
                    >
                      <span className="flex-1 font-medium">{ENGINE_LABELS[eid]}</span>
                      {activeEngine === eid && (
                        <span className="text-[10px] text-violet-500">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
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
                  {engineStatus.available ? "사용 가능" : "사용 불가"}
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

        {/* Fish Speech server notice */}
        {activeEngine === "fish_speech" && engineStatus && !engineStatus.available && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed">
              <p className="font-medium mb-1">Fish Speech 서버가 실행되지 않고 있습니다.</p>
              <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
                CUDA GPU 환경에서{" "}
                <code className="font-mono bg-amber-500/10 px-1 py-0.5 rounded">
                  python tools/api_server.py
                </code>{" "}
                를 실행하거나 Docker Compose를 사용하세요.
              </p>
            </div>
          </div>
        )}

        {/* ─── Section 1: Voice Presets ─── */}

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/10 text-xs font-bold text-violet-500">
              1
            </span>
            <h2 className="text-sm font-semibold text-foreground">음성 프리셋</h2>
            <span className="text-[11px] text-muted-foreground">
              {ENGINE_LABELS[activeEngine]} 전용
            </span>
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
            key={`${presetRefreshKey}-${activeEngine}`}
            canSave={engineStatus?.voice_prepared === true}
            activePresetId={activePresetId}
            onPresetLoaded={onPresetLoaded}
            onPresetSaved={onPresetSaved}
            engineFilter={activeEngine}
          />
        </section>

        {/* ─── Section 2: Voice Upload/Record ─── */}

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/10 text-xs font-bold text-violet-500">
              2
            </span>
            <h2 className="text-sm font-semibold text-foreground">새 음성 추가</h2>
            <span className="text-[11px] text-muted-foreground">
              업로드/녹음 후 프리셋으로 저장하거나 바로 생성
            </span>
          </div>
          <VoiceUploader onVoicesChanged={onVoicesChanged} />

          {/* Fish Speech: transcript input */}
          {activeEngine === "fish_speech" && voiceIds.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">
                참조 음성 전사 텍스트
                <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                  (음질 향상에 권장)
                </span>
              </label>
              <Input
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="업로드한 음성의 내용을 그대로 입력하세요"
                className="h-8 text-xs"
              />
            </div>
          )}

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
            <h2 className="text-sm font-semibold text-foreground">텍스트 입력</h2>
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
              placeholder={
                activeEngine === "fish_speech"
                  ? "음성으로 변환할 텍스트를 입력하세요... [excited] 같은 감정 태그 사용 가능"
                  : "음성으로 변환할 텍스트를 입력하세요..."
              }
              className="flex-1 resize-none rounded-xl"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">⌘+Enter로 생성</p>
        </section>

        {/* ─── Section 3.5: Text Queue ─── */}

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
                  <Button
                    size="xs"
                    onClick={addQueueItem}
                    disabled={!queueInput.trim()}
                  >
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
                      <div
                        key={item.id}
                        className="rounded-lg border border-border/70 bg-background p-3"
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {item.text}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full text-[10px]",
                              item.status === "pending" &&
                                "border-border text-muted-foreground",
                              item.status === "generating" &&
                                "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
                              item.status === "done" &&
                                "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                              item.status === "error" &&
                                "border-destructive/30 bg-destructive/10 text-destructive",
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

                        {item.error && (
                          <p className="mt-2 text-[11px] text-destructive/80">
                            {item.error}
                          </p>
                        )}
                        {item.result && (
                          <div className="mt-3">
                            <AudioPlayer src={getAudioUrl(item.result.audio_url)} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    큐가 비어 있습니다.
                  </p>
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
            <h2 className="text-sm font-semibold text-foreground">파라미터 설정</h2>
          </div>
          <ParamsPanel
            params={params}
            onChange={setParams}
            engineId={activeEngine}
          />
        </section>

        {/* ─── Section 5: Generate + Result ─── */}

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/10 text-xs font-bold text-violet-500">
                5
              </span>
              <h2 className="text-sm font-semibold text-foreground">음성 생성</h2>
            </div>
            <Button
              onClick={
                queueHasPending
                  ? () => void processQueue()
                  : () => void handleGenerate()
              }
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
              💡 같은 음성으로 텍스트만 변경하여 빠르게 재생성 가능
            </p>
          )}

          {loading && streamTotal > 1 && (
            <Card className="py-0 gap-0">
              <CardContent className="flex flex-col gap-2.5 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
                    문장 {Math.min(streamIndex + 1, streamTotal)}/{streamTotal}{" "}
                    생성 중...
                  </span>
                  <Button variant="ghost" size="xs" onClick={handleCancel}>
                    중단
                  </Button>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-600 to-purple-400 transition-all"
                    style={{
                      width: `${(streamIndex / streamTotal) * 100}%`,
                    }}
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
              <span className="text-xs text-muted-foreground">음성 생성 중...</span>
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
              <span className="text-xs text-amber-700 dark:text-amber-300">
                중단되었습니다.
              </span>
            </div>
          )}

          {streamResults.length > 0 && !loading && (
            <div className="flex flex-col gap-3">
              {streamResults.map((item, i) => (
                <Card
                  key={`${item.result.audio_url}-${i}`}
                  className="rounded-xl py-0 gap-0"
                >
                  <CardContent className="flex flex-col gap-2 p-4">
                    <span className="text-xs text-muted-foreground">
                      {item.text}
                    </span>
                    <AudioPlayer src={getAudioUrl(item.result.audio_url)} />
                  </CardContent>
                </Card>
              ))}
              <div className="flex items-center gap-4 rounded-lg bg-muted/50 p-3">
                <span className="text-[11px] font-mono text-muted-foreground">
                  총 {streamResults.length}개 문장 · 처리{" "}
                  {streamProcessingTime.toFixed(2)}초 ·{" "}
                  {streamDuration.toFixed(2)}초 오디오
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
                      처리 {result.processing_time_seconds}초
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Volume2 className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {result.duration_seconds}초
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
                        캐시 사용
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
            {ENGINE_LABELS[activeEngine]} &middot; Zero-shot Voice Cloning
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
        {logOpen ? "로그 닫기" : "서버 로그"}
        {loading && !logOpen && (
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-violet-500" />
          </span>
        )}
      </Button>

      {/* Close engine dropdown on outside click */}
      {engineDropdownOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setEngineDropdownOpen(false)}
        />
      )}
    </div>
  );
}
