import uuid
import asyncio
import json
import subprocess
import time
from pathlib import Path
from typing import Optional
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import FileResponse

from ..config import (
    UPLOAD_DIR,
    OUTPUT_DIR,
    VOICE_PRESETS_DIR,
    ALLOWED_AUDIO_EXTENSIONS,
    FISH_SPEECH_URL,
    MAX_UPLOAD_SIZE,
)
from ..schemas import (
    EngineStatusResponse,
    EngineListResponse,
    SynthesizeResponse,
    UploadVoiceResponse,
    VoicePresetResponse,
    VoicePresetListResponse,
)
from ..engines.base import TTSEngine
from ..engines.chatterbox_engine import ChatterboxEngine
from ..engines.fish_speech_engine import FishSpeechEngine
from ..log_stream import log_buffer

router = APIRouter(prefix="/api", tags=["tts"])

_engines: dict[str, TTSEngine] = {
    "chatterbox": ChatterboxEngine(),
    "fish_speech": FishSpeechEngine(server_url=FISH_SPEECH_URL),
}
_executor = ThreadPoolExecutor(max_workers=2)


def _get_engine(engine_id: str) -> TTSEngine:
    engine = _engines.get(engine_id)
    if not engine:
        raise HTTPException(
            status_code=400,
            detail=f"알 수 없는 엔진: '{engine_id}'. 지원 엔진: {list(_engines.keys())}",
        )
    return engine


def _emit_progress(engine_id: str, percent: int, stage: str) -> None:
    log_buffer.push_sync(
        json.dumps({"engine_id": engine_id, "percent": percent, "stage": stage}),
        "PROGRESS",
    )


def _emit_log(engine_id: str, msg: str, level: str = "INFO") -> None:
    log_buffer.push_sync(
        json.dumps({"engine_id": engine_id, "text": msg}),
        f"ENGINE_{level}",
    )


# ─── Engine status ───


@router.get("/engines", response_model=EngineListResponse)
async def list_engines():
    """모든 엔진 상태 반환."""
    return EngineListResponse(
        engines=[
            EngineStatusResponse(
                engine_id=eid,
                available=e.is_available(),
                name=e.engine_name,
                description=e.description,
                supported_languages=e.supported_languages,
                supports_voice_cloning=e.supports_voice_cloning,
                voice_prepared=e.voice_prepared,
                error=e.get_error_message(),
            )
            for eid, e in _engines.items()
        ]
    )


@router.get("/engine", response_model=EngineStatusResponse)
async def engine_status(engine_id: str = Query("chatterbox")):
    """단일 엔진 상태 반환."""
    engine = _get_engine(engine_id)
    return EngineStatusResponse(
        engine_id=engine_id,
        available=engine.is_available(),
        name=engine.engine_name,
        description=engine.description,
        supported_languages=engine.supported_languages,
        supports_voice_cloning=engine.supports_voice_cloning,
        voice_prepared=engine.voice_prepared,
        error=engine.get_error_message(),
    )


# ─── Voice prepare ───


@router.post("/prepare-voice")
async def prepare_voice(
    engine_id: str = Form("chatterbox"),
    voice_id: str = Form(""),
    voice_ids: str = Form(""),
    exaggeration: float = Form(0.5),
    transcript: str = Form(""),
):
    if not (0.0 <= exaggeration <= 5.0):
        raise HTTPException(status_code=400, detail="exaggeration은 0~5 범위여야 합니다.")

    engine = _get_engine(engine_id)
    if not engine.is_available():
        raise HTTPException(
            status_code=503,
            detail=f"{engine.engine_name} 사용 불가: {engine.get_error_message()}",
        )

    ids_str = voice_ids if voice_ids else voice_id
    if not ids_str:
        raise HTTPException(status_code=400, detail="voice_id가 필요합니다.")

    speaker_wavs = _find_voice_files(ids_str)
    if not speaker_wavs:
        raise HTTPException(status_code=404, detail="음성 파일을 찾을 수 없습니다.")

    def _run() -> bool:
        _emit_progress(engine_id, 5, "모델 초기화 중...")
        engine.initialize()
        _emit_progress(engine_id, 30, "음성 임베딩 추출 중...")
        _emit_log(engine_id, "참조 음성 임베딩 준비 시작")
        was_new = engine.prepare_voice(
            speaker_wavs[0],
            exaggeration=exaggeration,
            transcript=transcript,
        )
        _emit_progress(engine_id, 100, "준비 완료")
        if was_new:
            _emit_log(engine_id, "음성 임베딩 추출 완료 — 캐싱됨")
        else:
            _emit_log(engine_id, "이미 캐싱된 음성 임베딩 사용")
        return was_new

    loop = asyncio.get_event_loop()
    try:
        was_new = await loop.run_in_executor(_executor, _run)
    except Exception as e:
        _emit_progress(engine_id, -1, f"에러: {str(e)[:100]}")
        _emit_log(engine_id, f"에러: {str(e)}", "ERROR")
        raise HTTPException(status_code=500, detail=str(e))

    return {"prepared": True, "was_new": was_new}


