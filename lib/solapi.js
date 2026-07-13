import crypto from "crypto";

function auth() {
  const key = process.env.SOLAPI_API_KEY;
  const secret = process.env.SOLAPI_API_SECRET;
  if (!key || !secret) return null;
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString("hex");
  const signature = crypto.createHmac("sha256", secret).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${signature}`;
}

// 문자 발송 (1명 또는 여러 명). SOLAPI 환경변수 없으면 조용히 건너뜀.
// ★ v48: opts.scheduledDate("2026-07-14T09:00:00+09:00" 형식)를 주면 솔라피가 그 시각에 예약 발송.
//        예약 취소는 solapi.com 콘솔 → 문자 → 예약 목록에서.
export async function sendSMS(toList, text, opts = {}) {
  const from = process.env.SOLAPI_SENDER;
  const authorization = auth();
  if (!authorization || !from) return { skipped: true };
  // 수신자: 문자열("0101234...") 또는 {to, text}(개인화 문구) 둘 다 지원
  const items = (Array.isArray(toList) ? toList : [toList])
    .map((t) => (typeof t === "object" && t ? { to: String(t.to).replace(/\D/g, ""), text: t.text } : { to: String(t).replace(/\D/g, ""), text: null }))
    .filter((t) => t.to.length >= 10);
  if (items.length === 0) return { skipped: true };
  try {
    const r = await fetch("https://api.solapi.com/messages/v4/send-many/detail", {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: items.map((it) => ({
          to: it.to,
          from: from.replace(/\D/g, ""),
          text: it.text || text,
        })),
        ...(opts.scheduledDate ? { scheduledDate: opts.scheduledDate } : {}),
      }),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, count: items.length, data };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
