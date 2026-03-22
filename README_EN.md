# Voice Clone

**Zero-shot Voice Cloning Web Application powered by Chatterbox TTS**

Clone any voice from a single audio file and instantly generate speech in that voice. No training required. Save cloned voices as presets for instant reuse.

![Dark Mode](dark-mode-full.png)
![Light Mode](light-mode-full.png)

---

## Core Features

| Feature | Description |
|---|---|
| **Zero-shot Voice Cloning** | Clone any voice instantly from a 15-second audio sample—no training, no fine-tuning required |
| **Voice Concepts** | Create multiple voice personas from one cloned voice: adjust speed (0.5x–2.0x) and pitch (−12 to +12 semitones) to generate variations |
| **Vocal Range Analysis** | Analyze an uploaded voice to detect pitch range, classify voice type (Bass, Tenor, Alto, Soprano, etc.), and understand vocal characteristics |
| **Song Recommendations** | Get matched song suggestions based on detected vocal range with difficulty ratings and key adjustment guidance |
| **Preset System** | Save cloned voices as reusable presets; includes 14 built-in presets (Korean KSS, English VCTK/LJ Speech, etc.) |
| **Streaming Generation** | Long texts automatically split into sentences and generated + played in real-time without waiting for full completion |
| **Text Queue** | Batch-process multiple texts with status tracking and individual playback |
| **15+ Languages** | Support for Korean, English, Chinese, Japanese, Spanish, French, German, Italian, Portuguese, Arabic, Hindi, Russian, Dutch, Polish, Turkish, Swedish, Danish, Finnish, Greek, Hebrew, Malay, Norwegian, Swahili, and more |
| **Apple Silicon Native** | MPS backend for native GPU acceleration on M1/M2/M3/M4 Mac (2–5× faster than CPU) |
| **Enhanced UX** | Auto-play after generation, auto-focus text input after preset load, Generate button positioned for instant interaction |

---

## Tech Stack

### Backend

| Technology | Version | Purpose |
|---|---|---|
| **Python** | 3.11+ | Runtime |
| **FastAPI** | 0.115+ | REST API server with async support |
| **Uvicorn** | 0.34+ | ASGI application server |
| **Chatterbox TTS** | latest | Resemble AI's Zero-shot Voice Cloning engine (23 languages) |
| **PyTorch** | 2.x+ | Deep learning framework (MPS/CUDA/CPU backends) |
| **torchaudio** | 2.x+ | Audio processing and manipulation |
| **Pydantic** | 2.10+ | Request/response schema validation |
| **SSE-Starlette** | latest | Server-Sent Events for real-time log streaming |
| **aiofiles** | 24.1+ | Asynchronous file I/O operations |

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| **Next.js** | 16.1+ | React framework with App Router |
| **React** | 19.2+ | UI library |
| **TypeScript** | 5.x+ | Type-safe development |
| **Tailwind CSS** | 4.x+ | Utility-first CSS styling |
| **shadcn/ui** | 4.0+ | Accessible component library (Base UI) |
| **next-themes** | 0.4+ | Dark/light mode toggle |
| **Lucide React** | 0.577+ | Icon library |
| **Geist Font** | latest | Vercel's system font (Sans + Mono) |

### Infrastructure

| Technology | Purpose |
|---|---|
| **Docker** | Containerized deployment |
| **Docker Compose** | Multi-service orchestration |

---

## Project Structure

