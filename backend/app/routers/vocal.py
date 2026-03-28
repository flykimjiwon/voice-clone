"""Vocal range analysis and song recommendation endpoints."""

import asyncio
import math
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..config import UPLOAD_DIR, VOICE_PRESETS_DIR

router = APIRouter(prefix="/api/vocal", tags=["vocal"])

# ─── Musical note helpers ───

NOTE_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")


def hz_to_note(freq: float) -> str:
    """Convert frequency in Hz to musical note name (e.g., 'C4', 'A#3')."""
    if freq <= 0:
        return "N/A"
    semitone = 12 * math.log2(freq / 440.0) + 69
    note_index = round(semitone) % 12
    octave = (round(semitone) // 12) - 1
    return f"{NOTE_NAMES[note_index]}{octave}"


def hz_to_midi(freq: float) -> float:
    if freq <= 0:
        return 0
    return 12 * math.log2(freq / 440.0) + 69


# ─── Vocal range classification ───

VOICE_TYPES = (
    {"type": "베이스 (Bass)", "gender": "male", "low_hz": 82, "high_hz": 330},
    {"type": "바리톤 (Baritone)", "gender": "male", "low_hz": 98, "high_hz": 392},
    {"type": "테너 (Tenor)", "gender": "male", "low_hz": 131, "high_hz": 523},
    {"type": "알토 (Alto)", "gender": "female", "low_hz": 175, "high_hz": 698},
    {"type": "메조소프라노 (Mezzo)", "gender": "female", "low_hz": 196, "high_hz": 880},
    {"type": "소프라노 (Soprano)", "gender": "female", "low_hz": 262, "high_hz": 1047},
)


def classify_voice_type(low_hz: float, high_hz: float) -> list[dict]:
    """Return matching voice type classifications with overlap scores."""
    results = []
    user_range = high_hz - low_hz
    if user_range <= 0:
        return results

    for vt in VOICE_TYPES:
        overlap_low = max(low_hz, vt["low_hz"])
        overlap_high = min(high_hz, vt["high_hz"])
        if overlap_low < overlap_high:
            overlap = overlap_high - overlap_low
            vt_range = vt["high_hz"] - vt["low_hz"]
            score = round((overlap / vt_range) * 100)
            results.append({
                "type": vt["type"],
                "gender": vt["gender"],
                "range": f"{hz_to_note(vt['low_hz'])} ~ {hz_to_note(vt['high_hz'])}",
                "match_percent": min(score, 100),
            })

    results.sort(key=lambda x: x["match_percent"], reverse=True)
    return results


# ─── Song database ───

SONG_DB = (
    # Korean songs
    {"title": "사랑했지만", "artist": "김광석", "low_hz": 131, "high_hz": 440, "language": "ko", "genre": "발라드"},
    {"title": "거리에서", "artist": "성시경", "low_hz": 131, "high_hz": 494, "language": "ko", "genre": "발라드"},
    {"title": "그대에게", "artist": "무한궤도", "low_hz": 147, "high_hz": 523, "language": "ko", "genre": "록"},
    {"title": "Hype Boy", "artist": "NewJeans", "low_hz": 196, "high_hz": 659, "language": "ko", "genre": "팝"},
    {"title": "사건의 지평선", "artist": "윤하", "low_hz": 196, "high_hz": 784, "language": "ko", "genre": "팝"},
    {"title": "밤양갱", "artist": "비비", "low_hz": 175, "high_hz": 587, "language": "ko", "genre": "팝"},
    {"title": "좋은 날", "artist": "IU", "low_hz": 220, "high_hz": 1047, "language": "ko", "genre": "팝"},
    {"title": "첫눈처럼 너에게 가겠다", "artist": "에일리", "low_hz": 196, "high_hz": 880, "language": "ko", "genre": "발라드"},
    {"title": "나의 사랑 나의 곁에", "artist": "김현식", "low_hz": 110, "high_hz": 370, "language": "ko", "genre": "발라드"},
    {"title": "붉은 노을", "artist": "빅뱅", "low_hz": 131, "high_hz": 494, "language": "ko", "genre": "발라드"},
    {"title": "너를 위해", "artist": "임재범", "low_hz": 110, "high_hz": 523, "language": "ko", "genre": "록발라드"},
    {"title": "봄날", "artist": "BTS", "low_hz": 147, "high_hz": 523, "language": "ko", "genre": "팝"},
    {"title": "에잇", "artist": "IU", "low_hz": 196, "high_hz": 659, "language": "ko", "genre": "팝"},
    {"title": "Love Dive", "artist": "IVE", "low_hz": 196, "high_hz": 698, "language": "ko", "genre": "팝"},
    {"title": "Super Shy", "artist": "NewJeans", "low_hz": 185, "high_hz": 622, "language": "ko", "genre": "팝"},
    {"title": "나만 봐", "artist": "태양", "low_hz": 131, "high_hz": 523, "language": "ko", "genre": "R&B"},
    {"title": "모든 날 모든 순간", "artist": "폴킴", "low_hz": 131, "high_hz": 440, "language": "ko", "genre": "발라드"},
    {"title": "비와 당신", "artist": "이무진", "low_hz": 131, "high_hz": 494, "language": "ko", "genre": "발라드"},
    {"title": "취중진담", "artist": "김동률", "low_hz": 131, "high_hz": 392, "language": "ko", "genre": "발라드"},
    {"title": "사랑은 늘 도망가", "artist": "임영웅", "low_hz": 110, "high_hz": 440, "language": "ko", "genre": "트로트"},
    # English songs
    {"title": "Someone Like You", "artist": "Adele", "low_hz": 196, "high_hz": 784, "language": "en", "genre": "Pop"},
    {"title": "Bohemian Rhapsody", "artist": "Queen", "low_hz": 147, "high_hz": 740, "language": "en", "genre": "Rock"},
    {"title": "Yesterday", "artist": "Beatles", "low_hz": 147, "high_hz": 392, "language": "en", "genre": "Pop"},
    {"title": "Perfect", "artist": "Ed Sheeran", "low_hz": 131, "high_hz": 440, "language": "en", "genre": "Pop"},
    {"title": "All of Me", "artist": "John Legend", "low_hz": 147, "high_hz": 523, "language": "en", "genre": "R&B"},
    {"title": "Rolling in the Deep", "artist": "Adele", "low_hz": 196, "high_hz": 880, "language": "en", "genre": "Pop"},
    {"title": "Shallow", "artist": "Lady Gaga", "low_hz": 196, "high_hz": 784, "language": "en", "genre": "Pop"},
    {"title": "Creep", "artist": "Radiohead", "low_hz": 131, "high_hz": 440, "language": "en", "genre": "Rock"},
    {"title": "Fly Me to the Moon", "artist": "Frank Sinatra", "low_hz": 131, "high_hz": 392, "language": "en", "genre": "Jazz"},
    {"title": "Thinking Out Loud", "artist": "Ed Sheeran", "low_hz": 131, "high_hz": 494, "language": "en", "genre": "Pop"},
)


def recommend_songs(low_hz: float, high_hz: float, language: str | None = None) -> list[dict]:
    """Find songs that fit within the user's vocal range."""
    results = []

    for song in SONG_DB:
        if language and song["language"] != language:
            continue

        song_low = song["low_hz"]
        song_high = song["high_hz"]

        # Calculate how well the user's range covers the song's range
        overlap_low = max(low_hz, song_low)
        overlap_high = min(high_hz, song_high)

        if overlap_low >= overlap_high:
            continue

        song_range = song_high - song_low
        overlap = overlap_high - overlap_low
        coverage = overlap / song_range

        # Determine difficulty
        if coverage >= 0.95:
            difficulty = "쉬움"
        elif coverage >= 0.75:
            difficulty = "보통"
        else:
            difficulty = "도전"

        # How many semitones to shift to best fit
        song_center = (hz_to_midi(song_low) + hz_to_midi(song_high)) / 2
        user_center = (hz_to_midi(low_hz) + hz_to_midi(high_hz)) / 2
        key_shift = round(user_center - song_center)

        results.append({
            "title": song["title"],
            "artist": song["artist"],
            "genre": song["genre"],
            "language": song["language"],
            "song_range": f"{hz_to_note(song_low)} ~ {hz_to_note(song_high)}",
            "coverage_percent": round(coverage * 100),
            "difficulty": difficulty,
            "key_shift": key_shift,
            "key_shift_label": f"{'+' if key_shift > 0 else ''}{key_shift}키" if key_shift != 0 else "원키",
        })

    results.sort(key=lambda x: x["coverage_percent"], reverse=True)
    return results


# ─── Pitch analysis ───


def _analyze_pitch(wav_path: Path) -> dict:
    """Analyze vocal pitch range from an audio file using torchaudio."""
    import torch
    import torchaudio

    waveform, sample_rate = torchaudio.load(str(wav_path))

    # Convert to mono
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)

    # Detect pitch using autocorrelation
    pitch = torchaudio.functional.detect_pitch_frequency(
        waveform, sample_rate, freq_low=60, freq_high=1200
    )

    # Filter out zeros (unvoiced) and outliers
    valid = pitch[pitch > 60]
    if valid.numel() == 0:
        raise ValueError("음성에서 피치를 감지할 수 없습니다. 더 긴 샘플을 사용하세요.")

    # Use percentiles to remove outliers
    sorted_pitches = torch.sort(valid)[0]
    n = sorted_pitches.numel()
    low_idx = max(0, int(n * 0.05))
    high_idx = min(n - 1, int(n * 0.95))

    low_hz = float(sorted_pitches[low_idx])
    high_hz = float(sorted_pitches[high_idx])
    median_hz = float(sorted_pitches[n // 2])
    mean_hz = float(valid.mean())

    # Compute range in semitones
    range_semitones = round(12 * math.log2(high_hz / low_hz)) if low_hz > 0 else 0

    return {
        "low_hz": round(low_hz, 1),
        "high_hz": round(high_hz, 1),
        "low_note": hz_to_note(low_hz),
        "high_note": hz_to_note(high_hz),
        "median_hz": round(median_hz, 1),
        "median_note": hz_to_note(median_hz),
        "mean_hz": round(mean_hz, 1),
        "range_semitones": range_semitones,
        "range_octaves": round(range_semitones / 12, 1),
    }


# ─── Endpoints ───


@router.get("/analyze")
async def analyze_vocal_range(
    voice_id: str = Query(""),
    preset_id: str = Query(""),
):
    """Analyze vocal range from an uploaded voice or preset."""
    wav_path: Path | None = None

    if voice_id:
        wav_path = UPLOAD_DIR / f"{voice_id}.wav"
    elif preset_id:
        # Fish Speech presets store .ref.wav
        ref_path = VOICE_PRESETS_DIR / f"{preset_id}.ref.wav"
        if ref_path.exists():
            wav_path = ref_path
        # Chatterbox presets only have .pt (embedding) — no raw audio to analyze

    if not wav_path or not wav_path.exists():
        # Try to find any uploaded wav as fallback
        uploads = sorted(UPLOAD_DIR.glob("*.wav"), key=lambda p: p.stat().st_mtime, reverse=True)
        if uploads:
            wav_path = uploads[0]

    if not wav_path or not wav_path.exists():
        raise HTTPException(
            status_code=400,
            detail="분석할 음성 파일이 없습니다. 음성을 먼저 업로드하세요.",
        )

    loop = asyncio.get_running_loop()
    try:
        pitch_data = await loop.run_in_executor(None, _analyze_pitch, wav_path)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"음역대 분석 실패: {e}")

    voice_types = classify_voice_type(pitch_data["low_hz"], pitch_data["high_hz"])

    return {
        "pitch": pitch_data,
        "voice_types": voice_types,
    }


@router.get("/songs")
async def get_song_recommendations(
    low_hz: float = Query(...),
    high_hz: float = Query(...),
    language: Optional[str] = Query(None),
):
    """Get song recommendations based on vocal range."""
    if low_hz <= 0 or high_hz <= low_hz:
        raise HTTPException(status_code=400, detail="유효하지 않은 음역대입니다.")

    songs = recommend_songs(low_hz, high_hz, language)
    return {"songs": songs, "total": len(songs)}
