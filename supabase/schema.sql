-- 전성훈 프로필 사이트: 구독자 + 방문 로그
create table if not exists subscribers (
  id uuid primary key default gen_random_uuid(),
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

alter table subscribers enable row level security;
alter table visits enable row level security;

-- v2 추가분: 유입 경로 + 패치노트
alter table visits add column if not exists src text;

create table if not exists patchnotes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  version text not null,
  content text not null
);
alter table patchnotes enable row level security;

-- v3 추가분: 사이트 편집기 설정 저장
create table if not exists site_config (
  id int primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);
alter table site_config enable row level security;
