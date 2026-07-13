import { sb, isApproved, refToken } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ★ v42: 구독자 전화번호 인증 — 승인된 구독자면 촌수를 알려줘서 등급별 공개에 사용
//   (본인 번호를 아는 사람만 본인 등급을 확인할 수 있음)
const NO_CACHE = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

export async function POST(req) {
  try {
    const b = await req.json();
    const digits = String(b.phone || "").replace(/\D/g, "");
    if (digits.length < 10) return NextResponse.json({ ok: false }, { headers: NO_CACHE });
    const { data: row } = await sb()
      .from("subscribers")
      .select("*")
      .eq("phone_digits", digits)
      .maybeSingle();
    if (!row || !isApproved(row.approved)) {
      return NextResponse.json({ ok: false }, { headers: NO_CACHE });
    }
    return NextResponse.json(
      { ok: true, chon: parseInt(row.chon, 10) || 4, name: row.name || "", job: row.job || "", intro: row.intro || "", icon: row.icon || "🙋", birthday: row.birthday || "", refCode: row.id + "-" + refToken(row.id) },
      { headers: NO_CACHE }
    );
  } catch (e) {
    return NextResponse.json({ ok: false }, { headers: NO_CACHE });
  }
}
