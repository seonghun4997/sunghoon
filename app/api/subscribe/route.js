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
    // ★ v47: 승인제 — 신청은 대기로 접수, 주인이 확인 후 등록 (등록 시 환영 문자 발송)
    let { error } = await sb()
      .from("subscribers")
      .insert({ name, phone, phone_digits: digits, job, intro, icon, chon: 4 });
    // icon 컬럼이 아직 없는 디비면 icon 빼고 재시도
    if (error && /icon/.test(String(error.message))) {
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
