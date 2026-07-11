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
export async function sendSMS(toList, text) {
  const from = process.env.SOLAPI_SENDER;
  const authorization = auth();
  if (!authorization || !from) return { skipped: true };
  const tos = (Array.isArray(toList) ? toList : [toList])
    .map((t) => String(t).replace(/\D/g, ""))
    .filter((t) => t.length >= 10);
  if (tos.length === 0) return { skipped: true };
  try {
    const r = await fetch("https://api.solapi.com/messages/v4/send-many/detail", {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: tos.map((to) => ({
          to,
          from: from.replace(/\D/g, ""),
          text,
        })),
      }),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, count: tos.length, data };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
