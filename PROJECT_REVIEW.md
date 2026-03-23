# Voice Clone 프로젝트 진단 보고서

작성일: 2026-03-12

## 1) 프로젝트 한줄 요약

이 프로젝트는 FastAPI + Next.js 기반의 멀티 엔진 음성 클로닝 앱이며, 현재 Chatterbox(로컬 추론)와 Fish Speech(외부 API 서버 연동)를 하나의 UX에서 선택해 사용할 수 있도록 확장된 상태다.

## 2) 현재 구조 파악

### Backend

- API 진입점: `backend/app/main.py`
- 핵심 라우터: `backend/app/routers/tts.py`
- 엔진 추상화: `backend/app/engines/base.py`
- 엔진 구현:
  - `backend/app/engines/chatterbox_engine.py`
  - `backend/app/engines/fish_speech_engine.py`
- 로그 스트리밍: `backend/app/log_stream.py`
- 프리셋/출력/업로드 저장소: `backend/app/config.py`의 `voice_presets`, `outputs`, `uploads`

### Frontend

- 메인 오케스트레이션: `frontend/src/app/page.tsx` (약 1085 lines)
- API 계층: `frontend/src/lib/api.ts`
- 타입 계층: `frontend/src/lib/types.ts`
- 핵심 컴포넌트:
  - `frontend/src/components/VoicePresetPanel.tsx`
  - `frontend/src/components/VoiceUploader.tsx`
  - `frontend/src/components/ParamsPanel.tsx`
  - `frontend/src/components/ServerLogModal.tsx`

### 동작 흐름(요약)

- 업로드/녹음 -> `upload-voice` -> 음성 ID 확보
- 필요 시 `prepare-voice`로 임베딩 준비
- `synthesize`로 생성
- 프리셋은 `voice_presets/*.json + 엔진별 임베딩 파일`로 저장/로드/삭제
- 진행상황은 `/api/logs/stream` SSE로 수신

## 3) 장점

### 제품/UX

- 프리셋 우선 흐름 + 업로드/녹음 병행 흐름이 공존해 실제 사용성이 높다.
- 긴 텍스트 스트리밍 생성, 텍스트 큐, 서버 로그 모달까지 포함되어 운영/디버깅 UX가 좋다.
- 다크/라이트 모드 및 shadcn/ui 기반 UI 일관성이 확보되어 있다.

### 아키텍처

- 엔진 레지스트리(`_engines`)로 멀티 엔진 확장 포인트가 이미 존재한다.
- API 함수와 타입이 프론트에서 분리되어(`api.ts`, `types.ts`) 변경 파급이 상대적으로 작다.
- 엔진별 프리셋 분리(`engine_id` 필터) 구조가 잡혀 있어 교차 오염 리스크를 줄였다.

### 운영 관점

- 빌트인 프리셋 생성 파이프라인(`backend/scripts/generate_presets.py`)이 있고, 데이터셋 기반 초기 보이스 라이브러리 운영이 가능하다.

## 4) 단점/리스크

### A. 유지보수성 리스크

- `page.tsx`가 상태/네트워크/비즈니스/UI를 모두 포함하는 대형 컴포넌트라 변경 비용이 빠르게 증가한다.
- 프론트 전역 상태가 분산되어 엔진 전환, 큐, 프리셋, 진행률 사이 결합도가 높다.

### B. 신뢰성/운영 리스크

- 백엔드 실행이 API 프로세스 + `ThreadPoolExecutor(max_workers=2)`에 묶여 있어 요청 폭주 시 병목이 쉽게 생긴다.
- 큐/작업 상태가 영속적 Job 모델이 아니라 프로세스 메모리 중심이라 재시작 복구성이 약하다.
- 업로드/출력 파일의 보존/정리 정책이 명시적으로 없어 디스크 관리 리스크가 있다.

### C. 보안 리스크

- 인증/권한/레이트리밋이 없어 공개 환경에서 DoS 및 오용 위험이 크다.
- `MAX_UPLOAD_SIZE` 상수는 있으나 실제 업로드 경로에서 강제 적용 근거가 약하다.
- SSE 로그에 운영 민감 정보가 섞일 가능성에 대한 마스킹 정책이 없다.

### D. 문서/배포 일관성 리스크

- 루트 README는 단일 엔진 중심 설명이 남아 있는 반면 실제 코드는 멀티 엔진으로 진화해 문서-코드 갭이 있다.
- `Dockerfile.backend`에 현재 코드 경로와 직접 연관이 낮은 레거시 설치(CosyVoice 등)가 남아 있어 배포 신뢰성을 해칠 수 있다.

### E. 품질 신호

