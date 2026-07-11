import { sb } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    await sb().from("visits").insert({});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false });
  }
}
