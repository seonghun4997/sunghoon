import { sb } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data } = await sb()
      .from("subscribers")
      .select("job,intro,chon")
      .eq("approved", true)
      .order("created_at", { ascending: true });
    return NextResponse.json({ members: data || [] });
  } catch (e) {
    return NextResponse.json({ members: [] });
  }
}
