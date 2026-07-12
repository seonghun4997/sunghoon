import { sb, supabaseHost, isApproved } from "@/lib/supabase";
import { mergeConfig, BUILD } from "@/lib/config";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ★ v30 신설: 사이트·어드민이 쓰는 단일 데이터 통로.
//   과거의 어떤 캐시/서비스워커도 이 주소(/api/data2)를 모르므로 오염이 불가능하다.
//   또한 이 서버가 어느 디비에 연결돼 있는지(dbHost)를 함께 알려줘서 잘못된 연결을 즉시 들통나게 한다.
const NO_CACHE = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

export async function GET() {
  try {
    const client = sb();
    const [{ data: cfgRow }, { data: rows }, { data: notes }] = await Promise.all([
      client.from("site_config").select("data,updated_at").eq("id", 1).maybeSingle(),
      client.from("subscribers").select("*"),
      client.from("patchnotes").select("id,created_at,version,content").order("created_at", { ascending: false }).limit(10),
    ]);
    const all = rows || [];
    all.sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
    const members = all
      .filter((r) => isApproved(r.approved))
      .map((r) => ({ job: r.job || "", intro: r.intro || "", chon: r.chon }));
    return NextResponse.json(
      {
        build: BUILD,
        dbHost: supabaseHost(),
        config: mergeConfig(cfgRow?.data),
        configUpdatedAt: cfgRow?.updated_at || null,
        members,
        total: all.length,
        notes: notes || [],
      },
      { headers: NO_CACHE }
    );
  } catch (e) {
    return NextResponse.json(
      { build: BUILD, dbHost: supabaseHost(), config: mergeConfig(null), configUpdatedAt: null, members: [], total: 0, notes: [], error: String(e.message || e) },
      { headers: NO_CACHE }
    );
  }
}
