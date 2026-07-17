-- 전성훈 프로필 사이트 — DB 스키마 (2026-07-18 코드 전수조사 기준)
-- 새 디비: 이 파일 전체를 1회 실행하면 코드가 쓰는 테이블 8개가 전부 만들어진다.
-- 기존 디비: 그대로 실행해도 안전 (모든 문장이 if not exists — 있는 것은 건너뜀).
--
-- 주의: subscribers.id는 반드시 숫자여야 한다. 코드가 추천코드("id-토큰", 숫자 검증)와
--       parseInt(sub_id)로 숫자 id를 전제한다 (app/api/subscribe/route.js, app/api/admin/route.js).

create table if not exists subscribers (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  name text not null,
  phone text not null,
  phone_digits text not null unique,
  job text not null,
  intro text,
  chon int default 4,
  approved boolean default false
);

create table if not exists visits (
  id bigint generated always as identity primary key,
  created_at timestamptz default now()
);

create table if not exists patchnotes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  version text not null,
  content text not null
);

-- v2: 유입 경로
alter table visits add column if not exists src text;

-- v50: 방문 확장 — 방문자ID / 인증번호 / 체류초 / 어드민 기기 제외 (app/api/visit/route.js)
alter table visits add column if not exists vid text;
alter table visits add column if not exists phone text;
alter table visits add column if not exists dur int;
alter table visits add column if not exists is_admin boolean default false;

-- v47~v63: 구독자 확장 — 아이콘 / 생일 / 카테고리 / 추천 (subscribe·admin·whoami)
alter table subscribers add column if not exists icon text;
alter table subscribers add column if not exists birthday text;   -- "MM-DD"
alter table subscribers add column if not exists cat text;
alter table subscribers add column if not exists referrer_id bigint;
alter table subscribers add column if not exists ref_name text;

-- v39: 설정 저장소(저널) — 저장할 때마다 새 행, v 최대 행이 현재 설정 (lib/supabase.js)
create table if not exists config_journal (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  v int not null,
  data jsonb not null
);

-- v54: 만남 기록 (admin: meet_add / meet_note / meet_del)
create table if not exists meetings (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  sub_id bigint not null,
  met_on date not null,
  note text
);

-- v62: 추천 현황 (admin: ref_link / ref_paid, 승인 시 자동 확정)
create table if not exists referrals (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  referrer_id bigint not null,
  referee_id bigint not null,
  status text default 'pending',
  paid_at timestamptz
);

-- v49: 문자 발송 내역 (admin: logSms)
create table if not exists sms_log (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  kind text,
  to_count int,
  targets text,
  body text,
  ok boolean,
  detail text,
  scheduled_at text   -- 예약 발송 시각 "YYYY-MM-DDTHH:mm" (KST) 원문 그대로
);

-- v60: 구독자별 문자 이벤트 — 관심도 집계 (admin: logSentEvents)
create table if not exists sms_events (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  sub_id bigint not null,
  kind text not null   -- 'sent'
);

-- 서버는 service_role 키로만 접근하므로 RLS를 켜 두면 외부(anon) 접근이 전부 차단된다.
alter table subscribers enable row level security;
alter table visits enable row level security;
alter table patchnotes enable row level security;
alter table config_journal enable row level security;
alter table meetings enable row level security;
alter table referrals enable row level security;
alter table sms_log enable row level security;
alter table sms_events enable row level security;

-- (삭제됨) site_config — v35에서 버린 구 설정 테이블. 코드 어디서도 쓰지 않는다.
