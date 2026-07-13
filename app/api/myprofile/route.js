import { sb, isApproved } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ★ v51: 구독자 본인 소개 수정 — 가입 시 등록한 본인 전화번호가 곧 인증 수단 (whoami와 동일한 방식)
//   수정 가능: 아이콘 / 직업 / 자랑 한 줄. 이름·촌수·승인 상태는 어드민만 수정 가능.
export async function POST(req) {
  try {
    const b = await req.json();
    const digits = String(b.phone || "").replace(/\D/g, "");
    if (digits.length < 10) return NextResponse.json({ ok: false, error: "invalid" });
    const client = sb();
    const { data: row } = await client.from("subscribers").select("*").eq("phone_digits", digits).maybeSingle();
    if (!row || !isApproved(row.approved)) return NextResponse.json({ ok: false, error: "denied" });
    const patch = {};
    if (typeof b.job === "string" && b.job.trim()) patch.job = b.job.trim().slice(0, 10);
    if (typeof b.intro === "string") patch.intro = b.intro.trim().slice(0, 20);
    if (typeof b.icon === "string" && b.icon.trim()) patch.icon = b.icon.trim().slice(0, 4);
    // ★ v52: 생일(선택) — "0514"/"5/14"/"19990514" → "MM-DD". 빈 값이면 삭제.
    if (typeof b.birthday === "string") {
      let d = b.birthday.replace(/\D/g, "");
      if (d.length === 8) d = d.slice(4);
      if (d.length === 3) d = "0" + d;
      if (d.length === 4) {
        const m = parseInt(d.slice(0, 2), 10), day = parseInt(d.slice(2), 10);
        if (m >= 1 && m <= 12 && day >= 1 && day <= 31) patch.birthday = d.slice(0, 2) + "-" + d.slice(2);
      } else if (d.length === 0) patch.birthday = null;
    }
    if (!Object.keys(patch).length) return NextResponse.json({ ok: false, error: "empty" });
    let { error } = await client.from("subscribers").update(patch).eq("id", row.id);
    if (error && "birthday" in patch) { // birthday 컬럼 미생성 디비 폴백
      const { birthday, ...rest } = patch;
      if (Object.keys(rest).length) ({ error } = await client.from("subscribers").update(rest).eq("id", row.id));
    }
    if (error) return NextResponse.json({ ok: false, error: "db" });
    const { data: after } = await client.from("subscribers").select("*").eq("id", row.id).single();
    return NextResponse.json({ ok: true, job: after?.job || "", intro: after?.intro || "", icon: after?.icon || "🙋", birthday: after?.birthday || "" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "server" });
  }
}
