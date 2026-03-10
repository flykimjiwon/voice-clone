# Voice Clone

**Chatterbox TTS 기반 Zero-shot Voice Cloning 웹 애플리케이션**

음성 파일 하나만으로 누구의 목소리든 복제하고, 텍스트를 입력하면 해당 목소리로 즉시 음성을 생성합니다.
프리셋 시스템으로 한번 클론한 목소리를 저장해두고 반복 사용할 수 있습니다.

![Dark Mode](dark-mode-full.png)
![Light Mode](light-mode-full.png)

---

## 핵심 컨셉

| 컨셉 | 설명 |
|---|---|
| **Zero-shot Voice Cloning** | 별도 학습 없이 15초 분량의 음성 샘플 하나로 즉시 목소리 복제 |
| **프리셋 시스템** | 클론한 음성 임베딩(`.pt`)을 프리셋으로 저장 → 텍스트만 바꿔가며 즉시 재생성 |
| **빌트인 프리셋** | KSS(한국어), LJ Speech, LibriSpeech, Common Voice 등 오픈 데이터셋 기반 사전 구축 프리셋 |
| **스트리밍 생성** | 긴 텍스트를 문장 단위로 분리하여 순차 생성 + 실시간 재생 |
| **텍스트 큐** | 여러 텍스트를 큐에 넣고 배치 생성 |
| **다국어 지원** | 한국어, 영어, 중국어, 일본어, 스페인어, 프랑스어, 독일어 등 23개 언어 |
| **Apple Silicon 네이티브** | MPS 백엔드로 M1/M2/M3 Mac에서 GPU 가속 동작 |

---

## 기술 스택

### Backend

| 기술 | 버전 | 용도 |
|---|---|---|
| **Python** | 3.11 | 런타임 |
| **FastAPI** | 0.115 | REST API 서버 |
| **Uvicorn** | 0.34 | ASGI 서버 |
| **Chatterbox TTS** | latest | Resemble AI의 Zero-shot Voice Cloning 엔진 |
| **PyTorch** | 2.x | 딥러닝 프레임워크 (MPS/CUDA/CPU) |
| **torchaudio** | 2.x | 오디오 처리 및 저장 |
| **Pydantic** | 2.10 | 요청/응답 스키마 검증 |
| **SSE-Starlette** | — | Server-Sent Events (실시간 로그 스트리밍) |
| **aiofiles** | 24.1 | 비동기 파일 I/O |

### Frontend

| 기술 | 버전 | 용도 |
|---|---|---|
| **Next.js** | 16.1 | React 프레임워크 (App Router) |
| **React** | 19.2 | UI 라이브러리 |
| **TypeScript** | 5.x | 타입 안전성 |
| **Tailwind CSS** | 4.x | 유틸리티 기반 스타일링 |
| **shadcn/ui** | 4.0 | UI 컴포넌트 라이브러리 (Base UI 기반) |
| **next-themes** | 0.4 | 다크/라이트 모드 |
| **Lucide React** | 0.577 | 아이콘 |
| **Geist Font** | — | Vercel 공식 폰트 (Sans + Mono) |

### Infrastructure

| 기술 | 용도 |
|---|---|
| **Docker** | 컨테이너화 배포 |
| **Docker Compose** | 멀티 서비스 오케스트레이션 |

---

## 프로젝트 구조

