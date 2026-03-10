export interface EngineStatus {
  available: boolean;
  name: string;
  description: string;
  supported_languages: string[];
  supports_voice_cloning: boolean;
  voice_prepared: boolean;
  error?: string | null;
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

export interface SynthesisParams {
  exaggeration: number;
  cfg_weight: number;
  temperature: number;
  repetition_penalty: number;
  min_p: number;
  top_p: number;
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

export interface VoicePreset {
  id: string;
  name: string;
  created_at: number;
  gender?: string;
  age_group?: string;
  tone?: string;
  language?: string;
  is_builtin?: boolean;
  description?: string;
  exaggeration?: number;
  preview_audio_url?: string;
}
