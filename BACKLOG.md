# Backlog — 다음 작업 목록

우선순위별 정리. 각 항목은 독립적으로 진행 가능합니다.

---

## P1: page.tsx 리팩토링

**현황**: `frontend/src/app/page.tsx`가 1085줄, 20+ state 변수. 유지보수 리스크.

**계획**:
1. 커스텀 훅 추출:
   - `useEngineState()` — 엔진 선택, 상태 관리, 헬스체크
   - `useSynthesis()` — 합성 요청, 스트리밍, 큐 처리
   - `useVoiceState()` — 음성 업로드, 프리셋 로드, 임베딩 준비
2. 섹션 컴포넌트 분리:
   - `TextInputSection.tsx` — 텍스트 입력 + 언어 선택
   - `SynthesisControls.tsx` — 생성 버튼 + 진행률
   - `ResultSection.tsx` — 오디오 재생 + 다운로드
   - `QueueSection.tsx` — 텍스트 큐 배치 처리
3. 검증: `npm run build` + `npx tsc --noEmit` 통과

**예상 규모**: Medium (2~3시간)

---

## P1: Fish Speech Docker 자동화

**현황**: `fish-speech-models` 볼륨이 비어있어 수동 모델 다운로드 필요.

**계획**:
1. `Dockerfile.fish-speech` 생성 — 모델 다운로드 자동화
   ```dockerfile
   FROM fishaudio/fish-speech:latest
   RUN huggingface-cli download fishaudio/s2-pro --local-dir /checkpoints/s2-pro
   ```
2. docker-compose에서 build context 변경
3. 헬스체크 개선 — start_period를 모델 크기에 맞게 조정

**예상 규모**: Small (30분)

---

## P2: API 보안 강화

**현황**: 인증/Rate limiting 없음. 개인 사용에는 OK, 배포 시 필수.

**계획**:
1. `slowapi` 패키지로 Rate limiting 추가 (합성: 10/min, 업로드: 30/min)
2. 선택적 API key 인증 (`X-API-Key` 헤더)
3. 업로드 파일 검증 강화 (magic bytes 체크)

**예상 규모**: Medium (1~2시간)

---

## P2: 합성 타임아웃 & 에러 핸들링

**현황**: 합성 무한 대기 가능, ffmpeg 서브프로세스 타임아웃 없음.

**계획**:
1. `synthesize` 엔드포인트에 요청 타임아웃 추가 (기본 120초)
2. ffmpeg 프로세스에 `timeout` 파라미터 추가
3. 프론트엔드에 타임아웃 에러 UI 표시

**예상 규모**: Small (30분)

---

## P3: 멀티유저 세션 격리

**현황**: 동시 사용 시 음성 캐시가 덮어씌워질 수 있음.

**계획**:
1. 세션 ID 기반 엔진 인스턴스 격리
2. 업로드/출력 디렉토리 세션별 분리
3. 세션 만료 시 자동 정리

**예상 규모**: Large (반나절)

---

## P3: 영구 작업 큐

**현황**: 인메모리 큐만 있어서 서버 재시작 시 작업 소실.

**계획**:
1. SQLite 기반 작업 큐 (`jobs` 테이블)
2. 작업 상태 머신: pending → processing → completed/failed
3. 서버 재시작 시 pending 작업 자동 재개

**예상 규모**: Large (반나절)
