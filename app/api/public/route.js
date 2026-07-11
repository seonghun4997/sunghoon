import { sb } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const client = sb();
    const [{ data }, { count }] = await Promise.all([
      client
        .from("subscribers")
        .select("job,intro,chon")
        .eq("approved", true)
        .order("created_at", { ascending: true }),
      client.from("subscribers").select("*", { count: "exact", head: true }),
    ]);
    return NextResponse.json({ members: data || [], total: count || 0 });
  } catch (e) {
    return NextResponse.json({ members: [], total: 0 });
  }
}
