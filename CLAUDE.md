# Voice Clone - TTS Web Application

Zero-shot voice cloning 웹 애플리케이션. 15초 음성 샘플로 목소리를 복제하고 텍스트를 음성으로 변환합니다.

## Architecture

```
┌─────────────────┐     HTTP/SSE      ┌─────────────────┐     HTTP/msgpack    ┌──────────────────┐
│    Frontend      │ ◄──────────────► │    Backend       │ ◄────────────────► │  Fish Speech S2  │
│  Next.js 16      │   localhost:3077  │  FastAPI         │   localhost:8080   │  (외부 API 서버)  │
│  React 19        │                  │  Python 3.11+    │                    │  fishaudio/s2-pro │
│  Tailwind CSS 4  │                  │                  │                    └──────────────────┘
│  shadcn/ui       │                  │  ┌────────────┐  │
└─────────────────┘                  │  │ Chatterbox  │  │  ← 로컬 모델 (PyTorch)
                                      │  │ TTS Engine  │  │
                                      │  └────────────┘  │
                                      └─────────────────┘
```

### TTS Engines

| Engine | 타입 | 언어 수 | GPU 필요 | 특징 |
|--------|------|---------|----------|------|
| **Chatterbox** | 로컬 모델 (PyTorch) | 15 | 권장 (MPS/CUDA) | 고품질, 임베딩 캐싱 (.pt) |
| **Fish Speech S2** | 원격 API 서버 | 47 | CUDA 필수 (서버측) | 빠른 속도, msgpack 통신 |

### Backend (FastAPI)

```
backend/
├── app/
│   ├── main.py              # FastAPI app, CORS, lifespan, static mounts
│   ├── config.py            # 설정 (경로, 업로드 제한, Fish Speech URL)
│   ├── schemas.py           # Pydantic 모델
│   ├── log_stream.py        # SSE 실시간 로그 스트리밍
│   ├── engines/
│   │   ├── base.py          # TTSEngine 추상 클래스 (Strategy 패턴)
│   │   ├── chatterbox_engine.py  # Chatterbox (로컬, .pt 임베딩)
│   │   └── fish_speech_engine.py # Fish Speech (HTTP API, .ref.wav + .transcript)
│   └── routers/
│       ├── tts.py           # 음성 업로드/준비/합성/프리셋 CRUD
│       └── vocal.py         # 음역대 분석, 곡 추천
├── scripts/
│   └── generate_presets.py  # 빌트인 프리셋 배치 생성
├── uploads/                 # 런타임: 업로드된 음성 파일
├── outputs/                 # 런타임: 생성된 TTS 오디오
└── voice_presets/           # 프리셋 저장 (.pt/.ref.wav/.json)
```

### Frontend (Next.js)

```
frontend/src/
├── app/
│   ├── page.tsx             # 메인 페이지 (엔진 선택, 큐, 스트리밍)
│   ├── layout.tsx           # ThemeProvider, TooltipProvider
│   └── globals.css          # Tailwind v4 + OKLCH 테마
├── components/
│   ├── VoiceUploader.tsx    # 파일 업로드 + 브라우저 녹음
│   ├── VoicePresetPanel.tsx # 프리셋 CRUD + 필터링
│   ├── ParamsPanel.tsx      # 엔진별 합성 파라미터
│   ├── VocalAnalysisPanel.tsx # 음역대 분석 + 곡 추천
│   ├── AudioPlayer.tsx      # 재생 컨트롤 (배속 지원)
│   ├── ServerLogModal.tsx   # SSE 실시간 로그 뷰어
│   └── ui/                  # shadcn/ui 컴포넌트
└── lib/
    ├── api.ts               # Backend API 클라이언트
    ├── types.ts             # TypeScript 인터페이스
    └── split-sentences.ts   # 문장 분리 유틸
```

## Development

### Quick Start (로컬)

```bash
# Backend
cd backend && python3.11 -m venv venv && source venv/bin/activate
pip install -r requirements.txt && pip install chatterbox-tts
PYTORCH_ENABLE_MPS_FALLBACK=1 uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend (별도 터미널)
cd frontend && npm install && npm run dev  # localhost:3077
```

### Docker (NVIDIA GPU)

```bash
docker-compose up --build  # backend:8000, fish-speech:8080, frontend:3000
```

### Ports

| Service | 로컬 개발 | Docker |
|---------|----------|--------|
| Frontend | 3077 | 3000 |
| Backend | 8000 | 8000 |
| Fish Speech | 8080 | 8080 |

### Environment Variables

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Frontend → Backend URL |
| `FISH_SPEECH_URL` | `http://localhost:8080` | Backend → Fish Speech URL |
| `CORS_ORIGINS` | `localhost:3000,3077` | 허용 CORS origins |
| `PYTORCH_ENABLE_MPS_FALLBACK` | — | Apple Silicon MPS 폴백 |

## API Endpoints

### Engine & Health
- `GET /health` — 서버 상태
- `GET /api/engines` — 전체 엔진 상태
- `GET /api/engine?engine_id=` — 단일 엔진 상태

### Voice & Synthesis
- `POST /api/upload-voice` — 음성 파일 업로드 (WAV/MP3/FLAC/OGG/M4A/WebM, max 50MB)
- `POST /api/prepare-voice` — 음성 임베딩 준비 (engine_id, voice_id, exaggeration, transcript)
- `POST /api/synthesize` — 텍스트→음성 합성 (text, language, engine_id, 파라미터들)
- `GET /api/audio/{filename}` — 생성된 오디오 다운로드

### Presets
- `GET /api/voice-presets` — 프리셋 목록 (?gender=, ?language=, ?engine=)
- `POST /api/voice-presets` — 프리셋 저장
- `POST /api/voice-presets/{id}/load` — 프리셋 로드
- `DELETE /api/voice-presets/{id}` — 프리셋 삭제

### Vocal Analysis
- `GET /api/vocal/analyze` — 음역대 분석 (?voice_id= 또는 ?preset_id=)
- `GET /api/vocal/songs` — 곡 추천 (?low_hz=, ?high_hz=, ?language=)

### Logs
- `GET /api/logs/stream` — SSE 실시간 로그
- `GET /api/logs/recent?n=50` — 최근 로그

## Coding Conventions

- **Backend**: FastAPI + Pydantic v2, async handlers, ThreadPoolExecutor for synthesis
- **Frontend**: React 19 hooks only (no Redux/Zustand), "use client" throughout
- **Styling**: Tailwind CSS v4 + shadcn/ui, dark mode default
- **Engine pattern**: Strategy pattern via `TTSEngine` abstract base class (`engines/base.py`)
- **Voice storage**: Chatterbox=`.pt` tensors, Fish Speech=`.ref.wav`+`.transcript` files
- **State**: File-based (no DB), in-memory caching for embeddings
- **Logging**: SSE streaming via `log_stream.py`, max 500 entries buffer

## Known Issues

- `page.tsx` is ~1085 lines — candidate for component extraction
- No auth/rate-limiting on API endpoints
- No persistent job queue (in-memory only)
- Dockerfile.backend installs legacy engines (CosyVoice, Coqui TTS) that are no longer used
- Frontend dev port (3077) differs from Docker port (3000)
