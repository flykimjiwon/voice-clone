# TTS Voice Cloning 비교 웹 애플리케이션

> 오픈소스 TTS 엔진 3종(XTTS v2, Kokoro, Chatterbox)을 한 화면에서 비교하는 풀스택 웹 애플리케이션

---

## 1. 프로젝트 개요

### 1.1 목적

내 목소리(음성 샘플)를 업로드하거나 브라우저에서 직접 녹음하면, 입력한 텍스트를 3개의 서로 다른 오픈소스 TTS 엔진으로 변환하여 품질, 속도, 자연스러움을 비교할 수 있는 웹 도구.

M3 Max 36GB 맥북에서 CUDA 없이 로컬 실행하는 것을 전제로 설계되었다. 모든 엔진이 Apple Silicon(MPS) 또는 CPU에서 동작한다.

### 1.2 핵심 기능

| 기능 | 설명 |
|------|------|
| 음성 샘플 업로드 | 드래그&드롭 또는 파일 선택으로 참조 음성(5~30초) 업로드. 다중 파일 선택 가능 |
| 브라우저 녹음 | MediaRecorder API로 브라우저에서 직접 마이크 녹음. 미리 듣기 후 업로드 |
| 다중 레퍼런스 | 여러 음성 파일을 조합하여 Voice Cloning 품질 향상 |
| 음성 목록 저장 | 업로드된 음성 목록을 localStorage에 자동 저장. 새로고침해도 유지 |
| 텍스트 입력 | 합성할 텍스트 입력 + 7개 언어 선택 (한/영/중/일/스/프/독) |
| 엔진별 실시간 생성 | 각 엔진에 개별 요청, 완료된 엔진부터 즉시 결과 표시 |
| 비교 UI | 엔진별 카드에서 오디오 재생, 처리시간, 샘플레이트 비교 |
| 엔진 상태 표시 | 실제 가용성 확인 + 설치 가이드 |

### 1.3 선정된 TTS 엔진

| 엔진 | 개발사 | 특징 | Voice Cloning | GPU 요구 | 카테고리 |
|------|--------|------|:---:|----------|----------|
| **Coqui XTTS v2** | Coqui (idiap 포크) | 가장 안정적, 16개 언어, CPU 동작 가능 | O | CPU/MPS 가능, GPU 권장 | Voice Cloning |
| **Kokoro** | hexgrad | 82M 초경량, 54개 프리셋 음성, 빠른 속도 | X | CPU/MPS 친화적 | Fast Local TTS |
| **Chatterbox Multilingual** | Resemble AI | 23개 언어, Zero-shot 클로닝, 표현력 우수 | O | MPS/CPU 지원, GPU 권장 | Voice Cloning |

선정 기준: **무료 + 로컬 실행 + M3 Max 36GB 맥북 호환 + CUDA 없이 동작**

### 1.4 M3 Max 호환성 등급

| 등급 | 엔진 | 근거 |
|------|------|------|
| A | XTTS v2 | 맥 설치성 최고, 문서 성숙도 최고, CPU 폴백 안정적 |
| B (경량) | Kokoro | Voice Cloning 미지원이지만 빠르고 가벼운 기준선. MPS 친화적 |
| B (실험) | Chatterbox | MPS 자동 감지 지원, non-CUDA 검증 진행 중 |
| C | CosyVoice | Apple Silicon 지원 제한적. 현재 기본 엔진에서 제외 |
| D | Fish Speech 로컬 서버 | macOS 배포 "coming soon" 상태. 현재 기본 엔진에서 제외 |

---

## 2. 아키텍처 설계

### 2.1 전체 구조

```
┌─────────────────────┐     HTTP      ┌──────────────────────────┐
│   Next.js Frontend  │ ◄──────────► │   FastAPI Backend         │
│   (포트 3000)        │   REST API   │   (포트 8000)              │
│                     │              │                          │
│  ┌───────────────┐  │              │  ┌──────────────────┐    │
│  │ VoiceUploader │  │  POST        │  │  Engine Registry │    │
│  │ TextInput     │──┼──/api/───────┼──│                  │    │
│  │ EngineCards   │  │  endpoints   │  │  ┌─────────────┐ │    │
│  │ AudioPlayer   │  │              │  │  │ XTTS v2     │ │    │
│  └───────────────┘  │              │  │  │ Kokoro      │ │    │
│                     │              │  │  │ Chatterbox  │ │    │
│                     │  GET         │  │  └─────────────┘ │    │
│  <audio> ◄──────────┼──/api/audio──┼──│                  │    │
│                     │              │  └──────────────────┘    │
└─────────────────────┘              │                          │
                                     │  uploads/  outputs/      │
                                     └──────────────────────────┘
```

