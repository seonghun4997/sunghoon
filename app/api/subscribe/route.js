import { sb, unsubToken } from "@/lib/supabase";
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
    if (!name || !job || digits.length < 10) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    const phone =
      digits.length === 11
        ? digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3")
        : digits;
    // ★ v44: 자동 승인 — 신청 즉시 4촌 등록
    let { error } = await sb()
      .from("subscribers")
      .insert({ name, phone, phone_digits: digits, job, intro, icon, approved: true, chon: 4 });
    // icon 컬럼이 아직 없는 디비면 icon 빼고 재시도 (SQL 실행 전에도 구독은 되게)
    if (error && /icon/.test(String(error.message))) {
      ({ error } = await sb()
        .from("subscribers")
        .insert({ name, phone, phone_digits: digits, job, intro, approved: true, chon: 4 }));
    }
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "dup" });
      return NextResponse.json({ error: "db" }, { status: 500 });
    }
    // 환영 문자 (솔라피 연결 시) — 사이트 링크 + 구독취소 링크 포함
    sendSMS(
      digits,
      `[전성훈 상태창] ${name}님, 4촌 등록 완료! 앞으로 사업·인맥 소식을 보내드릴게요.\n${SITE}\n구독취소: ${SITE}/bye?p=${digits}&t=${unsubToken(digits)}`
    ).catch(() => {});
    return NextResponse.json({ ok: true, chon: 4 });
  } catch (e) {
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
