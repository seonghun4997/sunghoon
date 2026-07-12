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

// 최신 설정 읽기 (v37): 후보를 전부 모아 "버전 번호(__v)가 가장 높은 것"을 채택.
//   patchnotes 저널 → 옛 site_config 저널 → site_config 1번 행 순으로 수집.
//   비상 경로로 저장된 설정도 번호만 높으면 정상 채택되는 구조.
export async function readLatestConfig(client) {
  const cands = [];
  try {
    const { data: rows } = await client
      .from("patchnotes")
      .select("id,created_at,content")
      .eq("version", CONFIG_VER)
      .order("created_at", { ascending: false })
      .limit(1);
    if (rows && rows.length) {
      try {
        const parsed = JSON.parse(rows[0].content);
        cands.push({ id: rows[0].id, v: Number(parsed?.__v) || 101, updated_at: rows[0].created_at, data: parsed, via: "patchnotes저널" });
      } catch (e) {}
    }
  } catch (e) {}
  try {
    const { data: j } = await client
      .from("site_config").select("id,data,updated_at").gte("id", 100)
      .order("id", { ascending: false }).limit(1);
    if (j && j.length) cands.push({ id: "old-" + j[0].id, v: Number(j[0].data?.__v) || 100, updated_at: j[0].updated_at, data: j[0].data, via: "옛저널" });
  } catch (e) {}
  try {
    const { data: legacy } = await client
      .from("site_config").select("data,updated_at").eq("id", 1).maybeSingle();
    if (legacy) cands.push({ id: "old-1", v: Number(legacy.data?.__v) || 100, updated_at: legacy.updated_at, data: legacy.data, via: "site_config_1번행" });
  } catch (e) {}
  if (!cands.length) return null;
  cands.sort((a, b) => (b.v - a.v) || String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  return cands[0];
}

// 새 설정 저장 (v37): 1차 patchnotes 저널 → 기록 직후 "최신 읽기"로 실제 보이는지까지 검증.
//   실패하거나 안 보이면 2차 비상 경로(site_config 1번 행)로 무조건 저장하고, 실패 사유를 warn으로 보고.
export async function writeNewConfig(client, clean, prevV) {
  const withV = { ...clean, __v: (Number(prevV) || 100) + 1 };
  const problems = [];
  // ── 1차: patchnotes 저널
  try {
    const { data: ins, error } = await client
      .from("patchnotes")
      .insert({ version: CONFIG_VER, content: JSON.stringify(withV) })
      .select("id,created_at")
      .single();
    if (error) throw new Error("기록 실패: " + error.message);
    const latest = await readLatestConfig(client);
    if (latest && String(latest.id) === String(ins.id)) {
      // 오래된 저널 정리: 최근 10개만 유지
      try {
        const { data: olds } = await client
          .from("patchnotes").select("id").eq("version", CONFIG_VER)
          .order("created_at", { ascending: false });
        if (olds && olds.length > 10) {
          await client.from("patchnotes").delete().in("id", olds.slice(10).map((o) => o.id));
        }
      } catch (e) {}
      return { check: latest };
    }
    problems.push("patchnotes에 기록됐는데 최신 조회에 안 잡힘 (기록 " + ins.id + " → 조회 " + (latest ? latest.id + "/#" + latest.v : "없음") + ")");
  } catch (e) {
    problems.push("patchnotes " + String(e.message || e));
  }
  // ── 2차(비상): site_config 1번 행 통째 저장 — __v가 함께 저장되므로 버전 번호는 계속 +1 됨
  try {
    const { error } = await client
      .from("site_config")
      .upsert({ id: 1, data: withV, updated_at: new Date().toISOString() });
    if (error) throw new Error("기록 실패: " + error.message);
    const latest = await readLatestConfig(client);
    if (latest && Number(latest.v) === withV.__v) {
      return { check: latest, warn: "비상 경로(site_config)로 저장됨 · 1차 경로 문제: " + problems.join(" / ") };
    }
    problems.push("site_config에도 기록했지만 최신 조회 결과가 다름 (조회 " + (latest ? "#" + latest.v : "없음") + ")");
  } catch (e) {
    problems.push("site_config " + String(e.message || e));
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
