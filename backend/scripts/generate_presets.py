#!/usr/bin/env python3
"""Batch voice preset generator for Chatterbox TTS."""

import argparse
import importlib
import json
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Protocol, TypedDict, cast


class ManifestEntry(TypedDict, total=False):
    filename: str
    name: str
    gender: str
    age_group: str
    tone: str
    language: str
    description: str


class ChatterboxEngineProtocol(Protocol):
    def initialize(self) -> None: ...

    def prepare_voice(self, speaker_wav: Path, exaggeration: float = 0.5) -> bool: ...

    def save_voice_embedding(self, save_path: Path) -> None: ...

    def synthesize(
        self,
        text: str,
        speaker_wavs: list[Path],
        language: str,
        output_path: Path,
        **params: Any,
    ) -> dict[str, Any]: ...


MetadataValue = str | bool | float | None


# ─── CLI args ───
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Batch voice preset generator")
    parser.add_argument(
        "--input-dir",
        required=True,
        help="Directory containing source WAV files referenced by manifest",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Output directory for generated preset files (defaults to ../voice_presets)",
    )
    parser.add_argument(
        "--manifest",
        required=True,
        help="JSON manifest file with preset source entries",
    )
    parser.add_argument(
        "--exaggeration",
        type=float,
        default=0.5,
        help="Exaggeration value used during voice preparation",
    )
    parser.add_argument(
        "--preview-text",
        default="안녕하세요. 이것은 음성 프리셋 미리듣기입니다.",
        help="Text used to generate preset preview audio",
    )
    parser.add_argument(
        "--preview-lang",
        default="ko",
        help="Language code used for preview synthesis",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate manifest and input files without loading TTS model",
    )
    parser.add_argument(
        "--no-preview",
        action="store_true",
        help="Skip preview audio generation",
    )
    return parser.parse_args()


def _load_manifest(manifest_path: Path) -> list[ManifestEntry]:
    if not manifest_path.exists():
        print(f"ERROR: Manifest not found: {manifest_path}", file=sys.stderr)
        sys.exit(1)
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"ERROR: Invalid manifest JSON: {exc}", file=sys.stderr)
        sys.exit(1)
    if not isinstance(data, list):
        print("ERROR: Manifest must be a JSON array", file=sys.stderr)
        sys.exit(1)
    entries: list[ManifestEntry] = []
    for item in data:
        if isinstance(item, dict):
            entry: ManifestEntry = {}
            filename = item.get("filename")
            if isinstance(filename, str):
                entry["filename"] = filename
            for key in (
                "name",
                "gender",
                "age_group",
                "tone",
                "language",
                "description",
            ):
                value = item.get(key)
                if isinstance(value, str):
                    entry[key] = value
            entries.append(entry)
    return entries


# ─── Main ───
def main() -> None:
    args = parse_args()

    manifest_value = getattr(args, "manifest")
    input_dir_value = getattr(args, "input_dir")
    output_dir_value = getattr(args, "output_dir")
    exaggeration_value = getattr(args, "exaggeration")
    preview_text_value = getattr(args, "preview_text")
    preview_lang_value = getattr(args, "preview_lang")
    dry_run_value = getattr(args, "dry_run")
    no_preview_value = getattr(args, "no_preview")

    manifest_arg = str(manifest_value)
    input_dir_arg = str(input_dir_value)
    output_dir_arg = str(output_dir_value) if output_dir_value else None
    exaggeration = float(exaggeration_value)
    preview_text = str(preview_text_value)
    preview_lang = str(preview_lang_value)
    dry_run = bool(dry_run_value)
    no_preview = bool(no_preview_value)

    manifest_path = Path(manifest_arg)
    entries = _load_manifest(manifest_path)
    input_dir = Path(input_dir_arg)

    if output_dir_arg:
        output_dir = Path(output_dir_arg)
    else:
        output_dir = Path(__file__).resolve().parent.parent / "voice_presets"
    output_dir.mkdir(parents=True, exist_ok=True)

    if dry_run:
        print(f"Dry run - validating {len(entries)} entries in manifest")
        found = 0
        for index, entry in enumerate(entries, start=1):
            filename = entry.get("filename")
            if not filename:
                print(f"[{index}/{len(entries)}] MISSING filename field")
                continue
            wav_path = input_dir / filename
            exists = wav_path.exists()
            status = "FOUND" if exists else "MISSING"
            print(f"[{index}/{len(entries)}] {filename}: {status}")
            if exists:
                found += 1
        print(f"Dry run complete: {found}/{len(entries)} files found")
        sys.exit(0)

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    chatterbox_module = importlib.import_module("app.engines.chatterbox_engine")
    chatterbox_engine_cls = cast(
        type[ChatterboxEngineProtocol],
        getattr(chatterbox_module, "ChatterboxEngine"),
    )

    engine: ChatterboxEngineProtocol = chatterbox_engine_cls()
    engine.initialize()

    builtin_metadata: list[dict[str, MetadataValue]] = []
    for index, entry in enumerate(entries, start=1):
        filename = entry.get("filename")
        if not filename:
            print(f"[{index}/{len(entries)}] SKIP: missing filename field")
            continue

        wav_path = input_dir / filename
        if not wav_path.exists():
            print(f"[{index}/{len(entries)}] SKIP: {filename} not found")
            continue

        display_name = entry.get("name", filename)
        print(f"[{index}/{len(entries)}] {display_name} 처리 중...")

        preset_id = str(uuid.uuid4())
        pt_path = output_dir / f"{preset_id}.pt"

        engine.prepare_voice(wav_path, exaggeration=exaggeration)
        engine.save_voice_embedding(pt_path)

        metadata = {
            "id": preset_id,
            "name": display_name,
            "gender": entry.get("gender"),
            "age_group": entry.get("age_group"),
            "tone": entry.get("tone"),
            "language": entry.get("language"),
            "description": entry.get("description"),
            "is_builtin": True,
            "exaggeration": exaggeration,
            "created_at": time.time(),
        }

        if not no_preview:
            preview_path = output_dir / f"{preset_id}_preview.wav"
            try:
                engine.synthesize(
                    preview_text,
                    [],
                    preview_lang,
                    preview_path,
                    exaggeration=exaggeration,
                )
                metadata["preview_audio_url"] = (
                    f"/api/audio-preset-preview/{preset_id}_preview.wav"
                )
            except Exception as exc:
                print(f"  WARNING: Preview generation failed: {exc}")

        meta_path = output_dir / f"{preset_id}.json"
        meta_path.write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        builtin_metadata.append(metadata)
        print(f"  -> Saved: {pt_path.name}")

    builtin_manifest_path = output_dir / "builtin_manifest.json"
    builtin_manifest_path.write_text(
        json.dumps(builtin_metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"\nDone. {len(builtin_metadata)}/{len(entries)} presets generated.")
    print(f"Builtin manifest: {builtin_manifest_path}")


if __name__ == "__main__":
    main()
