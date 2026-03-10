from pydantic import BaseModel
from typing import Optional


class EngineStatusResponse(BaseModel):
    available: bool
    name: str
    description: str
    supported_languages: list[str]
    supports_voice_cloning: bool
    voice_prepared: bool = False
    error: Optional[str] = None


class SynthesizeResponse(BaseModel):
    audio_url: str
    duration_seconds: float
    processing_time_seconds: float
    sample_rate: int
    voice_cached: bool = False


class UploadVoiceResponse(BaseModel):
    voice_id: str
    filename: str
    duration_seconds: float


class VoicePresetResponse(BaseModel):
    id: str
    name: str
    created_at: float
    gender: Optional[str] = None
    age_group: Optional[str] = None
    tone: Optional[str] = None
    language: Optional[str] = None
    is_builtin: bool = False
    description: Optional[str] = None
    exaggeration: Optional[float] = None
    preview_audio_url: Optional[str] = None


class VoicePresetListResponse(BaseModel):
    presets: list[VoicePresetResponse]
