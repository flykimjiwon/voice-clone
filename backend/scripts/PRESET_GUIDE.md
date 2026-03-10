# 음성 프리셋 제작 가이드

배치 스크립트로 음성 프리셋을 대량 생성하는 방법을 설명합니다.

---

## 1. 개요

이 가이드를 따라 진행하면 공개 음성 데이터셋에서 클립을 추출하고, 매니페스트 파일을 작성한 뒤, 배치 스크립트로 `.pt` 임베딩 파일을 자동 생성할 수 있습니다.

최종 결과물:
- `backend/voice_presets/` 안에 프리셋별 `.pt` + `.json` 파일
- `builtin_manifest.json` (모든 프리셋 메타데이터 통합본)
- UI 음성 프리셋 패널에서 즉시 사용 가능한 내장 프리셋

---

## 2. 데이터셋 소개

### AIHub 한국어 음성 (aihub.or.kr)
다수의 화자가 포함된 대규모 한국어 음성 데이터셋입니다. 아나운서, 내레이터, 일반 화자 등 다양한 스타일이 포함되어 있습니다. 비상업적 연구 목적으로는 무료로 신청할 수 있으며, 회원가입 후 다운로드 신청이 필요합니다.

### KSS Dataset
단일 한국어 여성 화자의 고품질 녹음 데이터셋입니다. CC-BY 4.0 라이선스로 Kaggle에서 직접 다운로드할 수 있습니다. 발음이 또렷하고 배경 소음이 없어 프리셋 제작에 적합합니다.

### VCTK Corpus
에든버러 대학교(University of Edinburgh)의 CSTR 연구팀이 제공하는 영어 다화자 데이터셋입니다. 109명의 화자가 다양한 억양으로 녹음한 데이터를 포함합니다. 라이선스는 CC-BY 4.0입니다.

### LJ Speech
단일 영어 여성 화자의 공개 도메인 데이터셋입니다. 13,100개 문장, 약 24시간 분량의 녹음이 포함되어 있습니다. 저작권 제한 없이 자유롭게 사용할 수 있습니다.

### LibriSpeech
LibriVox 오디오북에서 추출한 다화자 영어 데이터셋입니다. CC-BY 4.0 라이선스이며, 다양한 연령대와 억양의 화자가 포함되어 있습니다.

---

## 3. 데이터셋 다운로드

### AIHub 한국어 음성

