import { sb } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    let src = null;
    try {
      const b = await req.json();
      if (b && b.src) src = String(b.src).slice(0, 20);
    } catch (e) {}
    await sb().from("visits").insert({ src });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false });
  }
}
