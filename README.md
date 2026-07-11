# 전성훈 — 은둔형 연쇄창업가 프로필 사이트

Next.js 14 + Supabase + Vercel. 구독(승인제) → 4촌 자동 등록, 방문/전환 지표, /admin 관리 콘솔.

## 1. Supabase (5분)
1. supabase.com → New project (Region: Seoul)
2. SQL Editor → `supabase/schema.sql` 내용 붙여넣고 Run
3. Settings → API 에서 `Project URL`, `service_role` 키 복사

## 2. Vercel 환경변수 3개
| 이름 | 값 |
|---|---|
| SUPABASE_URL | Project URL |
| SUPABASE_SERVICE_ROLE_KEY | service_role 키 (절대 노출 금지) |
| ADMIN_KEY | 관리자 비밀번호 (직접 정하기) |

## 3. 배포
GitHub 저장소에 이 폴더 내용물 업로드 → Vercel Framework Preset: **Next.js** → Deploy

## 운영
- 구독 신청 → 대기 상태로 저장 → `/admin`에서 승인하면 사이트 4촌 명단에 표시
- `/admin`에서 촌수(1~4촌) 변경 가능 · 방문/구독/전환율 지표 확인
