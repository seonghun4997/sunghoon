import { sb, supabaseHost } from "@/lib/supabase";
import { BUILD } from "@/lib/config";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const report = {
    빌드버전: BUILD + " — 사이트 하단의 BUILD 표시와 같아야 최신 배포입니다",
    접속호스트: supabaseHost(),
    URL에_불필요한_꼬리있었음: url.trim() !== "https://" + supabaseHost(),
    SERVICE_KEY_형식정상: key.trim().startsWith("sb_secret_") || key.trim().startsWith("eyJ"),
    ADMIN_KEY_설정됨: !!process.env.ADMIN_KEY,
    읽기: {},
    쓰기테스트: "",
    구독자: {},
    설정_마지막저장: "",
  };
  try {
    const client = sb();
    for (const t of ["subscribers", "visits", "patchnotes", "site_config"]) {
      const { error } = await client.from(t).select("*", { count: "exact", head: true });
      report.읽기[t] = error ? "❌ " + error.message : "✅";
    }
    // 쓰기 테스트: 실데이터는 건드리지 않고 별도 검사행(id 999)으로 확인 후 삭제
    const { error: werr } = await client
      .from("site_config")
      .upsert({ id: 999, data: { probe: true }, updated_at: new Date().toISOString() });
    report.쓰기테스트 = werr ? "❌ " + werr.message : "✅ 저장 가능";
    if (!werr) await client.from("site_config").delete().eq("id", 999);

    // 구독자 현황 — "승인했는데 4촌에 안 보여요" 진단용
    const { data: subs } = await client.from("subscribers").select("chon,approved");
    const list = subs || [];
    const approvedList = list.filter((s) => s.approved);
    const dist = { "1촌": 0, "2촌": 0, "3촌": 0, "4촌": 0 };
    approvedList.forEach((s) => { const c = parseInt(s.chon, 10) || 4; dist[c + "촌"]++; });
    report.구독자 = {
      전체: list.length,
      승인됨: approvedList.length,
      대기중: list.length - approvedList.length,
      승인된_촌수분포: dist,
      참고: "승인됨 숫자가 0인데 어드민에서 승인했다면 → 어드민 저장이 실패한 것. 승인됨 숫자는 맞는데 사이트에 안 보이면 → 사이트 새로고침 필요",
    };

    // 사이트 편집기 마지막 저장 시각
    const { data: cfgRow } = await client.from("site_config").select("updated_at").eq("id", 1).maybeSingle();
    report.설정_마지막저장 = cfgRow?.updated_at || "아직 저장된 적 없음 (기본값 사용중)";
  } catch (e) {
    report.오류 = String(e.message || e);
  }
  return NextResponse.json(report);
}
