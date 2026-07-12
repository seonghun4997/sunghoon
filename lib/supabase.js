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

/* ★ v35 설정 저장소 이전 — 문제가 확인된 site_config 테이블을 버리고,
   저장이 정상 작동하는 것으로 증명된 patchnotes 테이블에 설정을 기록한다.
   version='__config__' 행에 설정 JSON을 저장하며, 저장할 때마다 새 행 추가(저널).
   읽기는 항상 가장 최신 행 → 과거 데이터가 최신 저장을 이길 수 없음. */
const CONFIG_VER = "__config__";

// 최신 설정 읽기: patchnotes의 __config__ 최신 행 → (없으면) 옛 site_config에서 1회성 이전 읽기
export async function readLatestConfig(client) {
  const { data: rows } = await client
    .from("patchnotes")
    .select("id,created_at,content")
    .eq("version", CONFIG_VER)
    .order("created_at", { ascending: false })
    .limit(1);
  if (rows && rows.length) {
    try {
      const parsed = JSON.parse(rows[0].content);
      // ★ v36: 사람이 읽을 수 있는 버전 번호(__v)를 JSON 안에 함께 기록 — 저장할 때마다 +1
      return { id: rows[0].id, v: Number(parsed?.__v) || 101, updated_at: rows[0].created_at, data: parsed };
    } catch (e) {}
  }
  // 마이그레이션: 과거 site_config 저널(#100~) → 1번 행 순으로 시도 (레거시는 전부 버전 #100 취급)
  try {
    const { data: j } = await client
      .from("site_config").select("id,data,updated_at").gte("id", 100)
      .order("id", { ascending: false }).limit(1);
    if (j && j.length) return { id: "old-" + j[0].id, v: 100, updated_at: j[0].updated_at, data: j[0].data };
    const { data: legacy } = await client
      .from("site_config").select("data,updated_at").eq("id", 1).maybeSingle();
    if (legacy) return { id: "old-1", v: 100, updated_at: legacy.updated_at, data: legacy.data };
  } catch (e) {}
  return null;
}

// 새 설정 저장: patchnotes에 __config__ 새 행 추가 → 재조회해 반환, 오래된 행은 최근 10개만 유지
export async function writeNewConfig(client, clean, prevV) {
  // ★ v36: 새 버전 번호 = 직전 번호 + 1 (레거시/최초는 #100 기준 → 첫 저장이 #101)
  const withV = { ...clean, __v: (Number(prevV) || 100) + 1 };
  const { data: ins, error } = await client
    .from("patchnotes")
    .insert({ version: CONFIG_VER, content: JSON.stringify(withV) })
    .select("id,created_at")
    .single();
  if (error) return { error };
  const { data: check } = await client
    .from("patchnotes")
    .select("id,created_at,content")
    .eq("id", ins.id)
    .single();
  const { data: olds } = await client
    .from("patchnotes").select("id").eq("version", CONFIG_VER)
    .order("created_at", { ascending: false });
  if (olds && olds.length > 10) {
    await client.from("patchnotes").delete().in("id", olds.slice(10).map((o) => o.id));
  }
  let parsed = null;
  try { parsed = JSON.parse(check?.content || "null"); } catch (e) {}
  return { check: { id: check?.id, v: Number(parsed?.__v) || null, updated_at: check?.created_at, data: parsed } };
}

// 오늘 0시(KST)의 ISO 문자열
export function kstDayStart() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600 * 1000
  ).toISOString();
}
