import { createClient } from "@supabase/supabase-js";

// URL 청소: 공백 제거 + https://호스트 부분만 남기고 뒤에 붙은 슬래시/경로 전부 제거
function cleanUrl(u) {
  u = String(u || "").trim();
  const m = u.match(/^https:\/\/[^\/\s]+/);
  return m ? m[0] : u;
}

export function sb() {
  return createClient(
    cleanUrl(process.env.SUPABASE_URL),
    String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
    { auth: { persistSession: false } }
  );
}

export function supabaseHost() {
  return cleanUrl(process.env.SUPABASE_URL).replace("https://", "");
}

// 승인 여부 판별 — 디비 컬럼이 boolean이든 문자열('true','Y')이든 숫자(1)든 전부 정확히 처리
export function isApproved(v) {
  return v === true || v === 1 || v === "true" || v === "TRUE" || v === "t" || v === "T" || v === "Y" || v === "y" || v === "1";
}

/* ★ v33 저널 저장 방식 — 설정을 한 행에 덮어쓰지 않고, 저장할 때마다 새 번호(#100~) 행을 추가.
   읽기는 항상 "가장 큰 번호"를 사용 → 과거 데이터가 되살아나도 최신 저장을 절대 이길 수 없음. */
const JOURNAL_START = 100;

// 최신 설정 읽기: 저널(#100~)이 있으면 최신 행, 없으면 옛 1번 행, 그것도 없으면 null
export async function readLatestConfig(client) {
  const { data: rows } = await client
    .from("site_config")
    .select("id,data,updated_at")
    .gte("id", JOURNAL_START)
    .order("id", { ascending: false })
    .limit(1);
  if (rows && rows.length) return rows[0];
  const { data: legacy } = await client
    .from("site_config")
    .select("data,updated_at")
    .eq("id", 1)
    .maybeSingle();
  return legacy ? { id: 1, data: legacy.data, updated_at: legacy.updated_at } : null;
}

// 새 설정 저장: 새 번호 행 추가 → 그 행을 재조회해 반환 (동시 저장 충돌 시 번호 올려 재시도)
export async function writeNewConfig(client, clean) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await readLatestConfig(client);
    const newId = Math.max(JOURNAL_START, (cur?.id || JOURNAL_START - 1) + 1) + attempt;
    const { error } = await client
      .from("site_config")
      .insert({ id: newId, data: clean, updated_at: new Date().toISOString() });
    if (error) {
      if (String(error.message || "").includes("duplicate")) continue; // 번호 경합 → 재시도
      return { error };
    }
    const { data: check } = await client
      .from("site_config")
      .select("id,data,updated_at")
      .eq("id", newId)
      .single();
    // 오래된 저널 정리 (최근 20개 유지)
    if (newId - 20 > JOURNAL_START) {
      await client.from("site_config").delete().gte("id", JOURNAL_START).lt("id", newId - 20);
    }
    return { check };
  }
  return { error: { message: "저장 번호 경합이 계속됨 — 다시 시도해주세요" } };
}

// 오늘 0시(KST)의 ISO 문자열
export function kstDayStart() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600 * 1000
  ).toISOString();
}