```
voice-clone/
├── backend/
│   ├── app/
│   │   ├── main.py                      # FastAPI app, CORS, SSE log streaming
│   │   ├── config.py                    # Paths, upload limits, sample rate settings
│   │   ├── schemas.py                   # Pydantic request/response models
│   │   ├── log_stream.py                # LogBuffer, SSE subscription, stdout/stderr capture
│   │   ├── engines/
│   │   │   ├── base.py                  # TTSEngine abstract class
│   │   │   ├── chatterbox_engine.py    # Chatterbox engine (23 languages, embedding save/load)
│   │   │   └── fish_speech_engine.py   # Fish Audio S2 engine (optional, CUDA server required)
│   │   └── routers/
│   │       ├── tts.py                   # TTS API endpoints (upload, synthesize, presets)
│   │       └── vocal.py                 # Vocal range analysis & song recommendation endpoints
│   ├── scripts/
│   │   ├── generate_presets.py          # CLI to batch-generate built-in presets
│   │   ├── preset_manifest.json         # Metadata for 14 presets
│   │   └── PRESET_GUIDE.md              # Curation guidelines for presets
│   ├── curated_clips/                   # WAV clips for preset generation (gitignore)
│   ├── voice_presets/                   # Generated preset files (.pt + .json)
│   ├── uploads/                         # Uploaded audio files (runtime)
│   ├── outputs/                         # Generated TTS audio (runtime)
│   └── requirements.txt                 # Python dependencies
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx                 # Main page (5-section UI layout)
│   │   │   ├── layout.tsx               # ThemeProvider, TooltipProvider
│   │   │   └── globals.css              # CSS variables (light/dark theme), scrollbar styling
│   │   ├── components/
│   │   │   ├── VoiceUploader.tsx        # File upload + browser microphone recording
│   │   │   ├── VoicePresetPanel.tsx     # Preset list, load, save, delete operations
│   │   │   ├── ParamsPanel.tsx          # 6 parameter sliders (exaggeration, cfg, temp, etc.)
│   │   │   ├── AudioPlayer.tsx          # Audio playback with waveform visualization
│   │   │   ├── ServerLogModal.tsx       # Real-time server logs via SSE
│   │   │   ├── mode-toggle.tsx          # Dark/light mode toggle
│   │   │   ├── theme-provider.tsx       # next-themes wrapper
│   │   │   └── ui/                      # shadcn/ui components (16+ components)
│   │   └── lib/
│   │       ├── api.ts                   # Typed backend API functions
│   │       ├── types.ts                 # TypeScript interfaces
│   │       ├── utils.ts                 # cn() class utility
│   │       └── split-sentences.ts       # Sentence splitter (Korean/English)
│   ├── components.json                  # shadcn configuration
│   └── package.json
│
├── docker-compose.yml                   # Docker orchestration
├── Dockerfile.backend                   # Backend Docker image
└── README.md (Korean)                   # This documentation (English: README_EN.md)
```

---

## API Endpoints

### TTS Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Server health check |
| `GET` | `/api/engine` | Engine status (availability, supported languages) |
| `POST` | `/api/upload-voice` | Upload audio file (WAV, MP3, FLAC, OGG, M4A, WebM) |
| `POST` | `/api/prepare-voice` | Pre-compute voice embedding for faster synthesis |
| `POST` | `/api/synthesize` | Generate speech from text with voice, params, speed, pitch |
| `GET` | `/api/audio/{filename}` | Download generated audio file |
| `GET` | `/api/voice-presets` | List presets (filter by `?gender=`, `?language=`) |
| `POST` | `/api/voice-presets` | Save current voice as a new preset |
| `POST` | `/api/voice-presets/{id}/load` | Load a preset (apply its embedding) |
| `DELETE` | `/api/voice-presets/{id}` | Delete a preset (built-ins return 403) |

### Vocal Analysis Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/vocal/analyze` | Analyze vocal range from uploaded voice or preset (`?voice_id=` or `?preset_id=`) |
| `GET` | `/api/vocal/songs` | Get song recommendations based on vocal range (`?low_hz=X&high_hz=Y&language=en`) |

### Log Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/logs/stream` | Real-time server logs via Server-Sent Events (SSE) |
| `GET` | `/api/logs/recent` | Fetch recent logs (default: last 50 entries) |

---

## Installation & Setup

### System Requirements