### 2.2 설계 원칙

**엔진 추상화 패턴 (Strategy Pattern)**

모든 TTS 엔진이 동일한 인터페이스(`TTSEngine`)를 구현하여, 새 엔진 추가 시 기존 코드 변경 없이 확장 가능.

```
TTSEngine (ABC)
├── engine_id: str              # 엔진 식별자
├── engine_name: str            # 표시 이름
├── description: str            # 엔진 설명
├── supports_voice_cloning: bool
├── supported_languages: list[str]
├── category: str               # "voice_cloning" | "fast_local"
├── is_available() → bool       # 의존성 설치 여부 확인
├── initialize() → None         # 모델 로드 (lazy loading)
├── synthesize(text, speaker_wavs, language, output_path) → dict
└── get_error_message() → str   # 미설치 시 안내 메시지
```

**Graceful Degradation**: 엔진 미설치 시 서버가 크래시하지 않고, UI에서 설치 방법을 안내.

**엔진별 실시간 합성**: `synthesizeOne`으로 각 엔진에 개별 요청을 보내고, 완료된 엔진부터 즉시 결과를 표시한다. 전체 완료를 기다리지 않는다.

**비동기 병렬 처리**: `asyncio.gather` + `ThreadPoolExecutor`로 엔진 동시 실행. 모델 추론은 CPU-bound이므로 스레드 풀에서 실행.

### 2.3 엔진 통합 방식 분류

| 유형 | 설명 | 현재 엔진 |
|------|------|----------|
| In-process Python | 같은 Python 프로세스 내에서 직접 임포트하여 실행 | XTTS v2, Kokoro, Chatterbox |
| External service | 별도 서버에 HTTP 요청 (향후 확장) | Fish Speech 로컬 API 등 |
| CLI wrapper | 외부 바이너리를 subprocess로 호출 (향후 확장) | Piper 등 |

### 2.4 기술 스택

| 계층 | 기술 | 버전 |
|------|------|------|
| 프론트엔드 | Next.js (App Router) | 16.1.6 |
| 스타일링 | Tailwind CSS | v4 |
| 아이콘 | lucide-react | 0.577.0 |
| 백엔드 | FastAPI | 0.115.6 |
| Python 런타임 | Python | 3.11 |
| ASGI 서버 | Uvicorn | 0.34.0 |
| 컨테이너 | Docker + docker-compose | - |

---

## 3. 프로젝트 구조

```
tts/
├── frontend/                              # Next.js 프론트엔드
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx                   # 메인 비교 페이지 (3-step UI)
│   │   │   ├── layout.tsx                 # 루트 레이아웃 (다크 테마)
│   │   │   └── globals.css                # 전역 스타일 (커스텀 스크롤바 등)
│   │   ├── components/
│   │   │   ├── VoiceUploader.tsx           # 음성 업로드 (탭: 파일/녹음)
│   │   │   ├── AudioPlayer.tsx            # 커스텀 오디오 플레이어
│   │   │   └── EngineCard.tsx             # 엔진별 결과 카드
│   │   └── lib/
│   │       ├── api.ts                     # API 클라이언트 함수
│   │       └── types.ts                   # TypeScript 인터페이스
│   ├── Dockerfile                         # 프론트엔드 컨테이너
│   ├── next.config.ts                     # standalone 출력 설정
│   └── package.json
│
├── backend/                               # FastAPI 백엔드
│   ├── app/
│   │   ├── main.py                        # FastAPI 앱 + CORS 설정
│   │   ├── config.py                      # 경로, 업로드 제한 등 설정
│   │   ├── schemas.py                     # Pydantic 요청/응답 모델
│   │   ├── routers/
│   │   │   └── tts.py                     # TTS API 엔드포인트 (5개)
│   │   └── engines/
│   │       ├── base.py                    # TTSEngine 추상 클래스
│   │       ├── xtts_engine.py             # Coqui XTTS v2 래퍼
│   │       ├── kokoro_engine.py           # Kokoro 래퍼
│   │       └── chatterbox_engine.py       # Chatterbox Multilingual 래퍼
│   ├── uploads/                           # 업로드된 음성 파일
│   ├── outputs/                           # 생성된 오디오 파일
│   ├── requirements.txt                   # Python 의존성
│   └── venv/                              # Python 3.11 가상환경
│
├── Dockerfile.backend                     # 백엔드 컨테이너
├── docker-compose.yml                     # 풀스택 오케스트레이션
└── DOCUMENTATION.md                       # 이 문서
```

