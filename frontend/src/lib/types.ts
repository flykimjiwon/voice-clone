export type EngineId = "chatterbox" | "fish_speech";

export interface EngineStatus {
  engine_id: EngineId;
  available: boolean;
  name: string;
  description: string;
  supported_languages: string[];
  supports_voice_cloning: boolean;
  voice_prepared: boolean;
  error?: string | null;
}

export interface EngineListResponse {
  engines: EngineStatus[];
}

export interface SynthesizeResponse {
  audio_url: string;
  duration_seconds: number;
  processing_time_seconds: number;
  sample_rate: number;
  voice_cached: boolean;
}

export interface UploadVoiceResponse {
  voice_id: string;
  filename: string;
  duration_seconds: number;
}

/** Shared params (union of Chatterbox + Fish Speech). Each engine ignores irrelevant fields. */
export interface SynthesisParams {
  // Chatterbox
  exaggeration: number;
  cfg_weight: number;
  min_p: number;
  // Shared
  temperature: number;
  repetition_penalty: number;
  top_p: number;
  // Fish Speech
  chunk_length: number;
  // Voice concept (post-processing)
  speed: number;
  pitch_semitones: number;
}

export interface EngineProgress {
  engine_id: string;
  percent: number;
  stage: string;
}

export interface PrepareVoiceResponse {
  prepared: boolean;
  was_new: boolean;
}

export interface Preset {
  id: string;
  name: string;
  voice_ids: string[];
  voice_filenames: string[];
  language: string;
  params: SynthesisParams;
  created_at: number;
}

// ─── Vocal analysis ───

export interface PitchAnalysis {
  low_hz: number;
  high_hz: number;
  low_note: string;
  high_note: string;
  median_hz: number;
  median_note: string;
  mean_hz: number;
  range_semitones: number;
  range_octaves: number;
}

export interface VoiceTypeMatch {
  type: string;
  gender: string;
  range: string;
  match_percent: number;
}

export interface VocalAnalysisResponse {
  pitch: PitchAnalysis;
  voice_types: VoiceTypeMatch[];
}

export interface SongRecommendation {
  title: string;
  artist: string;
  genre: string;
  language: string;
  song_range: string;
  coverage_percent: number;
  difficulty: string;
  key_shift: number;
  key_shift_label: string;
}

export interface SongRecommendationResponse {
  songs: SongRecommendation[];
  total: number;
}

export interface VoicePreset {
  id: string;
  name: string;
  created_at: number;
  engine_id: EngineId;
  gender?: string;
  age_group?: string;
  tone?: string;
  language?: string;
  is_builtin?: boolean;
  description?: string;
  exaggeration?: number;
  preview_audio_url?: string;
}
