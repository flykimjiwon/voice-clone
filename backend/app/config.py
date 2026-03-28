import os
from pathlib import Path

# ─── Directories ───
BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "outputs"
VOICE_PRESETS_DIR = BASE_DIR / "voice_presets"

UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)
VOICE_PRESETS_DIR.mkdir(exist_ok=True)

# ─── Upload / Audio ───
MAX_UPLOAD_SIZE = 50 * 1024 * 1024
ALLOWED_AUDIO_EXTENSIONS = frozenset({".wav", ".mp3", ".flac", ".ogg", ".m4a", ".webm"})
OUTPUT_SAMPLE_RATE = 22050

# ─── Server ───
TTS_EXECUTOR_WORKERS = 2
LOG_BUFFER_MAXLEN = 500
SSE_PING_TIMEOUT = 30
CORS_ORIGINS = os.environ.get(
    "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",")

# ─── Fish Speech ───
FISH_SPEECH_URL = os.environ.get("FISH_SPEECH_URL", "http://localhost:8080")
FISH_SPEECH_HEALTH_TIMEOUT = 2
FISH_SPEECH_SYNTH_TIMEOUT = 300
