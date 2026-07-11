import { sb } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const b = await req.json();
    const name = String(b.name || "").trim().slice(0, 20);
    const digits = String(b.phone || "").replace(/\D/g, "");
    const job = String(b.job || "").trim().slice(0, 10);
    const intro = String(b.intro || "").trim().slice(0, 20);
    if (!name || !job || digits.length < 10) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    const phone =
      digits.length === 11
        ? digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3")
        : digits;
    const { error } = await sb()
      .from("subscribers")
      .insert({ name, phone, phone_digits: digits, job, intro });
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "dup" });
      return NextResponse.json({ error: "db" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
