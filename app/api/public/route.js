import { sb } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const client = sb();
    const [{ data }, { count }, { data: notes }] = await Promise.all([
      client
        .from("subscribers")
        .select("job,intro,chon")
        .eq("approved", true)
        .order("created_at", { ascending: true }),
      client.from("subscribers").select("*", { count: "exact", head: true }),
      client
        .from("patchnotes")
        .select("id,created_at,version,content")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    return NextResponse.json(
      { members: data || [], total: count || 0, notes: notes || [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json({ members: [], total: 0, notes: [] });
  }
}