- **macOS** (Apple Silicon M1/M2/M3/M4 recommended) or NVIDIA GPU Linux
- **Python 3.11+**
- **Node.js 18+**
- **ffmpeg** (for audio processing)

### Step 1: Clone Repository

```bash
git clone https://github.com/flykimjiwon/voice-clone.git
cd voice-clone
```

### Step 2: Backend Setup

```bash
cd backend

# Create and activate virtual environment
python3.11 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install base dependencies
pip install -r requirements.txt

# Install Chatterbox TTS
pip install chatterbox-tts

# Install PyTorch + torchaudio (Apple Silicon)
pip install torch torchaudio

# [ALTERNATIVE] PyTorch + torchaudio (NVIDIA GPU)
# pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
```

### Step 3: Frontend Setup

```bash
cd ../frontend

# Install dependencies
npm install

# Verify build
npm run build
```

### Step 4: Run Application

**Terminal 1 — Backend Server:**

```bash
cd backend
source venv/bin/activate
COQUI_TOS_AGREED=1 PYTORCH_ENABLE_MPS_FALLBACK=1 \
  uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

> On first run, Chatterbox model (~2GB) downloads automatically.

**Terminal 2 — Frontend Server:**

```bash
cd frontend
npm run dev
```

**Open Browser:** http://localhost:3000

### Step 5: Docker (Optional)

```bash
# From project root
docker-compose up --build
```

Access at http://localhost:3000 (frontend) and http://localhost:8000 (API)

---

## Usage Guide

### Quick Start: Use Built-in Presets

1. Open the **Voice Presets** panel
2. Select a preset and click **Load**
3. Type your text
4. Click **Generate** or press `Cmd+Enter`
5. Listen to auto-generated audio

### Clone a New Voice

1. Go to **Add New Voice** section
2. Upload an audio file or record from microphone (15+ seconds recommended)
3. Type your text in the input field
4. Click **Generate**
5. Once satisfied, save as a preset:
   - In the **Voice Presets** panel, click **Save as Preset**
   - Enter a name and optional description
   - Click **Save**

### Create Voice Concepts (Speed & Pitch)

Use the **Params Panel** to modify the cloned voice:

- **Speed:** 0.5x (slow) to 2.0x (fast) — adjust speaking rate
- **Pitch:** −12 to +12 semitones — shift the voice up or down musically

Example: Take one cloned voice and create:
- A younger version: increase pitch +5 semitones, speed up to 1.2x
- A deeper version: decrease pitch −7 semitones, slow to 0.8x
- A energetic version: pitch +3, speed 1.5x

### Analyze Vocal Range

1. Upload or record a voice sample
2. Click **Analyze Vocal Range** (in Voice Presets panel or Analysis modal)
3. View results:
   - Detected pitch range (Hz and musical notes)
   - Voice type classification (Bass, Baritone, Tenor, Alto, Mezzo, Soprano)
   - Match percentage for each type
4. Click **Get Song Recommendations** to see songs suited to this range

### Get Song Recommendations

After analyzing a vocal range:
- View songs that fit the detected range
- See difficulty level (Easy, Medium, Challenge)
- Learn required key shift (e.g., "+3 keys", "原key")
- Filter by language (Korean, English, etc.)

### Streaming Generation

When text has 2+ sentences:
- Automatically split into chunks
- Generated and played sentence-by-sentence in real-time
- Progress bar shows completion %
- Can pause/stop mid-generation

### Batch Process with Text Queue

1. Go to **Text Queue** section
2. Add multiple texts
3. Click **Generate All**
4. Each item processes sequentially
5. Play individual items or view status

---

## Synthesis Parameters

Adjust these in the **Params Panel** to fine-tune voice output:

| Parameter | Default | Range | Description |
|---|---|---|---|
| `exaggeration` | 0.5 | 0.0–1.0 | Voice characteristic emphasis (0=flat, 1=exaggerated) |
| `cfg_weight` | 0.5 | 0.0–1.0 | Classifier-free guidance strength (higher = more faithful) |
| `temperature` | 0.8 | 0.1–2.0 | Generation diversity (higher = more variation) |
| `repetition_penalty` | 2.0 | 1.0–5.0 | Suppress repetition (higher = less repeat) |
| `min_p` | 0.05 | 0.0–1.0 | Minimum probability filter (nucleus sampling) |
| `top_p` | 1.0 | 0.0–1.0 | Cumulative probability sampling (nucleus sampling) |
| `speed` | 1.0 | 0.5–2.0 | Speech rate multiplier (for Voice Concepts) |
| `pitch_semitones` | 0.0 | −12 to +12 | Pitch shift in semitones (for Voice Concepts) |

**Tips:**
- **Exaggeration:** Higher values give more personality; too high may sound artificial
- **Temperature:** Lower (0.5–0.7) for consistent, clear speech; higher (1.0+) for varied, expressive speech
- **Repetition Penalty:** Increase if model repeats words/phrases

---

## Generating Built-in Presets

To create preset library from curated voice samples:

```bash
cd backend
source venv/bin/activate