---

## 4. 백엔드 상세 설계

### 4.1 API 엔드포인트

| 메서드 | 경로 | 설명 | 요청 | 응답 |
|--------|------|------|------|------|
| `GET` | `/health` | 서버 상태 확인 | - | `{ status: "ok" }` |
| `GET` | `/api/engines` | 엔진 목록 + 상태 조회 | - | `EngineListResponse` |
| `POST` | `/api/upload-voice` | 음성 파일 업로드 | `multipart/form-data` (file) | `UploadVoiceResponse` |
| `POST` | `/api/synthesize` | 단일 엔진 음성 합성 | `form-data` (text, engine_id, language, voice_ids) | `SynthesizeResponse` |
| `POST` | `/api/synthesize-all` | 전체 엔진 동시 합성 | `form-data` (text, language, voice_ids) | `SynthesizeAllResponse` |
| `GET` | `/api/audio/{filename}` | 생성된 오디오 파일 다운로드 | - | `audio/wav` |

`voice_ids` 파라미터는 쉼표로 구분된 UUID 문자열이다. 예: `"uuid1,uuid2,uuid3"`. 여러 참조 음성을 한 번에 전달하여 Voice Cloning 품질을 높일 수 있다. 하위 호환을 위해 단일 UUID를 전달하는 `voice_id` 파라미터도 지원한다.

### 4.2 데이터 모델

```
EngineInfo
├── id: string                    # "xtts_v2" | "kokoro" | "chatterbox"
├── name: string                  # 표시 이름
├── description: string           # 엔진 설명
├── available: boolean            # 사용 가능 여부
├── supports_voice_cloning: bool  # Voice Cloning 지원 여부
├── supported_languages: string[] # 지원 언어 코드 목록
├── category: string              # "voice_cloning" | "fast_local"
└── error: string | null          # 미사용 시 에러 메시지

UploadVoiceResponse
├── voice_id: string              # UUID (파일 식별자)
├── filename: string              # 원본 파일명
└── duration_seconds: float       # 오디오 길이

SynthesizeResponse
├── engine_id: string             # 엔진 식별자
├── engine_name: string           # 엔진 표시명
├── audio_url: string             # 생성된 오디오 URL (/api/audio/...)
├── duration_seconds: float       # 생성된 오디오 길이
├── processing_time_seconds: float# 처리 소요 시간
└── sample_rate: int              # 샘플레이트 (Hz)

SynthesizeAllResponse
├── results: SynthesizeResponse[] # 성공한 엔진들의 결과
└── errors: ErrorDetail[]         # 실패한 엔진들의 에러 정보
```

### 4.3 엔진별 통합 방식

#### Coqui XTTS v2

```python
from TTS.api import TTS

# MPS 불안정으로 Apple Silicon에서는 CPU로 폴백
device = "cuda" if torch.cuda.is_available() else "cpu"
if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
    device = "cpu"

tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
tts.tts_to_file(
    text="합성할 텍스트",
    speaker_wav=["참조_음성1.wav", "참조_음성2.wav"],  # 다중 파일 가능
    language="ko",
    file_path="출력.wav",
    split_sentences=True,
)
```

- 패키지: `pip install coqui-tts`
- 모델 ID: `tts_models/multilingual/multi-dataset/xtts_v2`
- 모델 크기: 약 1.8GB (최초 실행 시 자동 다운로드)
- `speaker_wav`에 단일 경로 또는 경로 리스트 모두 전달 가능
- MPS에서 불안정하여 CPU로 강제 폴백. CPU에서도 동작하지만 GPU 대비 10~20배 느림
- 환경변수 `COQUI_TOS_AGREED=1` 필요 (자동 동의 처리)

#### Kokoro

```python
from kokoro import KPipeline
import numpy as np
import soundfile as sf

# 언어 코드 매핑: "en" → "a", "ja" → "j", "zh-cn" → "z" 등
pipeline = KPipeline(lang_code="a")

# 54개 프리셋 음성 중 선택 (Voice Cloning 미지원)
generator = pipeline("합성할 텍스트", voice="af_heart", speed=1)

chunks = []
for _, _, audio in generator:
    chunks.append(audio)

full_audio = np.concatenate(chunks)
sf.write("출력.wav", full_audio, 24000)
```

- 패키지: `pip install kokoro soundfile 'misaki[en]'`
- 추가 시스템 의존성: `brew install espeak-ng`
- 모델 크기: 82M 파라미터 (초경량)
- Voice Cloning 미지원. 54개 프리셋 음성 중 언어별 기본값 자동 선택
- MPS 폴백 활성화: `PYTORCH_ENABLE_MPS_FALLBACK=1` 환경변수 권장
- 한국어(`ko`)는 내부적으로 영어 파이프라인(`lang_code="a"`)으로 처리

