"use client";
import { useState } from "react";

export default function Admin() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [err, setErr] = useState(false);
  const [data, setData] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [edits, setEdits] = useState({});
  const [noteVer, setNoteVer] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [bcText, setBcText] = useState("");
  const [bcMsg, setBcMsg] = useState("");

  async function load(k = key) {
    try {
      const r = await fetch("/api/admin?key=" + encodeURIComponent(k));
      if (!r.ok) return false;
      const d = await r.json();
      if (d.error) return false;
      setData(d);
      setEdits({});
      return true;
    } catch (e) { return false; }
  }

  async function unlock() {
    setErr(false);
    const ok = await load();
    if (ok) setAuthed(true);
    else setErr(true);
  }

  async function post(body) {
    const r = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, ...body }),
    });
    return r.json().catch(() => ({}));
  }

  async function save(s) {
    const e = edits[s.id] || {};
    const chon = e.chon ?? s.chon;
    const approved = e.approved ?? (s.approved ? "Y" : "N");
    const res = await post({ id: s.id, chon: parseInt(chon, 10), approved: approved === "Y" || approved === true });
    setSavedId(s.id);
    setTimeout(() => setSavedId(null), 1500);
    if (res.smsSent) alert("승인 완료 — 환영 문자가 발송됐습니다.");
    load();
  }

  async function addNote() {
    if (!noteVer.trim() || !noteContent.trim()) return;
    await post({ action: "addnote", version: noteVer.trim(), content: noteContent.trim() });
    setNoteVer(""); setNoteContent("");
    load();
  }

  async function delNote(id) {
    if (!confirm("이 패치노트를 삭제할까요?")) return;
    await post({ action: "delnote", id });
    load();
  }

  async function broadcast() {
    const n = (data?.subscribers || []).filter((s) => s.approved).length;
    if (!bcText.trim()) return;
    if (!confirm(`승인된 구독자 ${n}명에게 문자를 발송합니다. 진행할까요?`)) return;
    setBcMsg("발송중...");
    const r = await post({ action: "broadcast", text: bcText.trim() });
    if (r.error === "no_sms") setBcMsg("❌ Solapi 환경변수(SOLAPI_API_KEY 등)가 아직 설정되지 않았습니다.");
    else if (r.error === "no_target") setBcMsg("❌ 승인된 구독자가 없습니다.");
    else if (r.ok) { setBcMsg(`✓ ${r.count}명에게 발송 완료`); setBcText(""); }
    else setBcMsg("❌ 발송 실패 — 잠시 후 다시 시도해주세요.");
  }

  const setEdit = (id, patch) => setEdits((p) => ({ ...p, [id]: { ...(p[id] || {}), ...patch } }));

  const cvr = data && data.visitsTotal > 0 ? ((data.subsTotal / data.visitsTotal) * 100).toFixed(1) : "0.0";
  const tip = !data ? "" :
    data.visitsTotal < 30 ? "표본이 아직 작아요. 방문 30 이상부터 전환율을 신뢰하세요." :
    parseFloat(cvr) >= 15 ? "전환율 15%↑ — 랜딩 훌륭합니다. 이제 트래픽(QR 배포)에 집중하세요." :
    parseFloat(cvr) >= 5 ? "전환율 5~15% — 준수합니다. 구독 멘트 A/B 테스트 여지 있음." :
    "전환율 5% 미만 — 구독 가치 제안을 보강해보세요.";

  const dist = { 1: 0, 2: 0, 3: 0, 4: 0 };
  (data?.subscribers || []).filter((s) => s.approved).forEach((s) => {
    const c = parseInt(s.chon) || 4;
    dist[c] = (dist[c] || 0) + 1;
  });

  return (
    <div className="wrap" style={{ paddingBottom: 80 }}>
      <div className="eyebrow" style={{ color: "var(--gold)" }}>— ADMIN CONSOLE —</div>

      {!authed ? (
        <div className="card">
          <div className="sechead"><h2>관리자 인증</h2><span className="en">AUTH</span></div>
          <div className="row">
            <input type="password" placeholder="관리자 키 입력" value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && unlock()} />
            <button onClick={unlock}>입장</button>
          </div>
          {err && <div className="adm-msg err">키가 올바르지 않거나 서버 연결에 실패했습니다.</div>}
        </div>
      ) : (
        <>
          {/* 지표 */}
          <div className="card">
            <div className="sechead"><h2>퍼포먼스</h2><span className="en">METRICS</span></div>
            <div className="metrics">
              <div className="mcard">
                <div className="k">총 방문</div>
                <div className="v">{data.visitsTotal}</div>
                <div className="s">오늘 +{data.visitsToday}</div>
              </div>
              <div className="mcard">
                <div className="k">총 구독 (전환)</div>
                <div className="v">{data.subsTotal}</div>
                <div className="s">오늘 +{data.subsToday} · 대기 <b style={{ color: "var(--red)" }}>{data.pending}</b></div>
              </div>
              <div className="mcard hl">
                <div className="k">전환율</div>
                <div className="v">{cvr}%</div>
                <div className="s">구독 ÷ 방문</div>
              </div>
              <div className="mcard">
                <div className="k">유입 경로</div>
                <div className="v" style={{ fontSize: 14.5, lineHeight: 2 }}>
                  📇 QR <b style={{ color: "var(--gold)" }}>{data.srcQr}</b> · 🔗 공유 <b style={{ color: "var(--mp)" }}>{data.srcShare}</b><br />
                  🚪 직접 <b>{data.srcDirect}</b>
                </div>
              </div>
              <div className="mcard" style={{ gridColumn: "1 / -1" }}>
                <div className="k">촌수 분포 (승인)</div>
                <div className="v" style={{ fontSize: 15 }}>
                  <span className="chip t1">1촌 {dist[1]}</span> <span className="chip t2">2촌 {dist[2]}</span> <span className="chip t3">3촌 {dist[3]}</span> <span className="chip t4">4촌 {dist[4]}</span>
                </div>
              </div>
            </div>
            <div className="adm-msg" style={{ paddingBottom: 0 }}>{tip}</div>
          </div>

          {/* 구독자 관리 */}
          <div className="card">
            <div className="toolbar">
              <div className="sechead" style={{ border: "none", padding: 0, margin: 0 }}>
                <h2>구독자 관리</h2><span className="en">SUBSCRIBERS</span>
              </div>
              <button className="sm" onClick={() => load()}>새로고침</button>
            </div>
            <div className="adm-msg" style={{ padding: "0 0 12px", textAlign: "left" }}>
              대기 → 승인으로 바꾸고 저장하면 환영 문자가 자동 발송됩니다{data.smsReady ? "" : " (Solapi 설정 후 활성화)"}.
            </div>
            {data.subscribers.length === 0 ? (
              <div className="adm-msg">아직 구독자가 없습니다.</div>
            ) : (
              data.subscribers.map((s) => {
                const e = edits[s.id] || {};
                const chonVal = e.chon ?? s.chon ?? 4;
                const apvVal = e.approved ?? (s.approved ? "Y" : "N");
                return (
                  <div className={`subitem ${s.approved ? "" : "pending"}`} key={s.id}>
                    <div className="top">
                      <span className="nm">
                        {s.name}{" "}
                        <span className={`badge ${s.approved ? "y" : "n"}`}>{s.approved ? "승인됨" : "대기중"}</span>
                      </span>
                      <span className="time">{String(s.created_at).slice(0, 16).replace("T", " ")}</span>
                    </div>
                    <div className="meta">{s.phone} · {s.job}</div>
                    {s.intro && <div className="intro">{s.intro}</div>}
                    <div className="ctrl">
                      <select value={chonVal} onChange={(ev) => setEdit(s.id, { chon: ev.target.value })}>
                        {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}촌</option>)}
                      </select>
                      <select value={apvVal} onChange={(ev) => setEdit(s.id, { approved: ev.target.value })}>
                        <option value="N">대기</option>
                        <option value="Y">승인</option>
                      </select>
                      <button className="sm" onClick={() => save(s)}>저장</button>
                      {savedId === s.id && <span className="saved">저장됨 ✓</span>}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 패치노트 관리 */}
          <div className="card">
            <div className="sechead"><h2>패치노트</h2><span className="en">PATCH NOTES</span></div>
            <div className="fgroup">
              <div className="flabel">버전 (예: v1.2)</div>
              <input value={noteVer} maxLength={20} placeholder="v1.0" onChange={(e) => setNoteVer(e.target.value)} />
            </div>
            <div className="fgroup">
              <div className="flabel">내용 (예: AI 사주 플랫폼 첫 매출 발생)</div>
              <input value={noteContent} maxLength={200} placeholder="업데이트 내용" onChange={(e) => setNoteContent(e.target.value)} />
            </div>
            <div style={{ textAlign: "right", marginBottom: 14 }}>
              <button className="sm" disabled={!noteVer.trim() || !noteContent.trim()} onClick={addNote}>등록</button>
            </div>
            {(data.notes || []).map((n) => (
              <div className="subitem" key={n.id}>
                <div className="top">
                  <span className="nm"><span className="chip t1" style={{ marginRight: 6 }}>{n.version}</span>{n.content}</span>
                  <button className="sm ghost" onClick={() => delNote(n.id)}>삭제</button>
                </div>
                <div className="meta">{String(n.created_at).slice(0, 10)}</div>
              </div>
            ))}
          </div>

          {/* 단체 문자 */}
          <div className="card">
            <div className="sechead"><h2>단체 문자</h2><span className="en">BROADCAST</span></div>
            <div className="adm-msg" style={{ padding: "0 0 12px", textAlign: "left" }}>
              승인된 구독자 전원에게 발송됩니다. 사업 소식·인맥 업데이트 알림용.
            </div>
            <textarea rows={3} value={bcText} maxLength={1000} style={{ resize: "vertical" }}
              placeholder="예: [전성훈 상태창] 패치노트 v1.2 — AI 사주 플랫폼 오픈했습니다. sunghoon-nine.vercel.app"
              onChange={(e) => setBcText(e.target.value)} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
              <span className="adm-msg" style={{ padding: 0 }}>{bcMsg}</span>
              <button className="sm" disabled={!bcText.trim()} onClick={broadcast}>발송</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
