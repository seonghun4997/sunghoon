import { sb, readLatestConfig } from "@/lib/supabase";
import { mergeConfig } from "@/lib/config";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const row = await readLatestConfig(sb());
    return NextResponse.json({ config: mergeConfig(row?.data) }, { headers: { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ config: mergeConfig(null) }, { headers: { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store" } });
  }
}