#### Chatterbox Multilingual

```python
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
import torchaudio

# CUDA → MPS → CPU 순서로 자동 감지
device = "cuda" if torch.cuda.is_available() else \
         "mps" if torch.backends.mps.is_available() else "cpu"

model = ChatterboxMultilingualTTS.from_pretrained(device=device)

# Zero-shot Voice Cloning: 5~10초 참조 음성으로 충분
wav = model.generate(
    "합성할 텍스트",
    audio_prompt_path="참조_음성.wav",
    language_id="ko",
)

torchaudio.save("출력.wav", wav, model.sr)
```

- 패키지: `pip install chatterbox-tts`
- 23개 언어 지원 (한국어 포함)
- MPS 자동 감지 및 사용. CUDA 없이도 동작
- 참조 음성 필수 (Voice Cloning 전용). 5~10초 분량 권장
- `model.sr`로 샘플레이트 동적 조회

### 4.4 엔진 가용성 판별 로직

각 엔진의 `is_available()` 메서드:

| 엔진 | 판별 기준 | 미설치 시 안내 |
|------|----------|--------------|
| XTTS v2 | `import TTS` 성공 여부 | `pip install coqui-tts` |
| Kokoro | `from kokoro import KPipeline` 성공 여부 | `pip install kokoro soundfile 'misaki[en]'` + `brew install espeak-ng` |
| Chatterbox | `from chatterbox.mtl_tts import ChatterboxMultilingualTTS` 성공 여부 | `pip install chatterbox-tts` |

엔진이 미설치 상태여도 서버는 정상 기동된다. 해당 엔진 카드에 설치 안내 메시지가 표시된다.

### 4.5 엔진 레지스트리

`routers/tts.py`에서 엔진을 딕셔너리로 관리한다:

```python
from ..engines.xtts_engine import XTTSEngine
from ..engines.kokoro_engine import KokoroEngine
from ..engines.chatterbox_engine import ChatterboxEngine

_engines = {
    "xtts_v2": XTTSEngine(),
    "kokoro": KokoroEngine(),
    "chatterbox": ChatterboxEngine(),
}
```

새 엔진 추가 시 이 딕셔너리에만 등록하면 된다. 프론트엔드 변경은 불필요하다.

---

## 5. 프론트엔드 상세 설계

### 5.1 페이지 구조 (3-Step UI)

```
┌─────────────────────────────────────────────────────┐
│  TTS Voice Cloning 비교                              │
│  오픈소스 TTS 엔진 3종 비교 · XTTS v2 · Kokoro · Chatterbox │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1 음성 샘플                                          │
│  [파일 업로드] [직접 녹음]                              │
│  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   │
│  │  음성 파일을 드래그하거나 클릭하세요              │   │
│  │  WAV, MP3, FLAC, OGG, M4A · 여러 파일 선택 가능  │   │
│  └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   │
│                                                     │
│  2 텍스트 입력                                        │
│  [한국어 ▼]  [안녕하세요. 이것은 음성 합성...          ]  │
│                                                     │
│  3 음성 생성 및 비교                    [전체 생성]     │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐          │
│  │ XTTS v2   │ │ Kokoro    │ │Chatterbox │          │
│  │ blue      │ │ emerald   │ │ violet    │          │
│  │ ▶ ──●──── │ │ ▶ ──●──── │ │ ▶ ──●──── │          │
│  │ 처리 2.3초 │ │ 처리 0.8초 │ │ 처리 3.1초 │          │
│  └───────────┘ └───────────┘ └───────────┘          │
│                                                     │
├─────────────────────────────────────────────────────┤
│  오픈소스 TTS 엔진 비교 도구                           │
└─────────────────────────────────────────────────────┘
```

### 5.2 컴포넌트 설명

#### `VoiceUploader`

탭 방식으로 파일 업로드와 직접 녹음을 전환한다.

**파일 업로드 탭**
- 드래그&드롭 + 파일 선택 지원
- `multiple` 속성으로 여러 파일 동시 선택 가능
- 허용 형식: `.wav`, `.mp3`, `.flac`, `.ogg`, `.m4a`, `.webm`
- 업로드된 음성 목록을 칩(chip) 형태로 표시. 개별 삭제 및 전체 삭제 가능

**직접 녹음 탭**
- MediaRecorder API로 마이크 녹음
- 녹음 상태: 대기 → 녹음 중 (경과 시간 표시) → 녹음 완료 (미리 듣기)
- 미리 듣기 후 "이 녹음 추가하기" 또는 "다시 녹음" 선택