1. [aihub.or.kr](https://aihub.or.kr) 접속
2. 상단 메뉴 "데이터셋" 클릭
3. 검색창에 "한국어 음성" 입력
4. 원하는 데이터셋 선택 후 "다운로드 신청" 클릭
5. 회원가입 및 신청서 작성 (비상업적 연구 목적 선택)
6. 승인 후 이메일로 다운로드 링크 수신

### KSS Dataset

```bash
# Kaggle CLI 사용
kaggle datasets download -d bryanpark/korean-single-speaker-speech-dataset
unzip korean-single-speaker-speech-dataset.zip -d kss/
```

### VCTK Corpus

```bash
wget https://datashare.ed.ac.uk/bitstream/handle/10283/3443/VCTK-Corpus-0.92.zip
unzip VCTK-Corpus-0.92.zip -d vctk/
```

### LJ Speech

```bash
wget https://data.keithito.com/data/speech/LJSpeech-1.1.tar.bz2
tar -xjf LJSpeech-1.1.tar.bz2
```

### LibriSpeech

```bash
# 100시간 클린 버전 (권장)
wget https://www.openslr.org/resources/12/train-clean-100.tar.gz
tar -xzf train-clean-100.tar.gz
```

---

## 4. 클립 추출 방법

### 목표 스펙
- 길이: 10~20초 (너무 짧으면 임베딩 품질 저하)
- 채널: 모노 (1채널)
- 샘플레이트: 22050Hz 이상 권장 (44100Hz 최적)
- 배경 소음 없음, 음악 없음, 단일 화자

### ffmpeg 추출 명령어

```bash
# 30초 지점부터 15초 추출, 모노, 22050Hz
ffmpeg -i input.wav -ss 30 -t 15 -ac 1 -ar 22050 output_clip.wav

# 특정 구간 추출 (시작:끝 형식)
ffmpeg -i input.wav -ss 00:01:30 -to 00:01:45 -ac 1 -ar 22050 output_clip.wav

# 볼륨 정규화 포함
ffmpeg -i input.wav -ss 30 -t 15 -ac 1 -ar 22050 -af "loudnorm" output_clip.wav
```

### 좋은 클립 선택 기준
- 발음이 명확하고 자연스러운 구간
- 긴 침묵이나 끊김이 없는 구간
- 해당 화자의 목소리 스타일을 잘 대표하는 구간
- 감정이나 톤이 일관된 구간 (아나운서 클립이라면 아나운서 톤이 유지되는 구간)

---

## 5. 매니페스트 작성

### JSON 형식

매니페스트는 JSON 배열입니다. 각 항목은 하나의 프리셋 소스 클립을 나타냅니다.

```json
[
  {
    "filename": "aihub_f01.wav",
    "name": "여성 아나운서",
    "gender": "female",
    "age_group": "adult",
    "tone": "announcer",
    "language": "ko",
    "description": "명료하고 전문적인 뉴스 아나운서 톤"
  }
]
```

### 필드 설명

| 필드 | 설명 | 예시 |
|------|------|------|
| `filename` | `--input-dir` 기준 WAV 파일명 | `"aihub_f01.wav"` |
| `name` | UI에 표시될 프리셋 이름 | `"여성 아나운서"` |
| `gender` | 화자 성별 | `"female"`, `"male"` |
| `age_group` | 화자 연령대 | 아래 참조 |
| `tone` | 목소리 톤/스타일 | 아래 참조 |
| `language` | 주 언어 | `"ko"`, `"en"` |
| `description` | 프리셋 설명 (UI 툴팁 등에 사용) | `"차분하고 전문적인..."` |

### age_group 값

- `"child"` — 어린이
- `"young_adult"` — 청년 (20대 전후)
- `"adult"` — 성인 (30~50대)
- `"senior"` — 시니어 (60대 이상)

### tone 값

`"announcer"`, `"narrator"`, `"character"`, `"conversational"`, `"documentary"`, `"newsreader"`, `"warm"`, `"calm"`, `"bright"`, `"deep"`, `"energetic"`, `"soft"`, `"expressive"`, `"serious"`, `"friendly"`

---

## 6. 배치 스크립트 실행

### 디렉토리 구조

```
backend/
  scripts/
    generate_presets.py
    preset_manifest.json
  curated_clips/          <- WAV 파일들을 여기에 배치
    aihub_f01.wav
    aihub_f02.wav
    ...
  voice_presets/          <- 생성된 .pt + .json 파일 저장 위치 (자동 생성)
```

### 드라이런 먼저 실행 (모델 로딩 없음)

```bash
cd backend
source venv/bin/activate

python -m scripts.generate_presets \
  --dry-run \
  --manifest scripts/preset_manifest.json \
  --input-dir ./curated_clips
```

드라이런은 매니페스트를 파싱하고 각 WAV 파일의 존재 여부를 확인합니다. 모델을 로드하지 않으므로 빠르게 실행됩니다.

### 전체 실행

```bash
cd backend
source venv/bin/activate

python -m scripts.generate_presets \
  --manifest scripts/preset_manifest.json \
  --input-dir ./curated_clips \
  --exaggeration 0.5 \
  --no-preview
```

### 미리듣기 오디오 포함 실행

```bash
python -m scripts.generate_presets \
  --manifest scripts/preset_manifest.json \
  --input-dir ./curated_clips \
  --exaggeration 0.5 \
  --preview-text "안녕하세요. 이것은 음성 프리셋 미리듣기입니다." \
  --preview-lang ko
```

### 출력 디렉토리 지정

```bash
python -m scripts.generate_presets \
  --manifest scripts/preset_manifest.json \
  --input-dir ./curated_clips \
  --output-dir ./voice_presets \
  --exaggeration 0.5 \
  --no-preview
```

---

## 7. 결과 확인

### 파일 확인

```bash
ls backend/voice_presets/
# 예상 출력:
# xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.pt
# xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.json
# builtin_manifest.json
```

각 프리셋마다 UUID 기반 `.pt` 파일(임베딩)과 `.json` 파일(메타데이터)이 생성됩니다.

### 서버 재시작

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

### UI에서 확인

1. 브라우저에서 앱 열기
2. 음성 프리셋 패널 클릭
3. 새로 생성된 프리셋이 목록에 표시되는지 확인
4. 프리셋 선택 후 TTS 생성으로 음질 검증

---

## 8. 팁 & 주의사항

### exaggeration 값 선택

- `0.3~0.5`: 자연스럽고 절제된 표현 (아나운서, 내레이터에 적합)
- `0.5~0.7`: 적당한 감정 표현 (일반 대화, 따뜻한 목소리에 적합)
- `0.7~1.0`: 강한 감정 표현 (캐릭터 목소리, 에너지 넘치는 스타일에 적합)

exaggeration 값은 임베딩 생성 시 고정됩니다. 나중에 변경하려면 해당 클립으로 다시 실행해야 합니다.

### 빠른 실행을 원한다면

`--no-preview` 플래그를 사용하면 미리듣기 오디오 생성을 건너뛰어 처리 속도가 빨라집니다. 프리셋 임베딩 자체는 동일하게 생성됩니다.

### 파일 누락 처리

`--input-dir`에 WAV 파일이 없는 항목은 SKIP 처리됩니다. 스크립트가 중단되지 않으므로, 드라이런으로 먼저 어떤 파일이 누락됐는지 확인하는 것을 권장합니다.

### 백업

`.pt` 파일에는 음성 임베딩이 저장되어 있습니다. 생성에 시간이 걸리므로 `voice_presets/` 디렉토리를 정기적으로 백업해두세요.

```bash
cp -r backend/voice_presets/ backend/voice_presets_backup_$(date +%Y%m%d)/
```

### Apple Silicon (M1/M2/M3) 사용자

MPS 디바이스를 자동으로 사용합니다. CUDA 관련 오류가 발생하면 환경변수를 확인하세요.

```bash
# MPS 강제 사용
PYTORCH_ENABLE_MPS_FALLBACK=1 python -m scripts.generate_presets ...
```

### 매니페스트 분할 실행

전체 30개를 한 번에 실행하기 부담스럽다면, 매니페스트를 여러 파일로 나눠 순차적으로 실행할 수 있습니다. 출력 디렉토리가 같으면 결과가 누적됩니다.
