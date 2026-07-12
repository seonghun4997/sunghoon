import { sb, kstDayStart, isApproved, readLatestConfig, writeNewConfig } from "@/lib/supabase";
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
      client.from("patchnotes").select("*").neq("version", "__config__").order("created_at", { ascending: false }),
      readLatestConfig(client),
    ]);
    const list = (subs.data || []).map((s) => ({ ...s, approved: isApproved(s.approved) }));
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
      config: mergeConfig(cfgRow?.data),
      configUpdatedAt: cfgRow?.updated_at || null,
      configId: cfgRow?.id || null,
      configV: cfgRow?.v ?? null,
      configVia: cfgRow?.via || null,
      configReadError: cfgRow?.readError || null,
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
      // ★ v33 저널 저장: 덮어쓰기 대신 새 버전 행 추가 — 과거 데이터가 최신 저장을 이길 수 없음
      // 충돌 방지: 이 탭이 본 버전 번호(baseId)와 현재 최신 번호가 다르면 차단
      const latest = await readLatestConfig(client);
      // ★ v36: 충돌 판정은 사람이 읽는 버전 번호(#101, #102…)로 통일
      if (!b.force && b.baseV != null && latest?.v != null && Number(latest.v) !== Number(b.baseV)) {
        return NextResponse.json({ error: "conflict", at: latest.updated_at, v: latest.v });
      }
      const clean = mergeConfig(b.data || {});
      const { check, error, warn } = await writeNewConfig(client, clean, latest?.v);
      if (error) return NextResponse.json({ error: "db", detail: error.message }, { status: 500 });
      // 방금 추가된 버전 행을 재조회해 그대로 반환 (프론트가 대조 검증)
      return NextResponse.json({ ok: true, saved: check?.data || null, at: check?.updated_at || null, id: check?.id || null, v: check?.v || null, warn: warn || null });
    }

    // 패치노트 등록
    if (b.action === "addnote") {
      const version = String(b.version || "").trim().slice(0, 20);
      if (version === "__config__") return NextResponse.json({ error: "invalid" }, { status: 400 });
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

    // ★ v43: 테스트 문자 1건 발송 — 연동 확인용, 솔라피의 응답 원문 일부를 그대로 보여줌
    if (b.action === "testsms") {
      const to = String(b.to || "").replace(/\D/g, "");
      if (to.length < 10) return NextResponse.json({ error: "invalid" }, { status: 400 });
      const r = await sendSMS(to, String(b.text || "[전성훈 상태창] 문자 연동 테스트입니다."));
      if (r.skipped) return NextResponse.json({ error: "no_sms" });
      let detail = "";
      try {
        const g = r.data?.groupInfo?.count || {};
        detail = "등록 " + (g.total ?? "?") + "건";
        const failed = (r.data?.failedMessageList || []);
        if (failed.length) detail += " · 실패: " + (failed[0].statusMessage || failed[0].statusCode || "원인미상");
      } catch (e) {}
      return NextResponse.json({ ok: !!r.ok, detail, raw: r.ok ? undefined : JSON.stringify(r.data || r.error || "").slice(0, 300) });
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
    // ★ 구독자 표시 정보 수정 (이름·직업·한줄소개) — 사이트 인맥 칸에 그대로 노출되는 값
    if (typeof b.name === "string") patch.name = b.name.trim().slice(0, 20);
    if (typeof b.job === "string") patch.job = b.job.trim().slice(0, 10);
    if (typeof b.intro === "string") patch.intro = b.intro.trim().slice(0, 20);
    const { error } = await client.from("subscribers").update(patch).eq("id", b.id);
    if (error) return NextResponse.json({ error: "db" }, { status: 500 });
    // ★ v39: 방금 기록된 행을 다시 읽어 그대로 반환 (프론트가 대조 검증)
    const { data: after } = await client.from("subscribers").select("*").eq("id", b.id).single();

    // 대기 → 승인으로 바뀐 순간, 환영 문자 자동 발송
    let sms = null;
    if (before && !isApproved(before.approved) && patch.approved === true) {
      sms = await sendSMS(
        before.phone,
        `[전성훈 상태창] ${before.name}님, 4촌 등록이 승인됐습니다! 앞으로 사업·인맥 소식을 보내드릴게요. ${SITE}`
      );
    }
    return NextResponse.json({ ok: true, smsSent: sms ? !sms.skipped : false, row: after ? { id: after.id, chon: parseInt(after.chon, 10) || 4, approved: isApproved(after.approved), name: after.name || "", job: after.job || "", intro: after.intro || "" } : null });
  } catch (e) {
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