**공통**
- 업로드된 음성 목록을 `localStorage`에 자동 저장 (`tts_voices` 키)
- 새로고침 후에도 목록 복원
- 변경 시 `onVoicesChanged(voices)` 콜백으로 부모에 전달

#### `AudioPlayer`

- 재생/일시정지 버튼 (amber 색상)
- 프로그레스 바 (클릭으로 시간 이동)
- 현재 시간 / 전체 시간 표시 (monospace)
- 처음부터 재생 버튼
- 배속 조절 (0.5x ~ 2x 순환)

#### `EngineCard`

- 엔진별 고유 색상 그라데이션 바 (상단 1px)
  - XTTS v2: blue-600 → cyan-500
  - Kokoro: emerald-500 → teal-500
  - Chatterbox: violet-600 → purple-500
- 상태 뱃지: 사용 가능(emerald) / 사용 불가(red)
- 카테고리 뱃지: Voice Cloning(amber) / Fast Local TTS(teal)
- 지원 언어 태그 (최대 6개 + 나머지 수 표시)
- 로딩 상태: 스피너 + "음성 생성 중..."
- 결과 표시: AudioPlayer + 처리시간/길이/샘플레이트
- 에러 표시: 경고 아이콘 + 에러 메시지

### 5.3 상태 관리

React `useState` 기반 로컬 상태 관리 (외부 상태 라이브러리 불필요):

```
engines: EngineInfo[]          ← GET /api/engines (마운트 시)
voiceIds: string[]             ← 업로드 완료 시 설정 (다중 UUID)
text: string                   ← 텍스트 입력 (언어 변경 시 샘플 텍스트 자동 설정)
language: string               ← 언어 선택
loadingEngines: Record<string, boolean>  ← 엔진별 로딩 상태 (per-engine)
results: Record<string, SynthesizeResponse>  ← engine_id → 결과 매핑
errors: Record<string, string>  ← engine_id → 에러 메시지 매핑
apiError: string | null        ← 서버 연결 에러
```

`generating` 플래그는 `loadingEngines` 값 중 하나라도 `true`이면 `true`로 파생된다.

### 5.4 엔진별 실시간 합성 흐름

"전체 생성" 버튼 클릭 시:

1. 사용 가능한 엔진 목록 필터링
2. 모든 엔진의 `loadingEngines[id] = true` 설정
3. 각 엔진에 `synthesizeOne(text, engineId, language, voiceIds)` 개별 호출 (Promise, 비동기)
4. 각 엔진이 완료되는 즉시 `results[engineId]` 업데이트, `loadingEngines[id] = false`
5. 실패 시 `errors[engineId]` 업데이트

전체 완료를 기다리지 않으므로, 빠른 엔진(Kokoro)의 결과가 먼저 표시된다.

### 5.5 디자인 시스템

| 요소 | 적용 |
|------|------|
| 테마 | 다크 모드 전용 (zinc-950 배경) |
| 폰트 | Geist Sans (본문) + Geist Mono (수치 데이터) |
| 색상 체계 | amber-500 (주요 액센트), zinc 계열 (중립) |
| 엔진 색상 | blue (XTTS v2), emerald (Kokoro), violet (Chatterbox) |
| 상태 색상 | emerald (성공/가능), red (에러/불가) |
| 카테고리 색상 | amber (Voice Cloning), teal (Fast Local TTS) |
| 반응형 | mobile-first (sm → lg 3컬럼 그리드) |

---

## 6. 설치 및 실행 가이드

### 6.1 사전 요구사항

- Node.js 20+
- Python 3.11 (3.14는 TTS 라이브러리 호환성 문제)
- ffmpeg (`brew install ffmpeg`)
- espeak-ng (`brew install espeak-ng`, Kokoro 사용 시 필요)

### 6.2 로컬 개발 환경 설정

#### 백엔드

```bash
# 1. Python 가상환경 생성 및 활성화
python3.11 -m venv backend/venv
source backend/venv/bin/activate

# 2. 기본 의존성 설치
pip install -r backend/requirements.txt

# 3. 서버 실행
cd backend
COQUI_TOS_AGREED=1 PYTORCH_ENABLE_MPS_FALLBACK=1 \
  uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 프론트엔드

```bash
# 1. 의존성 설치
cd frontend
npm install

