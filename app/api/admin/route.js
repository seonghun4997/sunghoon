import { sb, kstDayStart } from "@/lib/supabase";
import { mergeConfig } from "@/lib/config";
import { sendSMS } from "@/lib/solapi";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SITE = "https://sunghoon-nine.vercel.app";

function authed(key) {
  return key && key === process.env.ADMIN_KEY;
}

export async function GET(req) {
  const key = new URL(req.url).searchParams.get("key");
  if (!authed(key)) return NextResponse.json({ error: "denied" }, { status: 401 });
  try {
    const client = sb();
    const dayStart = kstDayStart();
    const [vt, vd, vqr, vshare, subs, notes, cfgRow] = await Promise.all([
      client.from("visits").select("*", { count: "exact", head: true }),
      client.from("visits").select("*", { count: "exact", head: true }).gte("created_at", dayStart),
      client.from("visits").select("*", { count: "exact", head: true }).eq("src", "qr"),
      client.from("visits").select("*", { count: "exact", head: true }).eq("src", "share"),
      client.from("subscribers").select("*").order("created_at", { ascending: false }),
      client.from("patchnotes").select("*").order("created_at", { ascending: false }),
      client.from("site_config").select("data").eq("id", 1).maybeSingle(),
    ]);
    const list = subs.data || [];
    const total = vt.count || 0;
    const qr = vqr.count || 0;
    const share = vshare.count || 0;
    return NextResponse.json({
      visitsTotal: total,
      visitsToday: vd.count || 0,
      srcQr: qr,
      srcShare: share,
      srcDirect: Math.max(0, total - qr - share),
      subsTotal: list.length,
      subsToday: list.filter((s) => s.created_at >= dayStart).length,
      pending: list.filter((s) => !s.approved).length,
      subscribers: list,
      notes: notes.data || [],
      config: mergeConfig(cfgRow?.data?.data),
      smsReady: !!(process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET && process.env.SOLAPI_SENDER),
    });
  } catch (e) {
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const b = await req.json();
    if (!authed(b.key)) return NextResponse.json({ error: "denied" }, { status: 401 });
    const client = sb();

    // 사이트 설정 저장
    if (b.action === "saveconfig") {
      const { error } = await client
        .from("site_config")
        .upsert({ id: 1, data: b.data || {}, updated_at: new Date().toISOString() });
      if (error) return NextResponse.json({ error: "db", detail: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // 패치노트 등록
    if (b.action === "addnote") {
      const version = String(b.version || "").trim().slice(0, 20);
      const content = String(b.content || "").trim().slice(0, 200);
      if (!version || !content) return NextResponse.json({ error: "invalid" }, { status: 400 });
      const { error } = await client.from("patchnotes").insert({ version, content });
      if (error) return NextResponse.json({ error: "db" }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // 패치노트 삭제
    if (b.action === "delnote") {
      await client.from("patchnotes").delete().eq("id", b.id);
      return NextResponse.json({ ok: true });
    }

    // 승인된 구독자 전체 문자 발송
    if (b.action === "broadcast") {
      const text = String(b.text || "").trim();
      if (!text) return NextResponse.json({ error: "invalid" }, { status: 400 });
      const { data } = await client.from("subscribers").select("phone").eq("approved", true);
      const phones = (data || []).map((s) => s.phone);
      if (phones.length === 0) return NextResponse.json({ error: "no_target" });
      const r = await sendSMS(phones, text);
      if (r.skipped) return NextResponse.json({ error: "no_sms" });
      return NextResponse.json({ ok: true, count: r.count });
    }

    // 구독자 촌수/승인 수정 (기본)
    const { data: before } = await client
      .from("subscribers")
      .select("approved,phone,name")
      .eq("id", b.id)
      .single();
    const patch = {};
    if (b.chon) patch.chon = parseInt(b.chon, 10);
    if (typeof b.approved === "boolean") patch.approved = b.approved;
    const { error } = await client.from("subscribers").update(patch).eq("id", b.id);
    if (error) return NextResponse.json({ error: "db" }, { status: 500 });

    // 대기 → 승인으로 바뀐 순간, 환영 문자 자동 발송
    let sms = null;
    if (before && !before.approved && patch.approved === true) {
      sms = await sendSMS(
        before.phone,
        `[전성훈 상태창] ${before.name}님, 4촌 등록이 승인됐습니다! 앞으로 사업·인맥 소식을 보내드릴게요. ${SITE}`
      );
    }
    return NextResponse.json({ ok: true, smsSent: sms ? !sms.skipped : false });
  } catch (e) {
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