# ─── Voice upload ───


@router.post("/upload-voice", response_model=UploadVoiceResponse)
async def upload_voice(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="파일명이 없습니다.")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"지원하지 않는 형식입니다. 지원: {', '.join(ALLOWED_AUDIO_EXTENSIONS)}",
        )

    voice_id = str(uuid.uuid4())
    raw_path = UPLOAD_DIR / f"{voice_id}{ext}"

    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"파일이 너무 큽니다. (최대 {MAX_UPLOAD_SIZE // (1024 * 1024)}MB)",
        )
    with open(raw_path, "wb") as f:
        f.write(content)

    if ext != ".wav":
        wav_path = UPLOAD_DIR / f"{voice_id}.wav"
        try:
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    str(raw_path),
                    "-ar",
                    "22050",
                    "-ac",
                    "1",
                    str(wav_path),
                ],
                capture_output=True,
                check=True,
            )
            raw_path.unlink(missing_ok=True)
        except subprocess.CalledProcessError as e:
            raw_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=500,
                detail=f"오디오 변환 실패: {e.stderr.decode()[:200]}",
            )
        save_path = wav_path
    else:
        save_path = raw_path

    duration = _get_audio_duration(save_path)

    return UploadVoiceResponse(
        voice_id=voice_id,
        filename=file.filename,
        duration_seconds=duration,
    )


# ─── Synthesize ───


@router.post("/synthesize", response_model=SynthesizeResponse)
async def synthesize(
    engine_id: str = Form("chatterbox"),
    text: str = Form(...),
    language: str = Form("ko"),
    voice_id: str = Form(""),
    voice_ids: str = Form(""),
    transcript: str = Form(""),
    exaggeration: float = Form(0.5),
    cfg_weight: float = Form(0.5),
    temperature: float = Form(0.8),
    repetition_penalty: float = Form(2.0),
    min_p: float = Form(0.05),
    top_p: float = Form(1.0),
    chunk_length: int = Form(200),
    speed: float = Form(1.0),
    pitch_semitones: float = Form(0.0),
):
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="텍스트가 비어 있습니다.")
    if len(text) > 5000:
        raise HTTPException(status_code=400, detail="텍스트가 너무 깁니다. (최대 5000자)")
    if not (0.0 <= exaggeration <= 5.0):
        raise HTTPException(status_code=400, detail="exaggeration은 0~5 범위여야 합니다.")
    if not (0.0 < temperature <= 5.0):
        raise HTTPException(status_code=400, detail="temperature는 0 초과 5 이하여야 합니다.")
    if not (0.1 <= speed <= 3.0):
        raise HTTPException(status_code=400, detail="speed는 0.1~3.0 범위여야 합니다.")

    engine = _get_engine(engine_id)
    if not engine.is_available():
        raise HTTPException(
            status_code=503,
            detail=f"{engine.engine_name} 사용 불가: {engine.get_error_message()}",
        )

    ids_str = voice_ids if voice_ids else voice_id
    speaker_wavs: list[Path] = []

    if ids_str:
        speaker_wavs = _find_voice_files(ids_str)
        if not speaker_wavs:
            raise HTTPException(
                status_code=404, detail="업로드된 음성 파일을 찾을 수 없습니다."
            )
    elif not engine.voice_prepared:
        raise HTTPException(
            status_code=400,
            detail="voice_id가 없고 로드된 음성 프리셋도 없습니다.",
        )

    output_id = str(uuid.uuid4())
    output_path = OUTPUT_DIR / f"{output_id}.wav"

    params = {
        "transcript": transcript,
        "exaggeration": exaggeration,
        "cfg_weight": cfg_weight,
        "temperature": temperature,
        "repetition_penalty": repetition_penalty,
        "min_p": min_p,
        "top_p": top_p,
        "chunk_length": chunk_length,
        "speed": speed,
        "pitch_semitones": pitch_semitones,
    }

    def _run() -> dict:
        _emit_progress(engine_id, 5, "모델 초기화 중...")
        _emit_log(engine_id, f"{engine.engine_name} 초기화 시작")
        engine.initialize()
        cached = engine.voice_prepared and not speaker_wavs
        if cached:
            _emit_progress(engine_id, 20, "프리셋 음성으로 즉시 합성...")
            _emit_log(engine_id, "프리셋 음성 임베딩 사용 — 참조 음성 처리 완전 스킵")
        else:
            _emit_progress(engine_id, 20, "음성 합성 시작...")
        _emit_log(engine_id, f"텍스트 길이: {len(text)}자, 언어: {language}")
        result = engine.synthesize(text, speaker_wavs, language, output_path, **params)
        _emit_progress(engine_id, 100, "완료")
        _emit_log(
            engine_id,
            f"완료 — {result['processing_time_seconds']}초, "
            f"{result['duration_seconds']}초 오디오 생성",
        )
        return result

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(_executor, _run)
    except Exception as e:
        _emit_progress(engine_id, -1, f"에러: {str(e)[:100]}")
        _emit_log(engine_id, f"에러: {str(e)}", "ERROR")
        raise HTTPException(status_code=500, detail=str(e))

    return SynthesizeResponse(
        audio_url=f"/api/audio/{output_id}.wav",
        duration_seconds=result["duration_seconds"],
        processing_time_seconds=result["processing_time_seconds"],
        sample_rate=result["sample_rate"],
        voice_cached=result.get("voice_cached", False),
    )


