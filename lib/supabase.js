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

// ★★ v39 — 설정 저장소는 config_journal 하나만 사용 (새 디비 전용, 옛 테이블 접근 없음)
//   저장할 때마다 새 행(v = 직전+1), 읽기는 항상 v 최대 행, 최근 20개 유지.
export async function readLatestConfig(client) {
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
  return null; // 저장된 적 없음 → 코드에 박힌 기본값(현재 사이트 내용) 사용
}

export async function writeNewConfig(client, clean, prevV) {
  const nextV = (Number(prevV) || 100) + 1;
  const withV = { ...clean, __v: nextV };
  try {
    const { data: ins, error } = await client
      .from("config_journal")
      .insert({ v: nextV, data: withV })
      .select("id,created_at,v")
      .single();
    if (error) {
      const msg = String(error.message || "");
      return { error: { message: /does not exist|schema cache/i.test(msg)
        ? "설정 테이블(config_journal)이 없습니다 — 동봉된 SQL을 새 디비에서 1회 실행해주세요"
        : msg } };
    }
    const latest = await readLatestConfig(client);
    if (!latest || String(latest.id) !== String(ins.id)) {
      return { error: { message: "기록 직후 재조회 검증 실패 — /api/health 캡처를 전달해주세요" } };
    }
    try {
      const { data: olds } = await client.from("config_journal").select("id").order("v", { ascending: false });
      if (olds && olds.length > 20) {
        await client.from("config_journal").delete().in("id", olds.slice(20).map((o) => o.id));
      }
    } catch (e) {}
    return { check: latest };
  } catch (e) {
    return { error: { message: String(e.message || e) } };
  }
}

// 오늘 0시(KST)의 ISO 문자열
export function kstDayStart() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600 * 1000
  ).toISOString();
}
