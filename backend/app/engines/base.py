from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path


class TTSEngine(ABC):
    engine_id: str
    engine_name: str
    description: str
    supports_voice_cloning: bool = True
    supported_languages: list[str] = []

    @abstractmethod
    def is_available(self) -> bool:
        pass

    @abstractmethod
    def initialize(self) -> None:
        pass

    @abstractmethod
    def synthesize(
        self,
        text: str,
        speaker_wavs: list[Path],
        language: str,
        output_path: Path,
        **kwargs,
    ) -> dict:
        pass

    # ── Optional voice embedding methods (default no-op) ──

    def prepare_voice(self, speaker_wav: Path, **kwargs) -> bool:
        """Prepare voice embedding from WAV file. Returns True if new, False if cached."""
        return False

    @property
    def voice_prepared(self) -> bool:
        return False

    def save_voice_embedding(self, save_path: Path) -> None:
        """Save voice embedding. save_path uses .pt as stem key ({id}.pt).
        Each engine may derive its own file extension from this stem."""
        raise NotImplementedError(
            f"{self.__class__.__name__}은 프리셋 저장을 지원하지 않습니다."
        )

    def load_voice_embedding(self, load_path: Path) -> None:
        """Load voice embedding. load_path uses .pt as stem key ({id}.pt).
        Each engine derives the actual file path from this stem."""
        raise NotImplementedError(
            f"{self.__class__.__name__}은 프리셋 로드를 지원하지 않습니다."
        )

    def has_saved_embedding(self, embed_path: Path) -> bool:
        """Check if a saved embedding exists. embed_path is the .pt stem key."""
        return embed_path.exists()

    def delete_saved_embedding(self, embed_path: Path) -> None:
        """Delete saved embedding files. embed_path is the .pt stem key."""
        embed_path.unlink(missing_ok=True)

    def get_error_message(self) -> str | None:
        return None