# Place WAV files in ./curated_clips directory, then:
COQUI_TOS_AGREED=1 PYTORCH_ENABLE_MPS_FALLBACK=1 \
  python -m scripts.generate_presets \
    --manifest scripts/preset_manifest.json \
    --input-dir ./curated_clips \
    --exaggeration 0.5 \
    --no-preview
```

### Built-in Presets (14 Total)

| Name | Gender | Language | Source | Voice Type |
|---|---|---|---|---|
| KSS Female Narrator | Female | Korean | KSS Dataset | Professional narrator |
| Warm Female | Female | Korean | KSS Dataset | Warm, friendly |
| Clear Female | Female | Korean | KSS Dataset | Clear, articulate |
| Soft Female | Female | Korean | KSS Dataset | Soft, gentle |
| Female Announcer | Female | English | VCTK p225 | Broadcast announcer |
| Female Narrator | Female | English | VCTK p226 | Audiobook narrator |
| Warm Female Voice | Female | English | LJ Speech | Natural, warm |
| Calm Female Voice | Female | English | LibriSpeech | Calm, measured |
| Expressive Female Voice | Female | English | Common Voice | Expressive, emotional |
| Male Announcer | Male | English | VCTK | Professional announcer |
| Male Narrator | Male | English | VCTK p227 | Deep, engaging |
| Deep Male Voice | Male | English | LibriSpeech | Deep, resonant |
| Male Newsreader | Male | English | LibriSpeech | News broadcast style |
| Documentary Male Voice | Male | English | Common Voice | Documentary narrator |

---

## Environment Variables

Set these before running the application:

| Variable | Default | Required | Description |
|---|---|---|---|
| `COQUI_TOS_AGREED` | — | Yes | Set to `1` to agree with Coqui TTS license |
| `PYTORCH_ENABLE_MPS_FALLBACK` | — | Recommended | Set to `1` for Apple Silicon MPS fallback support |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | No | Backend API base URL (visible to frontend) |
| `UPLOAD_DIR` | `./uploads` | No | Upload directory path |
| `OUTPUT_DIR` | `./outputs` | No | Output audio directory path |
| `VOICE_PRESETS_DIR` | `./voice_presets` | No | Preset storage directory path |

**Example .env file:**

```bash
COQUI_TOS_AGREED=1
PYTORCH_ENABLE_MPS_FALLBACK=1
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Hardware Compatibility

| Environment | Supported | Performance | Notes |
|---|---|---|---|
| **Apple Silicon (M1/M2/M3/M4)** | ✅ Yes | Good | MPS backend, 2–5× slower than NVIDIA but native acceleration |
| **NVIDIA GPU (CUDA)** | ✅ Yes | Excellent | Optimal performance for real-time use |
| **CPU Only** | ✅ Yes | Poor | Very slow (not recommended); generation takes minutes |
| **Intel Mac (CPU)** | ⚠️ Limited | Poor | Falls back to CPU; slow (not recommended) |