# 2. 개발 서버 실행
npm run dev
# → http://localhost:3000
```

### 6.3 TTS 엔진 개별 설치

#### XTTS v2 (A등급, 권장)

```bash
source backend/venv/bin/activate
pip install coqui-tts
```

최초 실행 시 모델을 자동 다운로드한다 (약 1.8GB). CPU에서도 동작하지만 느리다. `COQUI_TOS_AGREED=1` 환경변수로 라이선스 동의를 자동 처리한다.

#### Kokoro (B등급, 경량)

```bash
source backend/venv/bin/activate
pip install kokoro soundfile 'misaki[en]'
brew install espeak-ng
```

82M 파라미터 초경량 모델. 설치 후 즉시 사용 가능하며 별도 모델 다운로드가 없다. Voice Cloning은 지원하지 않으므로 참조 음성 없이도 합성 가능하다 (단, 현재 UI는 참조 음성을 필수로 요구한다).

#### Chatterbox (B등급, 실험)

```bash
source backend/venv/bin/activate
pip install chatterbox-tts
```

MPS를 자동 감지하여 사용한다. 최초 실행 시 모델을 다운로드한다. non-CUDA 환경에서의 안정성은 검증 진행 중이다.

### 6.4 Docker 배포

```bash
docker compose up --build
```

- 백엔드: `http://localhost:8000`
- 프론트엔드: `http://localhost:8000` (프록시) 또는 `http://localhost:3000`
- 모델 캐시 볼륨 유지

---

## 7. API 사용 예시

### 7.1 엔진 목록 조회

```bash
curl http://localhost:8000/api/engines | jq
```

```json
{
  "engines": [
    {
      "id": "xtts_v2",
      "name": "Coqui XTTS v2",
      "description": "가장 안정적인 오픈소스 TTS. 다국어 지원, Voice Cloning 가능. CPU에서도 동작.",
      "available": true,
      "supports_voice_cloning": true,
      "supported_languages": ["ko", "en", "es", "fr", "de", "it", "pt", "pl", "tr", "ru", "nl", "cs", "ar", "zh-cn", "ja", "hu"],
      "category": "voice_cloning",
      "error": null
    },
    {
      "id": "kokoro",
      "name": "Kokoro",
      "description": "82M 초경량 TTS. 빠른 속도, 높은 품질. 프리셋 음성 54종 (Voice Cloning 미지원).",
      "available": true,
      "supports_voice_cloning": false,
      "supported_languages": ["en", "ja", "zh-cn", "es", "fr", "it", "pt", "hi"],
      "category": "fast_local",
      "error": null
    },
    {
      "id": "chatterbox",
      "name": "Chatterbox",
      "description": "Resemble AI의 고품질 TTS. 23개 언어, Zero-shot Voice Cloning. MPS/CPU 지원.",
      "available": false,
      "supports_voice_cloning": true,
      "supported_languages": ["ko", "en", "zh-cn", "ja", "es", "fr", "de", "it", "pt", "ar", "hi", "ru", "nl", "pl", "tr"],
      "category": "voice_cloning",
      "error": "Chatterbox가 설치되지 않았습니다. pip install chatterbox-tts 로 설치하세요."
    }
  ]
}
```

### 7.2 음성 업로드

```bash
curl -X POST http://localhost:8000/api/upload-voice \
  -F "file=@my_voice.wav"
```

```json
{
  "voice_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "my_voice.wav",
  "duration_seconds": 12.5
}
```

### 7.3 단일 엔진 합성 (voice_ids 사용)

```bash
curl -X POST http://localhost:8000/api/synthesize \
  -F "text=안녕하세요. 테스트입니다." \
  -F "engine_id=xtts_v2" \
  -F "language=ko" \
  -F "voice_ids=a1b2c3d4-...,b2c3d4e5-..."
```

```json
{
  "engine_id": "xtts_v2",
  "engine_name": "Coqui XTTS v2",
  "audio_url": "/api/audio/output-uuid.wav",
  "duration_seconds": 3.2,
  "processing_time_seconds": 5.7,
  "sample_rate": 24000
}
```

### 7.4 전체 엔진 동시 합성

```bash
curl -X POST http://localhost:8000/api/synthesize-all \
  -F "text=안녕하세요. 테스트입니다." \
  -F "language=ko" \
  -F "voice_ids=a1b2c3d4-..."
```

```json
{
  "results": [
    {
      "engine_id": "xtts_v2",
      "engine_name": "Coqui XTTS v2",
      "audio_url": "/api/audio/uuid1.wav",
      "duration_seconds": 3.2,
      "processing_time_seconds": 5.7,
      "sample_rate": 24000
    },
    {
      "engine_id": "kokoro",
      "engine_name": "Kokoro",
      "audio_url": "/api/audio/uuid2.wav",
      "duration_seconds": 3.1,
      "processing_time_seconds": 0.8,
      "sample_rate": 24000
    }
  ],
  "errors": [
    {
      "engine_id": "chatterbox",
      "engine_name": "Chatterbox",
      "error": "Chatterbox가 설치되지 않았습니다."
    }
  ]
}
```

