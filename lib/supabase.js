import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

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
    {
      auth: { persistSession: false },
      // ★★★ v41 핵심 수정: Next.js가 디비 조회(GET) 결과를 몰래 캐시해서
      //     "저장은 되는데 조회하면 옛날 값"이 되던 근본 원인 차단.
      //     디비로 나가는 모든 요청에 cache: "no-store"를 강제한다.
      global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: "no-store" }) },
    }
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
  const errs = [];
  try {
    const { data: rows, error } = await client
      .from("config_journal")
      .select("id,created_at,v,data")
      .order("v", { ascending: false })
      .order("id", { ascending: false })
      .limit(1);
    if (error) errs.push(error.message);
    else if (rows && rows.length) {
      return { id: rows[0].id, v: Number(rows[0].v) || 101, updated_at: rows[0].created_at, data: rows[0].data, via: "새저장소" };
    }
  } catch (e) { errs.push(String(e.message || e)); }
  // 진짜 "저장된 적 없음"과 "조회가 실패함"을 구분해서 보고
  return errs.length ? { readError: errs.join(" / ") } : null;
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
      const why = latest?.readError ? " (조회 오류: " + latest.readError + ")" : latest ? " (조회 결과 #" + latest.v + ")" : " (조회 결과 없음)";
      return { error: { message: "기록 직후 재조회 검증 실패" + why } };
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

// 구독취소 링크용 토큰 — 번호를 아는 사람이 아무나 해지 못 하게 서명
export function unsubToken(digits) {
  return crypto.createHmac("sha256", String(process.env.ADMIN_KEY || "k"))
    .update(String(digits)).digest("hex").slice(0, 12);
}

// ★ v62: 추천 링크 토큰 — 구독취소 토큰과 별개 키 사용 (추천 링크가 공유돼도 구독취소 불가)
export function refToken(subId) {
  const crypto = require("crypto");
  return crypto.createHmac("sha256", String(process.env.ADMIN_KEY || "")).update("ref|" + String(subId)).digest("hex").slice(0, 10);
}

// 오늘 0시(KST)의 ISO 문자열
export function kstDayStart() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600 * 1000
  ).toISOString();
}
