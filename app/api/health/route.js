import { sb } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 환경변수/디비 연결 상태 자가진단 (비밀값은 노출하지 않음)
export async function GET() {
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const report = {
    SUPABASE_URL_설정됨: !!url,
    SUPABASE_URL_형식정상: url.startsWith("https://") && url.includes(".supabase.co"),
    SERVICE_KEY_설정됨: !!key,
    SERVICE_KEY_형식정상: key.startsWith("sb_secret_") || key.startsWith("eyJ"),
    ADMIN_KEY_설정됨: !!process.env.ADMIN_KEY,
    디비연결: false,
    테이블: {},
  };
  try {
    const client = sb();
    for (const t of ["subscribers", "visits", "patchnotes", "site_config"]) {
      const { error } = await client.from(t).select("*", { count: "exact", head: true });
      report.테이블[t] = error ? "❌ " + error.message : "✅";
      if (!error) report.디비연결 = true;
    }
  } catch (e) {
    report.디비연결오류 = String(e.message || e);
  }
  return NextResponse.json(report);
}