### 7.5 생성된 오디오 다운로드

```bash
curl http://localhost:8000/api/audio/output-uuid.wav --output result.wav
```

---

## 8. 완성 과정 기록

### Phase 1: 환경 분석 및 리서치

**환경 확인 결과:**
- macOS arm64 (Apple Silicon M3 Max)
- Node.js v24.13.1, npm 11.8.0
- Python 3.14.3 → TTS 라이브러리 비호환 → Python 3.11.15 추가 설치
- NVIDIA GPU 없음 → MPS(Apple Silicon GPU) 또는 CPU 전용
- ffmpeg 설치됨

**TTS 엔진 리서치:**

| 리서치 대상 | 주요 확인 사항 |
|------------|---------------|
| Coqui XTTS v2 | `pip install coqui-tts` (idiap 포크), MPS 불안정으로 CPU 폴백, 16개 언어 |
| Kokoro | hexgrad 개발, 82M 파라미터, 54개 프리셋 음성, espeak-ng 필요 |
| Chatterbox | Resemble AI 개발, MPS 자동 감지, Zero-shot 클로닝, 23개 언어 |
| CosyVoice | Apple Silicon 지원 제한적 → 기본 엔진에서 제외 |
| Fish Speech | macOS 로컬 배포 미지원 → 기본 엔진에서 제외 |

### Phase 2: 프로젝트 스캐폴딩

1. `create-next-app@latest`로 Next.js 16 프로젝트 생성 (Tailwind v4, App Router)
2. 백엔드 디렉토리 구조 수동 생성
3. Python 3.11 가상환경 생성 + FastAPI/Uvicorn 설치

### Phase 3: 백엔드 구현

구현 순서:

1. **`config.py`** — 경로, 업로드 제한, 허용 확장자 설정
2. **`schemas.py`** — Pydantic 요청/응답 모델 정의 (category 필드 포함)
3. **`engines/base.py`** — TTSEngine 추상 클래스 (Strategy Pattern)
4. **`engines/xtts_engine.py`** — Coqui TTS 래핑, lazy model loading, MPS→CPU 폴백, 다중 speaker_wavs 지원
5. **`engines/kokoro_engine.py`** — KPipeline 래핑, 언어 코드 매핑, 프리셋 음성 자동 선택
6. **`engines/chatterbox_engine.py`** — ChatterboxMultilingualTTS 래핑, MPS 자동 감지
7. **`routers/tts.py`** — 5개 API 엔드포인트, voice_ids 파라미터, ThreadPoolExecutor 병렬 처리
8. **`main.py`** — FastAPI 앱 생성, CORS 설정, 라우터 등록

### Phase 4: 프론트엔드 구현

1. **`lib/types.ts`** — 백엔드 API와 일치하는 TypeScript 인터페이스 (category 타입 포함)
2. **`lib/api.ts`** — fetch 기반 API 클라이언트 (fetchEngines, uploadVoice, synthesizeOne, synthesizeAll)
3. **`components/AudioPlayer.tsx`** — 커스텀 오디오 플레이어 (재생/일시정지, 프로그레스, 배속)
4. **`components/VoiceUploader.tsx`** — 탭 방식 업로드/녹음, 다중 파일, localStorage 저장
5. **`components/EngineCard.tsx`** — 엔진 카드 (색상 코딩, 카테고리 뱃지, 상태 뱃지, 결과 표시)
6. **`app/page.tsx`** — 3-Step 메인 페이지, 엔진별 실시간 합성, 언어별 샘플 텍스트 자동 전환
7. **`app/layout.tsx`** — 다크 테마, Geist 폰트, 한국어 lang 설정
8. **`app/globals.css`** — 커스텀 셀렉션 색상, 스크롤바 스타일

### Phase 5: 검증

| 검증 항목 | 결과 |
|----------|------|
| 프론트엔드 빌드 (`npm run build`) | 성공 |
| 백엔드 앱 임포트 | 성공 |
| 백엔드 서버 시작 | 성공 (포트 8000) |
| `GET /health` | `{"status": "ok"}` |
| `GET /api/engines` | 3개 엔진 정보 반환, 가용성 정확히 표시 |
| 프론트엔드 서버 시작 | 성공 (포트 3000) |
| 브라우저 렌더링 | 다크 테마 UI 정상, 3개 엔진 카드 표시, 카테고리 뱃지 정확 |

