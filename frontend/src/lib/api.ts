import type {
  EngineId,
  EngineStatus,
  EngineListResponse,
  SynthesizeResponse,
  SynthesisParams,
  UploadVoiceResponse,
  PrepareVoiceResponse,
  VoicePreset,
  VocalAnalysisResponse,
  SongRecommendationResponse,
} from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchEngineStatus(
  engineId: EngineId = "chatterbox",
): Promise<EngineStatus> {
  const res = await fetch(`${API_BASE}/api/engine?engine_id=${engineId}`);
  if (!res.ok) throw new Error("엔진 상태를 가져올 수 없습니다.");
  return res.json();
}

export async function fetchAllEngines(): Promise<EngineListResponse> {
  const res = await fetch(`${API_BASE}/api/engines`);
  if (!res.ok) throw new Error("엔진 목록을 가져올 수 없습니다.");
  return res.json();
}

export async function uploadVoice(file: File): Promise<UploadVoiceResponse> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE}/api/upload-voice`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "음성 업로드에 실패했습니다.");
  }

  return res.json();
}

export async function prepareVoice(
  voiceIds: string[],
  engineId: EngineId = "chatterbox",
  exaggeration: number = 0.5,
  transcript: string = "",
): Promise<PrepareVoiceResponse> {
  const form = new FormData();
  form.append("engine_id", engineId);
  form.append("voice_ids", voiceIds.join(","));
  form.append("exaggeration", String(exaggeration));
  form.append("transcript", transcript);

  const res = await fetch(`${API_BASE}/api/prepare-voice`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "음성 준비에 실패했습니다.");
  }

  return res.json();
}

export async function synthesize(
  text: string,
  language: string,
  voiceIds: string[],
  params: SynthesisParams,
  engineId: EngineId = "chatterbox",
  transcript: string = "",
): Promise<SynthesizeResponse> {
  const form = new FormData();
  form.append("engine_id", engineId);
  form.append("text", text);
  form.append("language", language);
  form.append("voice_ids", voiceIds.join(","));
  form.append("transcript", transcript);
  form.append("exaggeration", String(params.exaggeration));
  form.append("cfg_weight", String(params.cfg_weight));
  form.append("temperature", String(params.temperature));
  form.append("repetition_penalty", String(params.repetition_penalty));
  form.append("min_p", String(params.min_p));
  form.append("top_p", String(params.top_p));
  form.append("chunk_length", String(params.chunk_length));
  form.append("speed", String(params.speed));
  form.append("pitch_semitones", String(params.pitch_semitones));

  const res = await fetch(`${API_BASE}/api/synthesize`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "음성 합성에 실패했습니다.");
  }

  return res.json();
}

export async function fetchVoicePresets(
  gender?: string,
  language?: string,
  engineFilter?: EngineId,
): Promise<VoicePreset[]> {
  const params = new URLSearchParams();
  if (gender) params.set("gender", gender);
  if (language) params.set("language", language);
  if (engineFilter) params.set("engine", engineFilter);
  const query = params.toString();
  const res = await fetch(
    `${API_BASE}/api/voice-presets${query ? `?${query}` : ""}`,
  );
  if (!res.ok) throw new Error("음성 프리셋 목록을 가져올 수 없습니다.");
  const data = await res.json();
  return data.presets;
}

export async function saveVoicePreset(
  name: string,
  engineId: EngineId = "chatterbox",
): Promise<VoicePreset> {
  const form = new FormData();
  form.append("name", name);
  form.append("engine_id", engineId);

  const res = await fetch(`${API_BASE}/api/voice-presets`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "음성 프리셋 저장에 실패했습니다.");
  }

  return res.json();
}

export async function loadVoicePreset(presetId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/voice-presets/${presetId}/load`, {
    method: "POST",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "음성 프리셋 로드에 실패했습니다.");
  }
}

export async function deleteVoicePreset(presetId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/voice-presets/${presetId}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "음성 프리셋 삭제에 실패했습니다.");
  }
}

export function getAudioUrl(path: string): string {
  return `${API_BASE}${path}`;
}

// ─── Vocal analysis ───

export async function analyzeVocalRange(
  voiceId?: string,
  presetId?: string,
): Promise<VocalAnalysisResponse> {
  const params = new URLSearchParams();
  if (voiceId) params.set("voice_id", voiceId);
  if (presetId) params.set("preset_id", presetId);

  const res = await fetch(`${API_BASE}/api/vocal/analyze?${params}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "음역대 분석에 실패했습니다.");
  }

  return res.json();
}

export async function getSongRecommendations(
  lowHz: number,
  highHz: number,
  language?: string,
): Promise<SongRecommendationResponse> {
  const params = new URLSearchParams({
    low_hz: String(lowHz),
    high_hz: String(highHz),
  });
  if (language) params.set("language", language);

  const res = await fetch(`${API_BASE}/api/vocal/songs?${params}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "노래 추천을 가져올 수 없습니다.");
  }

  return res.json();
}
