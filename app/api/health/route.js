import { sb, supabaseHost, isApproved, readLatestConfig } from "@/lib/supabase";
import { BUILD, mergeConfig } from "@/lib/config";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";


function kst(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ") + " (한국시간)";
}

export async function GET() {
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const report = {
    빌드버전: BUILD + " — 사이트 하단의 BUILD 표시와 같아야 최신 배포입니다",
    지금시각: kst(new Date().toISOString()),
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
    for (const t of ["subscribers", "visits", "patchnotes", "config_journal"]) {
      const { error } = await client.from(t).select("*", { count: "exact", head: true });
      report.읽기[t] = error ? "❌ " + error.message : "✅";
    }

    // ★★ v40: 새 저장소 왕복 자가테스트 — 넣고→바로 읽고→지우는 전 과정을 낱낱이 보고
    try {
      const steps = [];
      const { data: t, error: e1 } = await client
        .from("config_journal").insert({ v: 0, data: { probe: true } }).select("id").single();
      steps.push(e1 ? "쓰기 ❌ " + e1.message : "쓰기 ✅");
      if (!e1) {
        const { data: back, error: e2 } = await client
          .from("config_journal").select("id").eq("id", t.id).maybeSingle();
        steps.push(e2 ? "재조회 ❌ " + e2.message : back ? "재조회 ✅" : "재조회 ⚠️ 방금 쓴 행이 안 보임");
        const { count, error: e3 } = await client
          .from("config_journal").select("*", { count: "exact", head: true });
        steps.push(e3 ? "개수 ❌ " + e3.message : "전체 행 " + count + "개");
        const { error: e4 } = await client.from("config_journal").delete().eq("id", t.id);
        steps.push(e4 ? "삭제 ❌ " + e4.message : "삭제 ✅");
      }
      report.새저장소_왕복테스트 = steps.join(" → ");
    } catch (e) { report.새저장소_왕복테스트 = "❌ " + String(e.message || e); }

    // 설정 저장 이력 (최근 3개)
    try {
      const { data: js, error: je } = await client
        .from("config_journal").select("id,created_at,v").order("v", { ascending: false }).limit(3);
      if (je) report.설정저장_이력 = "❌ " + je.message;
      else report.설정저장_이력 = (js || []).length === 0 ? "저장된 적 없음 (기본값 사용중 — 정상)" : (js || []).map((r) => "#" + r.v + " · " + kst(r.created_at));
    } catch (e) { report.설정저장_이력 = "❌ " + String(e.message || e); }

    // 구독자 현황 — "승인했는데 4촌에 안 보여요" 진단용
    const { data: subs } = await client.from("subscribers").select("chon,approved");
    const list = subs || [];
    const approvedList = list.filter((s) => isApproved(s.approved));
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
    const cfgRow = await readLatestConfig(client);
    report.설정_마지막저장 = cfgRow?.updated_at ? kst(cfgRow.updated_at) : (cfgRow?.readError ? "❌ 조회 실패: " + cfgRow.readError : "아직 저장된 적 없음 (기본값 사용중)");
    report.설정_버전번호 = cfgRow?.v != null ? "#" + cfgRow.v : null;
    report.설정_저장경로 = cfgRow?.via || null;

    // ★ 사이트가 지금 실제로 보여줄 값 — 여기 나오는 그대로 사이트에 표시됩니다
    const merged = mergeConfig(cfgRow?.data);
    report.사이트에_표시될_주요값 = {
      이름: merged.texts.name,
      사업설명: merged.texts.bizDesc,
      인맥설명: merged.texts.netDesc,
      개발_스텟: (merged.stats.find((s) => s.name === "개발") || {}).v ?? "(없음)",
      HP: merged.hp.v,
      MP: merged.mp.v,
    };
    // 사이트와 완전히 동일한 방식(전체 조회 후 코드 필터)으로 승인 구독자 확인
    const { data: pubRows, error: pubErr } = await client.from("subscribers").select("*");
    if (pubErr) {
      report.사이트_인맥에_표시될_승인구독자 = "❌ 조회 오류: " + pubErr.message;
    } else {
      report.사이트_인맥에_표시될_승인구독자 = (pubRows || [])
        .filter((m) => isApproved(m.approved))
        .map((m) => (parseInt(m.chon, 10) || 4) + "촌 — " + (m.job || "") + (m.intro ? " (" + m.intro + ")" : ""));
      // 승인값이 어떤 형태로 저장돼 있는지도 표시 (원인 추적용)
      report.승인값_저장형태 = (pubRows || []).map((m) => (m.name || "?") + ": " + JSON.stringify(m.approved));
    }
  } catch (e) {
    report.오류 = String(e.message || e);
  }
  return NextResponse.json(report);
}
