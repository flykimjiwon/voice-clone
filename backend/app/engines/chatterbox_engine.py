import hashlib
import time
from pathlib import Path

from .base import TTSEngine

CHATTERBOX_LANG_MAP = {
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
}


def _file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


class ChatterboxEngine(TTSEngine):
    engine_id = "chatterbox"
    engine_name = "Chatterbox"
    description = (
        "Resemble AI의 고품질 TTS. 23개 언어, Zero-shot Voice Cloning. MPS/CPU 지원."
    )
    supports_voice_cloning = True
    supported_languages = [
        "ko",
        "en",
        "zh-cn",
        "ja",
        "es",
        "fr",
        "de",
        "it",
        "pt",
        "ar",
        "hi",
        "ru",
        "nl",
        "pl",
        "tr",
    ]

    def __init__(self):
        self._model = None
        self._device: str | None = None
        self._error: str | None = None
        self._prepared_hash: str | None = None

    def is_available(self) -> bool:
        try:
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS  # noqa: F401

            return True
        except ImportError:
            self._error = (
                "Chatterbox가 설치되지 않았습니다. "
                "pip install chatterbox-tts 로 설치하세요."
            )
            return False

    def initialize(self) -> None:
        if self._model is not None:
            return
        try:
            import torch
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS

            if torch.cuda.is_available():
                self._device = "cuda"
            elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                self._device = "mps"
            else:
                self._device = "cpu"

            import perth
            from chatterbox.models.t3 import llama_configs

            if perth.PerthImplicitWatermarker is None:
                perth.PerthImplicitWatermarker = perth.DummyWatermarker

            if "attn_implementation" in llama_configs.LLAMA_520M_CONFIG_DICT:
                llama_configs.LLAMA_520M_CONFIG_DICT["attn_implementation"] = "eager"

            _original_load = torch.load

            def _safe_load(*args, **kwargs):
                kwargs.setdefault("map_location", self._device)
                kwargs["weights_only"] = False
                return _original_load(*args, **kwargs)

            torch.load = _safe_load
            try:
                self._model = ChatterboxMultilingualTTS.from_pretrained(
                    device=self._device
                )
            finally:
                torch.load = _original_load
        except Exception as e:
            self._error = f"Chatterbox 모델 로드 실패: {e}"
            raise

    def prepare_voice(self, speaker_wav: Path, exaggeration: float = 0.5, **kwargs) -> bool:
        if self._model is None:
            self.initialize()

        voice_hash = _file_hash(speaker_wav)
        if voice_hash == self._prepared_hash:
            return False

        self._model.prepare_conditionals(str(speaker_wav), exaggeration=exaggeration)
        self._prepared_hash = voice_hash
        return True

    @property
    def voice_prepared(self) -> bool:
        return (
            self._prepared_hash is not None
            and self._model is not None
            and self._model.conds is not None
        )

    def save_voice_embedding(self, save_path: Path) -> None:
        if self._model is None or self._model.conds is None:
            raise RuntimeError("저장할 음성 임베딩이 없습니다. 먼저 음성을 클론하세요.")

        import torch

        torch.save(self._model.conds, str(save_path))

    def load_voice_embedding(self, load_path: Path) -> None:
        if self._model is None:
            self.initialize()

        import torch

        self._model.conds = torch.load(
            str(load_path), map_location=self._device, weights_only=False
        )
        self._prepared_hash = f"preset_{load_path.stem}"

    def synthesize(
        self,
        text: str,
        speaker_wavs: list[Path],
        language: str,
        output_path: Path,
        exaggeration: float = 0.5,
        cfg_weight: float = 0.5,
        temperature: float = 0.8,
        repetition_penalty: float = 2.0,
        min_p: float = 0.05,
        top_p: float = 1.0,
        speed: float = 1.0,
        pitch_semitones: float = 0.0,
        **kwargs,
    ) -> dict:
        if self._model is None:
            self.initialize()

        import torchaudio

        start = time.time()

        if not speaker_wavs and not self.voice_prepared:
            raise RuntimeError("Chatterbox는 Voice Cloning용 참조 음성이 필요합니다.")

        # Always go through prepare_conditionals for reliable caching.
        # This ensures model.conds is properly set before generate().
        voice_cached = True
        if speaker_wavs:
            voice_hash = _file_hash(speaker_wavs[0])
            if voice_hash != self._prepared_hash:
                self._model.prepare_conditionals(
                    str(speaker_wavs[0]), exaggeration=exaggeration
                )
                self._prepared_hash = voice_hash
                voice_cached = False

        lang_id = CHATTERBOX_LANG_MAP.get(language, "en")

        # audio_prompt_path=None — always use cached conds from prepare_conditionals
        wav = self._model.generate(
            text,
            audio_prompt_path=None,
            language_id=lang_id,
            exaggeration=exaggeration,
            cfg_weight=cfg_weight,
            temperature=temperature,
            repetition_penalty=repetition_penalty,
            min_p=min_p,
            top_p=top_p,
        )

        sample_rate = self._model.sr

        # Post-process: apply speed/pitch for voice concept variation
        if speed != 1.0 or pitch_semitones != 0:
            wav = self.post_process_audio(wav, sample_rate, speed, pitch_semitones)

        torchaudio.save(str(output_path), wav, sample_rate)

        processing_time = time.time() - start
        duration = wav.shape[-1] / sample_rate

        return {
            "duration_seconds": round(duration, 2),
            "processing_time_seconds": round(processing_time, 2),
            "sample_rate": sample_rate,
            "voice_cached": voice_cached,
        }

    def get_error_message(self) -> str | None:
        return self._error
