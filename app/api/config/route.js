import { sb } from "@/lib/supabase";
import { mergeConfig } from "@/lib/config";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data } = await sb().from("site_config").select("data").eq("id", 1).single();
    return NextResponse.json({ config: mergeConfig(data?.data) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ config: mergeConfig(null) }, { headers: { "Cache-Control": "no-store" } });
  }
}
