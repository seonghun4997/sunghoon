import { sb } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ★ v50: 방문 기록 확장 — 익명 방문자ID(vid) / 인증번호(phone) / 체류초(dur) / 어드민 기기(is_admin)
export async function POST(req) {
  try {
    let b = {};
    try { b = (await req.json()) || {}; } catch (e) {}
    const client = sb();

    // 기존 방문 행 갱신 (체류시간 heartbeat / 번호 인증 시 연결)
    if (b.upd) {
      const id = parseInt(b.upd, 10);
      if (!id) return NextResponse.json({ ok: false });
      const patch = {};
      if (b.dur != null) {
        const d = parseInt(b.dur, 10);
        if (d > 0) patch.dur = Math.min(d, 7200); // 원본 상한 2시간 (통계 상한은 어드민에서 별도 조절)
      }
      if (b.phone) {
        const p = String(b.phone).replace(/\D/g, "").slice(0, 11);
        if (p.length >= 10) patch.phone = p;
      }
      if (Object.keys(patch).length) await client.from("visits").update(patch).eq("id", id);
      return NextResponse.json({ ok: true });
    }

    // 새 방문 기록
    const row = {
      src: b.src ? String(b.src).slice(0, 20) : null,
      vid: b.vid ? String(b.vid).slice(0, 24) : null,
      phone: b.phone ? String(b.phone).replace(/\D/g, "").slice(0, 11) || null : null,
      is_admin: b.admin === true,
    };
    const { data, error } = await client.from("visits").insert(row).select("id").single();
    if (error) {
      // 새 컬럼 SQL 미실행 상태여도 방문 수 집계는 유지 (구버전 방식으로 기록)
      await client.from("visits").insert({ src: row.src });
      return NextResponse.json({ ok: true, id: null });
    }
    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (e) {
    return NextResponse.json({ ok: false });
  }
}
