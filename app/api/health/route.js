import { sb, supabaseHost } from "@/lib/supabase";
import { BUILD, mergeConfig } from "@/lib/config";
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
    const { data: cfgRow } = await client.from("site_config").select("data,updated_at").eq("id", 1).maybeSingle();
    report.설정_마지막저장 = cfgRow?.updated_at || "아직 저장된 적 없음 (기본값 사용중)";

    // ★ 사이트가 지금 실제로 보여줄 값 — 여기 나오는 그대로 사이트에 표시됩니다
    const merged = mergeConfig(cfgRow?.data);
    report.사이트에_표시될_주요값 = {
      이름: merged.texts.name,
      칭호: merged.texts.titleChip,
      사업설명: merged.texts.bizDesc,
      인맥설명: merged.texts.netDesc,
      개발_스텟: (merged.stats.find((s) => s.name === "개발") || {}).v ?? "(없음)",
      HP: merged.hp.v,
      MP: merged.mp.v,
    };
    const { data: pub } = await client
      .from("subscribers")
      .select("job,intro,chon")
      .eq("approved", true)
      .order("created_at", { ascending: true });
    report.사이트_인맥에_표시될_승인구독자 = (pub || []).map((m) => (parseInt(m.chon, 10) || 4) + "촌 — " + m.job + (m.intro ? " (" + m.intro + ")" : ""));
  } catch (e) {
    report.오류 = String(e.message || e);
  }
  return NextResponse.json(report);
}