```
voice-clone/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI 앱, CORS, SSE 로그 스트림
│   │   ├── config.py                # 경로, 업로드 제한, 샘플레이트 설정
│   │   ├── schemas.py               # Pydantic 요청/응답 모델
│   │   ├── log_stream.py            # LogBuffer, SSE 구독, stdout/stderr 캡처
│   │   ├── engines/
│   │   │   ├── base.py              # TTSEngine 추상 클래스
│   │   │   └── chatterbox_engine.py # Chatterbox 엔진 (23개 언어, 임베딩 저장/로드)
│   │   └── routers/
│   │       └── tts.py               # 모든 API 엔드포인트 (음성 업로드/합성/프리셋 CRUD)
│   ├── scripts/
│   │   ├── generate_presets.py      # 빌트인 프리셋 일괄 생성 CLI
│   │   ├── preset_manifest.json     # 14개 프리셋 메타데이터 정의
│   │   └── PRESET_GUIDE.md          # 프리셋 큐레이션 가이드
│   ├── curated_clips/               # 프리셋 생성용 WAV 클립 (gitignore)
│   ├── voice_presets/               # 생성된 프리셋 파일 (.pt + .json)
│   ├── uploads/                     # 업로드된 음성 파일 (런타임)
│   ├── outputs/                     # 생성된 TTS 오디오 (런타임)
│   └── requirements.txt             # Python 의존성
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx             # 메인 페이지 (5개 섹션 UI)
│   │   │   ├── layout.tsx           # ThemeProvider, TooltipProvider
│   │   │   └── globals.css          # CSS 변수 (라이트/다크), 스크롤바 테마
│   │   ├── components/
│   │   │   ├── VoiceUploader.tsx     # 파일 업로드 + 브라우저 녹음
│   │   │   ├── VoicePresetPanel.tsx  # 프리셋 목록/로드/저장/삭제
│   │   │   ├── ParamsPanel.tsx       # 6개 파라미터 슬라이더
│   │   │   ├── AudioPlayer.tsx       # 오디오 재생기
│   │   │   ├── ServerLogModal.tsx    # 서버 로그 뷰어 (SSE)
│   │   │   ├── mode-toggle.tsx       # 다크/라이트 모드 토글
│   │   │   ├── theme-provider.tsx    # next-themes 래퍼
│   │   │   └── ui/                   # shadcn/ui 컴포넌트 16개
│   │   └── lib/
│   │       ├── api.ts               # 백엔드 API 함수
│   │       ├── types.ts             # TypeScript 인터페이스
│   │       ├── utils.ts             # cn() 유틸리티
│   │       └── split-sentences.ts   # 문장 분리기 (한국어/영어)
│   ├── components.json              # shadcn 설정
│   └── package.json
│
├── docker-compose.yml               # Docker 오케스트레이션
├── Dockerfile.backend               # 백엔드 Docker 이미지
└── README.md
```

---

## API 엔드포인트

| Method | Endpoint | 설명 |
|---|---|---|
| `GET` | `/health` | 서버 상태 확인 |
| `GET` | `/api/engine` | 엔진 상태 (사용 가능 여부, 지원 언어 등) |
| `POST` | `/api/upload-voice` | 음성 파일 업로드 (WAV, MP3, FLAC, OGG, M4A, WebM) |
| `POST` | `/api/prepare-voice` | 음성 임베딩 사전 준비 |
| `POST` | `/api/synthesize` | 텍스트 → 음성 합성 |
| `GET` | `/api/audio/{filename}` | 생성된 오디오 파일 다운로드 |
| `GET` | `/api/voice-presets` | 프리셋 목록 조회 (`?gender=`, `?language=` 필터) |
| `POST` | `/api/voice-presets` | 현재 음성으로 프리셋 저장 |
| `POST` | `/api/voice-presets/{id}/load` | 프리셋 로드 (임베딩 적용) |
| `DELETE` | `/api/voice-presets/{id}` | 프리셋 삭제 (빌트인은 403) |
| `GET` | `/api/logs/stream` | SSE 실시간 로그 스트림 |
| `GET` | `/api/logs/recent` | 최근 로그 조회 |

---

## 설치 및 실행

### 시스템 요구사항

- **macOS** (Apple Silicon M1/M2/M3 권장) 또는 NVIDIA GPU 탑재 Linux
- **Python 3.11+**
- **Node.js 18+**
- **ffmpeg** (오디오 처리)

### 1. 저장소 클론

```bash
git clone https://github.com/flykimjiwon/voice-clone.git
cd voice-clone
```

### 2. 백엔드 설정

```bash
cd backend

# 가상환경 생성 및 활성화
python3.11 -m venv venv
source venv/bin/activate

# 기본 의존성 설치
pip install -r requirements.txt

# Chatterbox TTS 설치
pip install chatterbox-tts

# PyTorch (Apple Silicon)
pip install torch torchaudio

# PyTorch (NVIDIA GPU)
# pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
```

### 3. 프론트엔드 설정

```bash
cd frontend

# 의존성 설치
npm install

# 개발 빌드 확인
npm run build
```

### 4. 실행

**터미널 1 — 백엔드 서버:**

