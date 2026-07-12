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

// 오늘 0시(KST)의 ISO 문자열
export function kstDayStart() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600 * 1000
  ).toISOString();
}
