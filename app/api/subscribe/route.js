import { sb, unsubToken, refToken } from "@/lib/supabase";
import { sendSMS } from "@/lib/solapi";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SITE = "https://sunghoon-nine.vercel.app";
const ICONS = ["🙋","😎","🚀","💼","💰","🩺","⚖️","📈","🎨","🍳","🏗️","💻","📚","🧠","🔥","🌟"];

export async function POST(req) {
  try {
    const b = await req.json();
    const name = String(b.name || "").trim().slice(0, 20);
    const digits = String(b.phone || "").replace(/\D/g, "");
    const job = String(b.job || "").trim().slice(0, 10);
    const intro = String(b.intro || "").trim().slice(0, 20);
    const icon = ICONS.includes(b.icon) ? b.icon : "🙋";
    // ★ v52: 생일 (선택) — "0514", "5/14", "05-14" 등을 "MM-DD"로 정규화. 형식이 이상하면 조용히 버림.
    let birthday = null;
    {
      let d = String(b.birthday || "").replace(/\D/g, "");
      if (d.length === 8) d = d.slice(4); // "19990514" → "0514"
      if (d.length === 3 || d.length === 4) {
        const mm = d.length === 4 ? d.slice(0, 2) : "0" + d.slice(0, 1);
        const dd = d.slice(-2);
        const m = parseInt(mm, 10), day = parseInt(dd, 10);
        if (m >= 1 && m <= 12 && day >= 1 && day <= 31) birthday = mm + "-" + dd;
      }
    }
    if (!name || !job || digits.length < 10) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    // ★ v62: 추천 — 링크 코드("id-token") 검증 or 추천인 이름 수동 입력
    let referrerId = null;
    {
      const rc = String(b.refCode || "").trim();
      const m = rc.match(/^(\d+)-([0-9a-f]{10})$/);
      if (m && refToken(m[1]) === m[2]) referrerId = parseInt(m[1], 10);
    }
    // ★ v63: 추천인/알게 된 계기 + 유입 경로(QR/공유) 자동 결합 → "김도은 소개 · QR 유입"
    let refName = String(b.refName || "").trim().slice(0, 40) || null;
    {
      const srcLabel = { qr: "QR 유입", share: "공유링크 유입" }[String(b.landingSrc || "")] || null;
      if (srcLabel) refName = refName ? (refName + " · " + srcLabel) : srcLabel;
    }
    const phone =
      digits.length === 11
        ? digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3")
        : digits;
    // ★ v47: 승인제 — 신청은 대기로 접수, 주인이 확인 후 등록 (등록 시 환영 문자 발송)
    let { error } = await sb()
      .from("subscribers")
      .insert({ name, phone, phone_digits: digits, job, intro, icon, chon: 4, ...(birthday ? { birthday } : {}), ...(referrerId ? { referrer_id: referrerId } : {}), ...(refName ? { ref_name: refName } : {}) });
    // icon/birthday/추천 컬럼이 아직 없는 디비면 해당 항목 빼고 재시도
    if (error && /icon|birthday|referrer_id|ref_name/.test(String(error.message))) {
      ({ error } = await sb()
        .from("subscribers")
        .insert({ name, phone, phone_digits: digits, job, intro, chon: 4 }));
    }
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "dup" });
      return NextResponse.json({ error: "db" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
