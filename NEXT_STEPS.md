# Fish Speech 통합 — 다음 작업 목록

코드 구현은 완료되어 푸시되었습니다. 아래는 실제 런타임 연동을 위해 남은 작업입니다.

---

## 1. Fish Speech 모델 다운로드 (필수)

Fish Speech 서버를 실행하려면 모델 체크포인트가 필요합니다.

```bash
# fish-speech 레포 클론
git clone https://github.com/fishaudio/fish-speech.git
cd fish-speech

# Python 의존성 설치
pip install -e .

# 모델 다운로드 (Hugging Face)
# S2 (기본 모델)
huggingface-cli download fishaudio/fish-speech-1.5 --local-dir checkpoints/fish-speech-1.5

# 또는 pip 설치 후
python -c "from fish_speech.utils.checkpoint import download_model; download_model()"
```

> 모델 크기: 약 4~8GB. GPU (NVIDIA CUDA) 필수.

---

## 2. Fish Speech API 서버 실행

```bash
cd fish-speech

# GPU 서버 실행
python tools/api_server.py \
  --llama-checkpoint-path checkpoints/fish-speech-1.5 \
  --decoder-checkpoint-path checkpoints/fish-speech-1.5/firefly-gan-vq-fsq-8x1024-21hz-generator.pth \
  --listen 0.0.0.0:8080

# 정상 동작 확인
curl http://localhost:8080/health
```

서버가 `http://localhost:8080`에서 실행되면 voice-clone 백엔드가 자동으로 연결됩니다.

---

## 3. Docker Compose로 한번에 실행 (선택)

`docker-compose.yml`에 fish-speech 서비스가 이미 추가되어 있습니다.

```bash
# 전체 스택 실행 (Chatterbox + Fish Speech + Frontend)
docker-compose up --build

# GPU가 있을 때만 fish-speech 서비스 정상 동작
# GPU 없으면 fish-speech 서비스만 제외하고 실행:
docker-compose up backend frontend
```

---

## 4. 엔드-투-엔드 테스트 시나리오

서버 실행 후 아래 순서로 테스트하세요.

### 4-1. 엔진 전환 테스트
1. `http://localhost:3000` 접속
2. 헤더 드롭다운에서 **Chatterbox → Fish Speech** 전환
3. Fish Speech 서버 미실행 시 경고 배너 표시 확인
4. Fish Speech 서버 실행 후 배너 사라지는지 확인

### 4-2. Fish Speech 음성 생성 테스트
1. 엔진을 Fish Speech로 전환
2. 텍스트 입력 (감정 태그 포함 가능: `[excited]안녕하세요![/excited]`)
3. 레퍼런스 음성 업로드 (WAV 파일, 5~15초 권장)
4. 전사 텍스트 입력
5. 음성 생성 클릭 → 오디오 재생 확인

### 4-3. Fish Speech 프리셋 저장/로드 테스트
1. 레퍼런스 음성 업로드 후 프리셋 저장
2. 저장된 프리셋 `.ref.wav` + `.transcript` 파일 확인:
   ```
   backend/voice_presets/{id}.ref.wav
   backend/voice_presets/{id}.transcript
   backend/voice_presets/{id}.json  # engine_id: "fish_speech" 포함
   ```
3. 프리셋 로드 후 텍스트만 바꿔 재생성

### 4-4. 엔진 격리 테스트
- Chatterbox 프리셋 목록에 Fish Speech 프리셋이 나타나지 않는지 확인
- Fish Speech 프리셋 목록에 Chatterbox 프리셋이 나타나지 않는지 확인

---

## 5. 알려진 이슈 및 확인 필요 사항

### 5-1. `ormsgpack` 미설치 시 fallback
`fish_speech_engine.py`는 `ormsgpack`이 없으면 JSON으로 자동 fallback합니다.
성능 향상을 원한다면:
```bash
pip install ormsgpack
```

### 5-2. 빌트인 Chatterbox 프리셋의 `engine_id` 필드
기존 `.json` 프리셋 메타데이터 파일에 `engine_id` 필드가 없으면 기본값 `"chatterbox"`로 처리됩니다. 동작에는 문제 없지만, 명시적으로 추가하려면:
```bash
# backend/voice_presets/*.json 파일에 "engine_id": "chatterbox" 추가
# 없어도 작동하므로 선택 사항
```

### 5-3. Fish Speech 체크포인트 경로
`docker-compose.yml`의 fish-speech 서비스는 체크포인트를 볼륨 마운트로 주입받습니다.  
실제 경로를 `docker-compose.yml`에서 확인하고 로컬 경로에 맞게 수정하세요.

---

## 6. 환경 변수 요약

| 변수 | 기본값 | 설명 |
|---|---|---|
| `FISH_SPEECH_URL` | `http://localhost:8080` | Fish Speech API 서버 주소 |
| `COQUI_TOS_AGREED` | — | `1`로 설정 (Chatterbox 라이선스 동의) |
| `PYTORCH_ENABLE_MPS_FALLBACK` | — | `1`로 설정 (Apple Silicon) |

---

## 7. 구현 완료된 코드 요약

| 파일 | 상태 | 내용 |
|---|---|---|
| `backend/app/engines/fish_speech_engine.py` | ✅ 신규 | Fish Speech HTTP 클라이언트 엔진 |
| `backend/app/engines/base.py` | ✅ 수정 | 옵션 메서드 추가 |
| `backend/app/routers/tts.py` | ✅ 수정 | 멀티 엔진 레지스트리, `GET /engines` |
| `backend/app/schemas.py` | ✅ 수정 | `EngineListResponse`, `engine_id` 필드 |
| `backend/app/config.py` | ✅ 수정 | `FISH_SPEECH_URL` 환경변수 |
| `backend/requirements.txt` | ✅ 수정 | `requests>=2.31.0` 추가 |
| `frontend/src/lib/types.ts` | ✅ 수정 | `EngineId` 타입, `EngineListResponse` |
| `frontend/src/lib/api.ts` | ✅ 수정 | 모든 함수에 `engineId` 파라미터 |
| `frontend/src/components/ParamsPanel.tsx` | ✅ 수정 | 엔진별 슬라이더 분기 |
| `frontend/src/components/VoicePresetPanel.tsx` | ✅ 수정 | `engineFilter` prop |
| `frontend/src/app/page.tsx` | ✅ 수정 | 헤더 엔진 드롭다운, transcript 입력 |
| `docker-compose.yml` | ✅ 수정 | fish-speech 서비스 추가 |
