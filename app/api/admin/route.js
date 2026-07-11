import { sb, kstDayStart } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function authed(key) {
  return key && key === process.env.ADMIN_KEY;
}

export async function GET(req) {
  const key = new URL(req.url).searchParams.get("key");
  if (!authed(key)) return NextResponse.json({ error: "denied" }, { status: 401 });
  try {
    const client = sb();
    const dayStart = kstDayStart();
    const [vt, vd, subs] = await Promise.all([
      client.from("visits").select("*", { count: "exact", head: true }),
      client.from("visits").select("*", { count: "exact", head: true }).gte("created_at", dayStart),
      client.from("subscribers").select("*").order("created_at", { ascending: false }),
    ]);
    const list = subs.data || [];
    return NextResponse.json({
      visitsTotal: vt.count || 0,
      visitsToday: vd.count || 0,
      subsTotal: list.length,
      subsToday: list.filter((s) => s.created_at >= dayStart).length,
      pending: list.filter((s) => !s.approved).length,
      subscribers: list,
    });
  } catch (e) {
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const b = await req.json();
    if (!authed(b.key)) return NextResponse.json({ error: "denied" }, { status: 401 });
    const patch = {};
    if (b.chon) patch.chon = parseInt(b.chon, 10);
    if (typeof b.approved === "boolean") patch.approved = b.approved;
    const { error } = await sb().from("subscribers").update(patch).eq("id", b.id);
    if (error) return NextResponse.json({ error: "db" }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
