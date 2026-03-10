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

    def get_error_message(self) -> str | None:
        return None
