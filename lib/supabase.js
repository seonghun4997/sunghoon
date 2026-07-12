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

// ★★ v38 — 설정 저장소를 완전히 새 테이블(config_journal)로 이전.
//   꼬여버린 기존 테이블(patchnotes 설정행, site_config)은 읽기 전용 유산으로만 취급.
//   구조: 저장할 때마다 새 행(v = 직전+1) 추가, 읽기는 항상 v 최대 행. 최근 20개 유지.

// 최신 설정 읽기: 새 저장소 → (아직 없으면) 옛 저장소들 중 버전 높은 것
export async function readLatestConfig(client) {
  // 1) 새 저장소
  try {
    const { data: rows, error } = await client
      .from("config_journal")
      .select("id,created_at,v,data")
      .order("v", { ascending: false })
      .order("id", { ascending: false })
      .limit(1);
    if (!error && rows && rows.length) {
      return { id: rows[0].id, v: Number(rows[0].v) || 101, updated_at: rows[0].created_at, data: rows[0].data, via: "새저장소" };
    }
  } catch (e) {}
  // 2) 옛 저장소들 (읽기 전용 fallback — 새 저장소가 준비되기 전까지만)
  const cands = [];
  try {
    const { data: rows } = await client
      .from("patchnotes").select("id,created_at,content").eq("version", "__config__")
      .order("created_at", { ascending: false }).limit(1);
    if (rows && rows.length) {
      try {
        const parsed = JSON.parse(rows[0].content);
        cands.push({ id: rows[0].id, v: Number(parsed?.__v) || 101, updated_at: rows[0].created_at, data: parsed, via: "옛저장소(patchnotes)" });
      } catch (e) {}
    }
  } catch (e) {}
  try {
    const { data: j } = await client
      .from("site_config").select("id,data,updated_at").gte("id", 100)
      .order("id", { ascending: false }).limit(1);
    if (j && j.length) cands.push({ id: "old-" + j[0].id, v: Number(j[0].data?.__v) || 100, updated_at: j[0].updated_at, data: j[0].data, via: "옛저장소(저널)" });
  } catch (e) {}
  try {
    const { data: legacy } = await client
      .from("site_config").select("data,updated_at").eq("id", 1).maybeSingle();
    if (legacy) cands.push({ id: "old-1", v: Number(legacy.data?.__v) || 100, updated_at: legacy.updated_at, data: legacy.data, via: "옛저장소(1번행)" });
  } catch (e) {}
  if (!cands.length) return null;
  cands.sort((a, b) => (b.v - a.v) || String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  return cands[0];
}

// 새 설정 저장: 새 저장소에 v+1 행 추가 → 재조회 검증 → 최근 20개만 유지.
//   새 저장소 테이블이 아직 없으면 비상 경로(site_config 1번 행)로 저장하고 SQL 안내를 warn으로 보고.
export async function writeNewConfig(client, clean, prevV) {
  const nextV = (Number(prevV) || 100) + 1;
  const withV = { ...clean, __v: nextV };
  const problems = [];
  // ── 1차: 새 저장소
  try {
    const { data: ins, error } = await client
      .from("config_journal")
      .insert({ v: nextV, data: withV })
      .select("id,created_at,v")
      .single();
    if (error) throw new Error(error.message);
    const latest = await readLatestConfig(client);
    if (latest && String(latest.id) === String(ins.id)) {
      try {
        const { data: olds } = await client
          .from("config_journal").select("id").order("v", { ascending: false });
        if (olds && olds.length > 20) {
          await client.from("config_journal").delete().in("id", olds.slice(20).map((o) => o.id));
        }
      } catch (e) {}
      return { check: latest };
    }
    problems.push("새저장소에 기록했지만 최신 조회에 안 잡힘");
  } catch (e) {
    const msg = String(e.message || e);
    problems.push(/does not exist|schema cache/i.test(msg)
      ? "새 저장소 테이블이 아직 없음 — 어드민 안내의 SQL 1회 실행 필요"
      : "새저장소 " + msg);
  }
  // ── 2차(비상): site_config 1번 행 — __v가 저장되므로 버전 번호는 계속 +1
  try {
    const { error } = await client
      .from("site_config")
      .upsert({ id: 1, data: withV, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    const latest = await readLatestConfig(client);
    if (latest && Number(latest.v) === nextV) {
      return { check: latest, warn: problems.join(" / ") };
    }
    problems.push("비상 경로 기록 후 최신 조회 결과가 다름 (조회 " + (latest ? "#" + latest.v : "없음") + ")");
  } catch (e) {
    problems.push("비상경로 " + String(e.message || e));
  }
  return { error: { message: problems.join(" / ") } };
}

// 오늘 0시(KST)의 ISO 문자열
export function kstDayStart() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600 * 1000
  ).toISOString();
}
