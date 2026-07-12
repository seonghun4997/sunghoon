"use client";
import { useState, useEffect } from "react";

// 구독취소 페이지 — 문자 링크(/bye?p=번호&t=토큰)로 진입
export default function Bye() {
  const [state, setState] = useState("ask"); // ask | busy | done | fail
  const [params, setParams] = useState({ p: "", t: "" });
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    setParams({ p: q.get("p") || "", t: q.get("t") || "" });
  }, []);
  async function doUnsub() {
    setState("busy");
    try {
      const r = await fetch("/api/unsub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const d = await r.json();
      setState(d.ok ? "done" : "fail");
    } catch (e) { setState("fail"); }
  }
  return (
    <div className="wrap" style={{ paddingTop: 60, textAlign: "center" }}>
      <div className="card" style={{ padding: 26 }}>
        {state === "ask" && (
          <>
            <div style={{ fontSize: 34 }}>👋</div>
            <h2 style={{ margin: "12px 0 6px" }}>구독을 취소할까요?</h2>
            <div className="desc">취소하면 4촌 명단에서 빠지고, 더 이상 문자가 가지 않습니다.<br />언제든 다시 구독하실 수 있어요.</div>
            <button className="mp" style={{ width: "100%", marginTop: 16 }} onClick={doUnsub}>구독 취소하기</button>
            <a href="/" className="ghost" style={{ display: "block", marginTop: 8, padding: 12, textDecoration: "none", borderRadius: 12, border: "1px solid var(--line)", color: "var(--dim)" }}>취소 안 함 — 사이트로 가기</a>
          </>
        )}
        {state === "busy" && <div className="desc">처리 중...</div>}
        {state === "done" && (
          <>
            <div style={{ fontSize: 34 }}>✅</div>
            <h2 style={{ margin: "12px 0 6px" }}>구독이 취소되었습니다</h2>
            <div className="desc">그동안 감사했습니다. 언제든 다시 만나요!</div>
            <a href="/" style={{ color: "var(--gold)" }}>사이트로 가기</a>
          </>
        )}
        {state === "fail" && (
          <>
            <div style={{ fontSize: 34 }}>❌</div>
            <h2 style={{ margin: "12px 0 6px" }}>링크가 올바르지 않아요</h2>
            <div className="desc">문자에 온 구독취소 링크를 그대로 눌러주세요.</div>
          </>
        )}
      </div>
    </div>
  );
}