- 프론트 lint 실행 시 에러/경고가 확인됨:
  - `frontend/src/components/ServerLogModal.tsx`: callback 선언 순서 관련 lint error
  - `frontend/src/components/AudioPlayer.tsx`: 미사용 import warning
- 빌드는 성공하지만, lint gate가 깨진 상태는 팀 개발 시 기술부채를 빠르게 키운다.

## 5) 개선 우선순위 제안

## P0 (즉시)

- 보안 최소선 도입: 업로드 제한 강제, 레이트리밋, 에러/로그 민감정보 차단
- lint clean 상태 복구: 현재 에러/경고 0으로 만들기
- 문서 동기화: 멀티 엔진 기준으로 README와 실행 가이드를 업데이트

## P1 (단기)

- 프론트 분해: `page.tsx`를 섹션 컴포넌트 + 커스텀 훅으로 분리
- 백엔드 작업 모델 정리: 합성 요청을 `Job` 단위로 추상화하고 상태 전이 표준화
- 엔진 파라미터 스키마화: 엔진별 유효성 검증(`engine_params`)을 명시적 계약으로 고정

## P2 (중기)

- 영속 큐(예: SQLite 기반) + 워커 분리로 재시작 복구성/동시성 안정성 확보
- 프리셋 데이터 버저닝(`schema_version`)과 원자적 저장(임시파일 + rename)
- SSE 이벤트 표준화(`job.started`, `job.progress`, `job.finished`) 및 재연결 전략 고도화

## 6) 빠른 실행 체크리스트

- [ ] `ServerLogModal.tsx` lint error 해결
- [ ] `AudioPlayer.tsx` 미사용 import 제거
- [ ] README에 Fish Speech 멀티 엔진 흐름 반영
- [ ] 업로드 용량 제한을 라우터 단에서 강제
- [ ] 로그 payload에 경로/스택 트레이스 마스킹 적용
- [ ] `page.tsx`를 최소 3개 섹션 컴포넌트로 1차 분리

## 7) 종합 평가

현재 프로젝트는 "기능 완성도"는 높고 사용자 경험도 강한 편이지만, 멀티 엔진 확장을 시작한 시점에서 "운영 안정성/보안/구조적 유지보수성"이 다음 병목으로 드러난 상태다. 지금 타이밍에 P0/P1만 정리해도 신규 엔진 추가 속도와 장애 대응 속도가 체감될 정도로 개선될 가능성이 높다.

## 8) 근거 파일

- `backend/app/main.py`
- `backend/app/routers/tts.py`
- `backend/app/engines/base.py`
- `backend/app/engines/chatterbox_engine.py`
- `backend/app/engines/fish_speech_engine.py`
- `backend/app/log_stream.py`
- `backend/app/config.py`
- `frontend/src/app/page.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/types.ts`
- `frontend/src/components/VoicePresetPanel.tsx`
- `frontend/src/components/VoiceUploader.tsx`
- `frontend/src/components/ParamsPanel.tsx`
- `frontend/src/components/ServerLogModal.tsx`
- `docker-compose.yml`
- `Dockerfile.backend`
- `README.md`
- `NEXT_STEPS.md`

## 9) 외부 베스트 프랙티스 대비 갭(요약)

아래는 Chatterbox/Fish Speech + FastAPI 운영 베스트 프랙티스 리서치 결과를 현재 코드와 대조한 체크다.

- 모델 라이프사이클(시작 시 warmup): 부분 충족
  - 현재는 요청 시 `initialize()` 경로가 주로 사용됨
  - 권장: FastAPI lifespan에서 엔진 준비 상태를 명시적으로 관리
- 동시성 제어: 부분 충족
  - `ThreadPoolExecutor(max_workers=2)`는 있으나, 엔진별/요청유형별 세마포어 정책은 없음
- 업로드 보안: 미흡
  - 확장자 체크는 있으나, 크기 제한 강제/콘텐츠 스니핑/레이트리밋이 부족
- 캐싱 전략: 부분 충족
  - 음성 임베딩 캐시(준비 상태 재사용)는 존재
  - 요청 결과 캐시(동일 입력 재사용)와 idempotency key는 없음
- SSE 표준화: 부분 충족
  - 실시간 로그/진행률은 좋음
  - 이벤트 타입 표준(`job.started` 등)과 재연결 시 resume 정책은 보강 필요
- 작업 내구성: 미흡
  - 영속 Job Queue/재시작 복구 전략이 없어 운영 안정성 한계

### 권장 레퍼런스(리서치 출처)

- FastAPI Lifespan: https://fastapi.tiangolo.com/advanced/events/
- Chatterbox 공식: https://github.com/resemble-ai/chatterbox
- Fish Speech 공식: https://github.com/fishaudio/fish-speech