# ─── Voice presets ───


@router.get("/voice-presets", response_model=VoicePresetListResponse)
async def list_voice_presets(
    gender: Optional[str] = Query(None),
    language: Optional[str] = Query(None),
    engine: Optional[str] = Query(None),
):
    presets = []
    for json_path in sorted(VOICE_PRESETS_DIR.glob("*.json"), reverse=True):
        try:
            data = json.loads(json_path.read_text())
            preset = VoicePresetResponse(**data)
        except Exception:
            continue

        if gender is not None and preset.gender != gender:
            continue
        if language is not None and preset.language != language:
            continue
        if engine is not None and preset.engine_id != engine:
            continue

        presets.append(preset)
    return VoicePresetListResponse(presets=presets)


@router.post("/voice-presets", response_model=VoicePresetResponse)
async def save_voice_preset(
    name: str = Form(...),
    engine_id: str = Form("chatterbox"),
    gender: Optional[str] = Form(None),
    age_group: Optional[str] = Form(None),
    tone: Optional[str] = Form(None),
    language: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    exaggeration_val: Optional[float] = Form(None),
):
    if not name or not name.strip():
        raise HTTPException(status_code=400, detail="프리셋 이름이 비어 있습니다.")
    if len(name) > 100:
        raise HTTPException(status_code=400, detail="프리셋 이름이 너무 깁니다. (최대 100자)")

    engine = _get_engine(engine_id)
    if not engine.voice_prepared:
        raise HTTPException(
            status_code=400,
            detail="저장할 음성 임베딩이 없습니다. 먼저 음성을 업로드하고 생성하세요.",
        )

    preset_id = str(uuid.uuid4())
    pt_path = VOICE_PRESETS_DIR / f"{preset_id}.pt"
    meta_path = VOICE_PRESETS_DIR / f"{preset_id}.json"

    def _run() -> None:
        engine.save_voice_embedding(pt_path)

    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(_executor, _run)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    metadata: dict = {
        "id": preset_id,
        "name": name,
        "created_at": time.time(),
        "engine_id": engine_id,
    }
    for key, val in [
        ("gender", gender),
        ("age_group", age_group),
        ("tone", tone),
        ("language", language),
        ("description", description),
        ("exaggeration", exaggeration_val),
    ]:
        if val is not None:
            metadata[key] = val

    meta_path.write_text(json.dumps(metadata, ensure_ascii=False))

    _emit_log(engine_id, f"음성 프리셋 저장: {name}")
    return VoicePresetResponse(**metadata)


