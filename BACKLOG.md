# sunghoon 작업 대장

> 이 파일이 유일한 할 일 대장. 규칙은 CLAUDE.md "작업 대장 규칙" 참조.
> 상태: 🔲대기 / ⏸중단 / ✅완료(커밋 해시)

## ⏸ 중단
- (없음)

## 🔲 대기
- 🔲 **unsubToken/refToken 폴백 불일치** — 2026-07-18 진단 시 발견, 미수리. 구독 해지·추천 링크 토큰 생성/검증 경로가 서로 다른 폴백을 씀.

> 그 외 현재 미결 0 — 미배포 프로젝트, schema.sql 재작성 후 pglite 실행 검증 완료.

## ✅ 완료
- ✅ schema.sql 코드 기준 8테이블 재작성 · subscribers.id uuid→bigint (aab61bc)
- ✅ 표준 키트 도입 (Sentry 제외 — 미배포) (4b3193d)
