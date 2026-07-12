import { sb, isApproved } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const client = sb();
    // ★ 승인 구독자 조회를 "전체 조회 후 코드에서 필터" 방식으로 교체
    //   — 디비 컬럼 타입이 무엇이든, eq 필터가 실패하는 상황이든 절대 빈 결과가 나오지 않음
    const [{ data: rows, error: subErr }, { data: notes }] = await Promise.all([
      client.from("subscribers").select("*"),
      client
        .from("patchnotes")
        .select("id,created_at,version,content")
        .neq("version", "__config__")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    const all = rows || [];
    // 오래된 순 정렬 (created_at 없어도 안 깨짐)
    all.sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
    const members = all
      .filter((r) => isApproved(r.approved))
      .map((r) => ({ job: r.job || "", intro: r.intro || "", chon: r.chon }));
    return NextResponse.json(
      {
        members,
        total: all.length,
        notes: notes || [],
        ...(subErr ? { subscribersError: subErr.message } : {}),
      },
      { headers: { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json(
      { members: [], total: 0, notes: [], error: String(e.message || e) },
      { headers: { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store" } }
    );
  }
}
