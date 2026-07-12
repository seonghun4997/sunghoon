import { sb, supabaseHost } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const report = {
    접속호스트: supabaseHost(),
    URL에_불필요한_꼬리있었음: url.trim() !== "https://" + supabaseHost(),
    SERVICE_KEY_형식정상: key.trim().startsWith("sb_secret_") || key.trim().startsWith("eyJ"),
    ADMIN_KEY_설정됨: !!process.env.ADMIN_KEY,
    읽기: {},
    쓰기테스트: "",
  };
  try {
    const client = sb();
    for (const t of ["subscribers", "visits", "patchnotes", "site_config"]) {
      const { error } = await client.from(t).select("*", { count: "exact", head: true });
      report.읽기[t] = error ? "❌ " + error.message : "✅";
    }
    // 쓰기 테스트: site_config에 upsert 시도 (저장 & 반영과 동일한 동작)
    const { data: cur } = await client.from("site_config").select("data").eq("id", 1).maybeSingle();
    const { error: werr } = await client
      .from("site_config")
      .upsert({ id: 1, data: cur?.data || {}, updated_at: new Date().toISOString() });
    report.쓰기테스트 = werr ? "❌ " + werr.message : "✅ 저장 가능";
  } catch (e) {
    report.오류 = String(e.message || e);
  }
  return NextResponse.json(report);
}
