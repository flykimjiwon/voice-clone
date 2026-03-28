from __future__ import annotations

import base64
import hashlib
import json
import time
from pathlib import Path

import requests as _requests

from .base import TTSEngine
from ..config import FISH_SPEECH_HEALTH_TIMEOUT, FISH_SPEECH_SYNTH_TIMEOUT

FISH_SPEECH_LANG_MAP = {
    "ko": "ko",
    "en": "en",
    "zh-cn": "zh",
    "zh": "zh",
    "ja": "ja",
    "es": "es",
    "fr": "fr",
    "de": "de",
    "it": "it",
    "pt": "pt",
    "ar": "ar",
    "hi": "hi",
    "ru": "ru",
    "nl": "nl",
    "pl": "pl",
    "tr": "tr",
    "sv": "sv",
    "da": "da",
    "fi": "fi",
    "el": "el",
    "he": "he",
    "ms": "ms",
    "no": "no",
    "sw": "sw",
    "uk": "uk",
    "cs": "cs",
    "ro": "ro",
    "hu": "hu",
    "id": "id",
    "vi": "vi",
    "th": "th",
}


class FishSpeechEngine(TTSEngine):
    engine_id = "fish_speech"
    engine_name = "Fish Audio S2"
    description = (
        "Fish Audio의 차세대 TTS. 5B Dual-AR 모델, 80+ 언어 지원. "
        "[excited], [whisper] 등 감정 태그 인라인 제어. "
        "Zero-shot Voice Cloning. 별도 fish-speech API 서버 필요 (CUDA GPU 권장)."
    )
    supports_voice_cloning = True
    supported_languages = list(FISH_SPEECH_LANG_MAP.keys())

    def __init__(self, server_url: str = "http://localhost:8080"):
        self._server_url = server_url.rstrip("/")
        self._reference_audio: bytes | None = None
        self._reference_text: str = ""
        self._reference_hash: str | None = None
        self._error: str | None = None

    # ─── Availability ───

    def is_available(self) -> bool:
        try:
            resp = _requests.get(f"{self._server_url}/v1/health", timeout=FISH_SPEECH_HEALTH_TIMEOUT)
            if resp.status_code == 200:
                self._error = None
                return True
            self._error = f"Fish Speech 서버 응답 오류: HTTP {resp.status_code}"
            return False
        except _requests.exceptions.ConnectionError:
            self._error = (
                f"Fish Speech 서버에 연결할 수 없습니다 ({self._server_url}). "
                "fish-speech API 서버가 실행 중인지 확인하세요."
            )
            return False
        except Exception as e:
            self._error = f"Fish Speech 서버 확인 실패: {e}"
            return False

    def initialize(self) -> None:
        # External HTTP server — no local initialization needed
        pass

    # ─── Voice embedding (in-memory) ───

    def prepare_voice(
        self,
        speaker_wav: Path,
        transcript: str = "",
        **kwargs,
    ) -> bool:
        """Store reference audio bytes + transcript for voice cloning."""
        with open(speaker_wav, "rb") as f:
            audio_bytes = f.read()

        new_hash = hashlib.sha256(audio_bytes + transcript.encode()).hexdigest()
        if new_hash == self._reference_hash:
            return False  # cache hit

        self._reference_audio = audio_bytes
        self._reference_text = transcript
        self._reference_hash = new_hash
        return True

    @property
    def voice_prepared(self) -> bool:
        return self._reference_audio is not None

    # ─── Preset persistence ───

    def save_voice_embedding(self, save_path: Path) -> None:
        """Save reference audio + transcript.
        save_path is the stem key (e.g. voice_presets/{id}.pt).
        Actual files: {id}.ref.wav + {id}.transcript
        """
        if self._reference_audio is None:
            raise RuntimeError(
                "저장할 참조 음성이 없습니다. 먼저 음성을 업로드하고 합성을 실행하세요."
            )

        audio_path = save_path.parent / (save_path.stem + ".ref.wav")
        transcript_path = save_path.parent / (save_path.stem + ".transcript")

        audio_path.write_bytes(self._reference_audio)
        transcript_path.write_text(self._reference_text, encoding="utf-8")

    def load_voice_embedding(self, load_path: Path) -> None:
        """Load reference audio + transcript.
        load_path is the stem key (e.g. voice_presets/{id}.pt).
        Actual files read: {id}.ref.wav + {id}.transcript
        """
        audio_path = load_path.parent / (load_path.stem + ".ref.wav")
        transcript_path = load_path.parent / (load_path.stem + ".transcript")

        if not audio_path.exists():
            raise RuntimeError(
                f"참조 음성 파일을 찾을 수 없습니다: {audio_path}"
            )

        self._reference_audio = audio_path.read_bytes()
        self._reference_text = (
            transcript_path.read_text(encoding="utf-8")
            if transcript_path.exists()
            else ""
        )
        self._reference_hash = hashlib.sha256(
            self._reference_audio + self._reference_text.encode()
        ).hexdigest()

    def has_saved_embedding(self, embed_path: Path) -> bool:
        audio_path = embed_path.parent / (embed_path.stem + ".ref.wav")
        return audio_path.exists()

    def delete_saved_embedding(self, embed_path: Path) -> None:
        audio_path = embed_path.parent / (embed_path.stem + ".ref.wav")
        transcript_path = embed_path.parent / (embed_path.stem + ".transcript")
        audio_path.unlink(missing_ok=True)
        transcript_path.unlink(missing_ok=True)

    # ─── Synthesis ───

    def synthesize(
        self,
        text: str,
        speaker_wavs: list[Path],
        language: str,
        output_path: Path,
        transcript: str = "",
        temperature: float = 0.8,
        top_p: float = 0.8,
        repetition_penalty: float = 1.1,
        chunk_length: int = 200,
        **kwargs,  # absorbs Chatterbox-specific params (exaggeration, cfg_weight, etc.)
    ) -> dict:
        start = time.time()

        # Determine reference audio
        if speaker_wavs:
            with open(speaker_wavs[0], "rb") as f:
                reference_audio = f.read()
            reference_text = transcript
        elif self._reference_audio is not None:
            reference_audio = self._reference_audio
            reference_text = self._reference_text
        else:
            raise RuntimeError(
                "Fish Audio S2는 참조 음성이 필요합니다. "
                "음성을 업로드하거나 프리셋을 선택하세요."
            )

        # Build request payload
        request_data = {
            "text": text,
            "references": [
                {
                    "audio": base64.b64encode(reference_audio).decode("utf-8"),
                    "text": reference_text,
                }
            ],
            "format": "wav",
            "streaming": False,
            "temperature": temperature,
            "top_p": top_p,
            "repetition_penalty": repetition_penalty,
            "chunk_length": chunk_length,
        }

        # Try msgpack first for efficiency, fallback to JSON
        content: bytes
        headers: dict[str, str] = {}
        try:
            import ormsgpack

            content = ormsgpack.packb(
                request_data, option=ormsgpack.OPT_SERIALIZE_PYDANTIC
            )
            headers["Content-Type"] = "application/msgpack"
        except ImportError:
            content = json.dumps(request_data).encode("utf-8")
            headers["Content-Type"] = "application/json"

        try:
            resp = _requests.post(
                f"{self._server_url}/v1/tts",
                data=content,
                headers=headers,
                timeout=FISH_SPEECH_SYNTH_TIMEOUT,
            )
            resp.raise_for_status()
        except _requests.exceptions.Timeout:
            raise RuntimeError(
                f"Fish Speech 서버 응답 시간 초과 ({FISH_SPEECH_SYNTH_TIMEOUT}초)"
            )
        except _requests.exceptions.ConnectionError:
            raise RuntimeError(
                f"Fish Speech 서버에 연결할 수 없습니다 ({self._server_url})"
            )

        # Save output WAV
        if not resp.content:
            raise RuntimeError("Fish Speech 서버가 빈 응답을 반환했습니다.")
        output_path.write_bytes(resp.content)

        # Apply speed/pitch post-processing if requested
        speed = kwargs.get("speed", 1.0)
        pitch_semitones = kwargs.get("pitch_semitones", 0.0)
        sample_rate = 44100

        if speed != 1.0 or pitch_semitones != 0.0:
            import torchaudio

            waveform, sr = torchaudio.load(str(output_path))
            sample_rate = sr
            waveform = self.post_process_audio(waveform, sample_rate, speed, pitch_semitones)
            torchaudio.save(str(output_path), waveform, sample_rate)

        # Calculate duration
        duration = 0.0
        try:
            import wave

            with wave.open(str(output_path), "r") as wf:
                sample_rate = wf.getframerate()
                duration = wf.getnframes() / float(sample_rate)
        except Exception:
            pass

        return {
            "duration_seconds": round(duration, 2),
            "processing_time_seconds": round(time.time() - start, 2),
            "sample_rate": sample_rate,
            "voice_cached": len(speaker_wavs) == 0,
        }

    def get_error_message(self) -> str | None:
        return self._error