### Performance Estimates (Single Sentence, ~50 words)

- **Apple Silicon M1/M2/M3 (MPS):** 2–4 seconds
- **NVIDIA RTX 3060/4060 (CUDA):** 0.5–1 second
- **CPU (Intel i7/M1 Pro):** 10–30 seconds

---

## Supported Languages

Chatterbox TTS supports 23+ languages with zero-shot voice cloning:

| Language | Code | Supported |
|---|---|---|
| Korean | ko | ✅ |
| English | en | ✅ |
| Chinese | zh-cn | ✅ |
| Japanese | ja | ✅ |
| Spanish | es | ✅ |
| French | fr | ✅ |
| German | de | ✅ |
| Italian | it | ✅ |
| Portuguese | pt | ✅ |
| Arabic | ar | ✅ |
| Hindi | hi | ✅ |
| Russian | ru | ✅ |
| Dutch | nl | ✅ |
| Polish | pl | ✅ |
| Turkish | tr | ✅ |
| Swedish | sv | ✅ |
| Danish | da | ✅ |
| Finnish | fi | ✅ |
| Greek | el | ✅ |
| Hebrew | he | ✅ |
| Malay | ms | ✅ |
| Norwegian | no | ✅ |
| Swahili | sw | ✅ |

---

## Troubleshooting

### Backend Issues

**Problem:** `ModuleNotFoundError: No module named 'chatterbox'`
```bash
# Solution: Install Chatterbox TTS explicitly
pip install chatterbox-tts
```

**Problem:** Slow inference on Apple Silicon
```bash
# Ensure MPS fallback is enabled
export PYTORCH_ENABLE_MPS_FALLBACK=1
```

**Problem:** CUDA out of memory (NVIDIA)
```bash
# Reduce chunk_length parameter in Params Panel (default 200 → try 100)
```

### Frontend Issues

**Problem:** API calls fail with CORS error
```bash
# Ensure NEXT_PUBLIC_API_URL points to correct backend
# Check http://localhost:8000/health in browser
```

**Problem:** Audio not playing
```bash
# Verify browser audio permissions
# Try different audio format (WAV vs MP3)
# Check browser console for errors
```

### Voice Cloning Issues

**Problem:** "Cannot detect pitch from voice sample"
```bash
# Use a longer sample (15+ seconds recommended)
# Ensure clear voice (minimize background noise)
# Try different file format (WAV preferred)
```

**Problem:** Generated voice sounds distorted
```bash
# Lower exaggeration parameter (0.5 → 0.3)
# Reduce temperature (0.8 → 0.5)
# Use a cleaner voice sample for cloning
```

---

## Alternative: Fish Audio S2 Engine

This project also supports **Fish Audio S2** TTS engine for comparison (not default):

- Requires separate CUDA server deployment
- See `app/engines/fish_speech_engine.py` for integration
- Chatterbox is recommended for simplicity and multi-language support

---

## License

This project is created for personal learning and research purposes.

- **Chatterbox TTS:** [Resemble AI License](https://github.com/resemble-ai/chatterbox)
- **KSS Dataset:** [CC BY 4.0](https://www.kaggle.com/datasets/bryanpark/korean-single-speaker-speech-dataset)
- **LJ Speech:** Public Domain
- **LibriSpeech:** CC BY 4.0
- **Common Voice:** CC-0

---

## Contributing

Contributions, feedback, and issue reports are welcome. Please open an issue or pull request on GitHub.

---

## Support

For issues, questions, or feature requests:
1. Check existing GitHub issues
2. Review the Troubleshooting section above
3. Open a new issue with:
   - System details (OS, Python version, GPU type)
   - Error message or description
   - Steps to reproduce
   - Screenshots if applicable
