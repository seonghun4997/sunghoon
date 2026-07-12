import { sb, unsubToken } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ★ v44: 구독취소 — 문자 속 서명된 링크로만 해지 가능
export async function POST(req) {
  try {
    const b = await req.json();
    const digits = String(b.p || "").replace(/\D/g, "");
    if (digits.length < 10 || String(b.t || "") !== unsubToken(digits)) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    const { error } = await sb().from("subscribers").delete().eq("phone_digits", digits);
    if (error) return NextResponse.json({ error: "db" }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