---

## 9. 새 엔진 추가 방법

1. `backend/app/engines/`에 새 파일 생성 (예: `bark_engine.py`)
2. `TTSEngine`을 상속하여 4개 메서드 구현
3. `routers/tts.py`의 `_engines` 딕셔너리에 등록

```python
from pathlib import Path
from .base import TTSEngine

class BarkEngine(TTSEngine):
    engine_id = "bark"
    engine_name = "Bark"
    description = "Suno AI의 텍스트-음성 모델"
    supports_voice_cloning = False
    supported_languages = ["en", "ko"]
    category = "voice_cloning"  # 또는 "fast_local"

    def __init__(self):
        self._model = None
        self._error: str | None = None

    def is_available(self) -> bool:
        try:
            import bark  # noqa: F401
            return True
        except ImportError:
            self._error = "pip install bark 로 설치하세요."
            return False

    def initialize(self) -> None:
        if self._model is not None:
            return
        # 모델 로드 로직

    def synthesize(
        self,
        text: str,
        speaker_wavs: list[Path],  # Voice Cloning 미지원 시 무시
        language: str,
        output_path: Path,
    ) -> dict:
        # 합성 로직
        return {
            "duration_seconds": ...,
            "processing_time_seconds": ...,
            "sample_rate": 24000,
        }

    def get_error_message(self) -> str | None:
        return self._error
```

`synthesize` 메서드의 `speaker_wavs`는 `list[Path]` 타입이다. Voice Cloning을 지원하지 않는 엔진은 이 파라미터를 무시하면 된다.

프론트엔드 변경 불필요. 엔진이 API에 자동 등록되어 UI에 카드로 표시된다.

---

## 10. 알려진 제한사항

| 제한사항 | 설명 | 해결 방안 |
|---------|------|---------|
| XTTS v2 MPS 불안정 | Apple Silicon GPU(MPS)에서 불안정하여 CPU로 강제 폴백 | CPU 사용 (느리지만 안정적) |
| Kokoro 한국어 미지원 | 한국어 전용 파이프라인 없음. 영어 파이프라인으로 처리 | 한국어 텍스트는 품질 저하 가능 |
| Chatterbox non-CUDA 검증 | MPS/CPU 지원은 구현되었으나 안정성 검증 진행 중 | 문제 발생 시 XTTS v2 사용 |
| Python 3.14 비호환 | TTS 라이브러리 대부분 3.10~3.12 지원 | Python 3.11 사용 |
| PyTorch 2.6+ 이슈 | XTTS v2에서 `weights_only` 기본값 변경 문제 | PyTorch 2.5.x 사용 권장 |
| 참조 음성 길이 | 너무 짧거나 길면 Voice Cloning 품질 저하 | 5~30초 권장 |
| Kokoro Voice Cloning 미지원 | 프리셋 음성만 사용 가능 | XTTS v2 또는 Chatterbox 사용 |
| 동시 메모리 사용 | 3개 엔진 동시 실행 시 메모리 부족 가능 | M3 Max 36GB에서는 충분하나 모델 크기에 따라 다름 |

---

## 11. 라이선스

| 엔진 | 라이선스 | 비고 |
|------|---------|------|
| Coqui XTTS v2 | MPL-2.0 | 상업적 사용 시 소스 공개 의무 확인 필요 |
| Kokoro | Apache 2.0 | 상업적 사용 자유 |
| Chatterbox Multilingual | MIT | 상업적 사용 자유 |

이 프로젝트 자체의 코드(프론트엔드, 백엔드 래퍼)는 각 엔진 라이선스와 별개다. 각 엔진의 원본 라이선스를 확인하고 준수해야 한다.

---

## 12. 향후 확장 계획

### Linux GPU 2차 확장

M3 Max 맥북 로컬 환경 검증 후, CUDA GPU가 있는 Linux 서버로 확장할 때 추가할 엔진 후보:

| 엔진 | 개발사 | 특징 | 추가 조건 |
|------|--------|------|----------|
| CosyVoice 2 | 알리바바 FunAudioLLM | 감정 표현 우수, 자연스러운 음성 | CUDA GPU 필요 |
| Fish Speech / OpenAudio | Fish Audio | LLM 기반 최신 아키텍처 | macOS 배포 지원 후 |
| F5-TTS | SWivid | Flow Matching 기반, 빠른 추론 | CUDA GPU 권장 |

추가 방법은 섹션 9와 동일하다. 엔진 파일 작성 후 `_engines` 딕셔너리에 등록하면 된다.