```bash
cd backend
source venv/bin/activate
COQUI_TOS_AGREED=1 PYTORCH_ENABLE_MPS_FALLBACK=1 uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

> 첫 실행 시 Chatterbox 모델(약 2GB)이 자동 다운로드됩니다.

**터미널 2 — 프론트엔드 서버:**

```bash
cd frontend
npm run dev
```

**브라우저에서 열기:** http://localhost:3000

### 5. Docker로 실행 (선택)

```bash
docker-compose up --build
```

---

## 사용 방법

### 프리셋으로 즉시 생성

1. **음성 프리셋** 탭에서 원하는 프리셋 선택 → "로드"
2. 텍스트 입력
3. "음성 생성" 클릭 또는 `⌘+Enter`

### 새 음성으로 클론 + 생성

1. **새 음성 추가** 섹션에서 음성 파일 업로드 또는 마이크 녹음
2. 텍스트 입력
3. "음성 생성" 클릭
4. 결과가 마음에 들면 → 프리셋 패널에서 이름을 붙여 프리셋으로 저장

### 스트리밍 모드

텍스트가 2문장 이상이면 자동으로 **스트리밍 모드** 활성화:
- 문장 단위로 순차 생성 + 즉시 재생
- 진행률 표시 + 중간 중단 가능

### 텍스트 큐

1. 큐 섹션에서 여러 텍스트 추가
2. "전체 생성"으로 배치 처리
3. 각 항목별 상태 표시 + 개별 재생

---

## 음성 합성 파라미터

| 파라미터 | 기본값 | 범위 | 설명 |
|---|---|---|---|
| `exaggeration` | 0.5 | 0.0 ~ 1.0 | 음성 특징 강조 정도 |
| `cfg_weight` | 0.5 | 0.0 ~ 1.0 | Classifier-free guidance 가중치 |
| `temperature` | 0.8 | 0.1 ~ 2.0 | 생성 다양성 (높을수록 다양) |
| `repetition_penalty` | 2.0 | 1.0 ~ 5.0 | 반복 억제 강도 |
| `min_p` | 0.05 | 0.0 ~ 1.0 | 최소 확률 필터링 |
| `top_p` | 1.0 | 0.0 ~ 1.0 | 누적 확률 기반 샘플링 |

---

## 빌트인 프리셋 생성

사전 구축된 음성 프리셋을 생성하려면:

```bash
cd backend
source venv/bin/activate

# curated_clips/ 디렉토리에 WAV 파일 배치 후:
COQUI_TOS_AGREED=1 PYTORCH_ENABLE_MPS_FALLBACK=1 python -m scripts.generate_presets \
  --manifest scripts/preset_manifest.json \
  --input-dir ./curated_clips \
  --exaggeration 0.5 \
  --no-preview
```

### 프리셋 매니페스트 구성 (14개)

| 이름 | 성별 | 언어 | 소스 |
|---|---|---|---|
| KSS 여성 내레이터 | 여성 | 한국어 | KSS 데이터셋 |
| 따뜻한 여성 | 여성 | 한국어 | KSS 데이터셋 |
| 또렷한 여성 | 여성 | 한국어 | KSS 데이터셋 |
| 부드러운 여성 | 여성 | 한국어 | KSS 데이터셋 |
| Female Announcer | Female | English | VCTK p225 |
| Female Narrator | Female | English | VCTK p226 |
| Warm Female Voice | Female | English | LJ Speech |
| Calm Female Voice | Female | English | LibriSpeech |
| Expressive Female Voice | Female | English | Common Voice |
| Male Announcer | Male | English | VCTK |
| Male Narrator | Male | English | VCTK p227 |
| Deep Male Voice | Male | English | LibriSpeech |
| Male Newsreader | Male | English | LibriSpeech |
| Documentary Male Voice | Male | English | Common Voice |

---

## 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `COQUI_TOS_AGREED` | — | `1`로 설정 (Coqui TTS 라이선스 동의) |
| `PYTORCH_ENABLE_MPS_FALLBACK` | — | `1`로 설정 (Apple Silicon MPS 폴백) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | 백엔드 API URL |

---

## 하드웨어 호환성

| 환경 | 지원 | 비고 |
|---|---|---|
| Apple Silicon (M1/M2/M3/M4) | ✅ | MPS 백엔드, CUDA 대비 2~5x 느림 |
| NVIDIA GPU (CUDA) | ✅ | 최적 성능 |
| CPU Only | ✅ | 매우 느림 (비권장) |
| Intel Mac | ⚠️ | CPU 모드로 동작, 매우 느림 |

---

## 라이선스

이 프로젝트는 개인 학습 및 연구 목적으로 제작되었습니다.

- **Chatterbox TTS**: [Resemble AI License](https://github.com/resemble-ai/chatterbox)
- **KSS Dataset**: [CC BY 4.0](https://www.kaggle.com/datasets/bryanpark/korean-single-speaker-speech-dataset)
- **LJ Speech**: Public Domain
- **LibriSpeech**: CC BY 4.0
- **Common Voice**: CC-0
