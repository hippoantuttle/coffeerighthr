# COFFEERIGHT Recruiting Review

최근 구현 및 로컬 검증 결과는 [로컬 QA 보고서](docs/LOCAL_QA_REPORT.md)를 참고하세요. 배포 전 `20260905041400_workflow_completion.sql` 적용이 필요합니다. 로그인 없이 링크를 공유하는 운영 방식을 유지합니다.

연세대학교 커피동아리 COFFEERIGHT의 서류·면접 평가 운영 웹앱입니다.

## 데이터 흐름

- Google Form / Sheets: 지원 접수
- Next.js App Router: 서류·면접 평가
- Supabase Postgres: 전형 중 운영 데이터
- Google Drive: ZIP 수동 업로드를 통한 장기 아카이브
- Hermes: 면접 대상자 지원서 요약과 맞춤 질문 일괄 생성

서류 점수와 면접 점수는 서로 합산하지 않습니다.

## 실행

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

`.env.example`을 `.env.local`로 복사하고 서버 전용 service role key를 입력합니다. `SUPABASE_SERVICE_ROLE_KEY`는 브라우저 코드나 `NEXT_PUBLIC_` 변수에 넣지 않습니다.

## 주요 화면

- `/reviewer`: 평가자 이름과 브라우저 reviewer ID 설정
- `/import`: Google Form CSV 가져오기
- `/applicants`: 서류평가 대상 목록과 서류 종료 ZIP
- `/applicants/[id]`: 블라인드 서류평가
- `/interviews`: 면접 대상 목록, 시간·장소·면접관 배정, 평균·편차
- `/interviews/[id]`: Hermes 요약, 공통 질문별 공유 메모, 면접관별 평가
- `/hermes`: Hermes JSON/CSV 사전 검증 및 가져오기

## Supabase 마이그레이션

적용 순서:

1. `0001_initial.sql`
2. `0002_import_source_data.sql`
3. `20260831102422_interview_mvp.sql`
4. `20260831104536_interview_foreign_key_indexes.sql`

`20260831104343_secure_existing_server_only_tables.sql`은 기존 7개 공개 테이블의 anon/authenticated 접근을 차단하고 RLS를 켭니다. 현재 앱처럼 모든 DB 접근이 Next.js 서버의 service role을 통하는 구성이 확정된 경우에만 별도로 적용하세요.

## 아카이브

- `document_final`: 서류평가 종료본
- `interview_final`: 면접 운영·평가 종료본
- `full_final`: 서류 원문·서류평가·면접 운영·면접평가·Hermes 결과 전체

각 ZIP은 개인정보 포함/제외를 선택할 수 있고 생성 이력을 `archives` 테이블에 기록합니다. 운영자는 다운로드한 ZIP을 Google Drive에 수동 보관합니다.
