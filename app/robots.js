export default function robots() {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/api/health"], disallow: ["/admin", "/api/admin", "/api/data2", "/api/config", "/api/public", "/api/subscribe", "/api/visit"] }],
  };
}