@router.post("/voice-presets/{preset_id}/load")
async def load_voice_preset(preset_id: str):
    pt_path = VOICE_PRESETS_DIR / f"{preset_id}.pt"
    meta_path = VOICE_PRESETS_DIR / f"{preset_id}.json"

    if not meta_path.exists():
        raise HTTPException(status_code=404, detail="음성 프리셋을 찾을 수 없습니다.")

    meta = json.loads(meta_path.read_text())
    engine_id = meta.get("engine_id", "chatterbox")
    engine = _get_engine(engine_id)

    if not engine.has_saved_embedding(pt_path):
        raise HTTPException(
            status_code=404, detail="음성 임베딩 파일을 찾을 수 없습니다."
        )

    def _run() -> None:
        _emit_progress(engine_id, 5, "모델 초기화 중...")
        engine.initialize()
        _emit_progress(engine_id, 30, "음성 프리셋 로딩 중...")
        engine.load_voice_embedding(pt_path)
        _emit_progress(engine_id, 100, "프리셋 로드 완료")

    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(_executor, _run)
    except Exception as e:
        _emit_progress(engine_id, -1, f"에러: {str(e)[:100]}")
        raise HTTPException(status_code=500, detail=str(e))

    _emit_log(engine_id, f"음성 프리셋 로드: {meta.get('name', preset_id)}")
    return {"loaded": True, "preset_id": preset_id, "engine_id": engine_id}


@router.delete("/voice-presets/{preset_id}")
async def delete_voice_preset(preset_id: str):
    pt_path = VOICE_PRESETS_DIR / f"{preset_id}.pt"
    meta_path = VOICE_PRESETS_DIR / f"{preset_id}.json"

    if not meta_path.exists():
        raise HTTPException(status_code=404, detail="음성 프리셋을 찾을 수 없습니다.")

    name = "unknown"
    engine_id = "chatterbox"
    try:
        data = json.loads(meta_path.read_text())
        name = data.get("name", name)
        engine_id = data.get("engine_id", "chatterbox")
        if data.get("is_builtin", False):
            raise HTTPException(
                status_code=403, detail="내장 프리셋은 삭제할 수 없습니다."
            )
    except HTTPException:
        raise
    except Exception:
        pass

    # Use engine-specific delete (handles different file formats per engine)
    engine = _engines.get(engine_id)
    if engine:
        engine.delete_saved_embedding(pt_path)
    else:
        pt_path.unlink(missing_ok=True)

    meta_path.unlink(missing_ok=True)

    _emit_log(engine_id, f"음성 프리셋 삭제: {name}")
    return {"deleted": True, "preset_id": preset_id}


# ─── Audio serve ───


@router.get("/audio/{filename}")
async def get_audio(filename: str):
    file_path = (OUTPUT_DIR / filename).resolve()
    if not str(file_path).startswith(str(OUTPUT_DIR.resolve())):
        raise HTTPException(status_code=400, detail="잘못된 파일 경로입니다.")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="오디오 파일을 찾을 수 없습니다.")
    return FileResponse(str(file_path), media_type="audio/wav")


# ─── Helpers ───


def _ensure_wav(path: Path) -> Path:
    if path.suffix.lower() == ".wav":
        return path
    wav_path = path.with_suffix(".wav")
    if wav_path.exists():
        return wav_path
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(path), "-ar", "22050", "-ac", "1", str(wav_path)],
        capture_output=True,
        check=True,
    )
    return wav_path


def _find_voice_file(voice_id: str) -> Optional[Path]:
    wav_path = UPLOAD_DIR / f"{voice_id}.wav"
    if wav_path.exists():
        return wav_path
    for ext in ALLOWED_AUDIO_EXTENSIONS:
        path = UPLOAD_DIR / f"{voice_id}{ext}"
        if path.exists():
            return _ensure_wav(path)
    return None


def _find_voice_files(voice_ids_str: str) -> list[Path]:
    paths = []
    for vid in voice_ids_str.split(","):
        vid = vid.strip()
        if not vid:
            continue
        found = _find_voice_file(vid)
        if found:
            paths.append(found)
    return paths


def _get_audio_duration(path: Path) -> float:
    try:
        import wave

        with wave.open(str(path), "r") as wf:
            return round(wf.getnframes() / float(wf.getframerate()), 2)
    except Exception:
        return 0.0
