"use client";
import { useState, useRef } from "react";
import { SECTION_LABELS, mergeConfig } from "@/lib/config";

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
  const [cfg, setCfg] = useState(null);
  const [cfgDirty, setCfgDirty] = useState(false);
  const [cfgSavedAt, setCfgSavedAt] = useState(null);
  const [cfgMsg, setCfgMsg] = useState("");
  const frameRef = useRef(null);

  async function load(k = key) {
    try {
      const r = await fetch("/api/admin?key=" + encodeURIComponent(k));
      if (!r.ok) return false;
      const d = await r.json();
      if (d.error) return false;
      setData(d);
      setEdits({});
      if (d.config && !cfgDirty) setCfg(mergeConfig(d.config));
      if (d.configUpdatedAt) setCfgSavedAt(d.configUpdatedAt);
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
    const r = await post({ action: "addnote", version: noteVer.trim(), content: noteContent.trim() });
    if (r.error === "db") { alert("저장 실패 — Supabase에 patchnotes 테이블이 없을 수 있습니다. SQL을 먼저 실행해주세요."); return; }
    if (!r.ok) { alert("저장 실패 — 잠시 후 다시 시도해주세요."); return; }
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

  /* ── 사이트 편집기 헬퍼 ── */
  const updateCfg = (next) => { setCfg(next); setCfgDirty(true); };
  const setText = (k, v) => updateCfg({ ...cfg, texts: { ...cfg.texts, [k]: v } });
  const moveSection = (i, dir) => {
    const o = [...cfg.order];
    const j = i + dir;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    updateCfg({ ...cfg, order: o });
  };
  const toggleHidden = (k) =>
    updateCfg({
      ...cfg,
      hidden: cfg.hidden.includes(k) ? cfg.hidden.filter((x) => x !== k) : [...cfg.hidden, k],
    });
  const listOps = (arrName) => ({
    set: (i, field, v) => {
      const arr = cfg[arrName].map((it, idx) => (idx === i ? { ...it, [field]: v } : it));
      updateCfg({ ...cfg, [arrName]: arr });
    },
    move: (i, dir) => {
      const arr = [...cfg[arrName]];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      updateCfg({ ...cfg, [arrName]: arr });
    },
    del: (i) => updateCfg({ ...cfg, [arrName]: cfg[arrName].filter((_, idx) => idx !== i) }),
    add: (item) => updateCfg({ ...cfg, [arrName]: [...cfg[arrName], item] }),
  });
  const infoOps = cfg ? listOps("info") : null;
  const statOps = cfg ? listOps("stats") : null;
  const bizOps = cfg ? listOps("biz") : null;

  async function saveConfig() {
    setCfgMsg("저장중...");
    const sent = JSON.stringify(cfg);
    const r = await post({ action: "saveconfig", data: cfg });
    if (r.error === "db") { setCfgMsg("❌ 저장 실패 — " + (r.detail || "디비 오류")); return; }
    if (!r.ok || !r.saved) { setCfgMsg("❌ 저장 실패 (" + JSON.stringify(r).slice(0, 120) + ")"); return; }
    const back = mergeConfig(r.saved);
    setCfg(back);
    setCfgDirty(false);
    setCfgSavedAt(r.at || null);
    if (JSON.stringify(back) !== sent) {
      setCfgMsg("⚠️ 저장은 됐지만 보낸 값과 디비 값이 달라요 — 이 화면을 캡처해주세요");
      return;
    }
    setCfgMsg("✓ 디비 저장·검증 완료 — 사이트를 새로고침하면 반영됩니다");
    if (frameRef.current) frameRef.current.src = "/?preview=" + Date.now();
    setTimeout(() => setCfgMsg(""), 6000);
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

          {/* 사이트 편집기 */}
          {cfg && (
            <div className="card">
              <div className="toolbar">
                <div className="sechead" style={{ border: "none", padding: 0, margin: 0 }}>
                  <h2>사이트 편집기</h2><span className="en">EDITOR</span>
                </div>
                <button className="sm" onClick={saveConfig}>저장 &amp; 반영</button>
              </div>
              <div className="adm-msg" style={{ padding: "0 0 10px", textAlign: "left" }}>
                수정 후 <b>저장 &amp; 반영</b>을 누르세요. 저장은 디비에 기록된 걸 다시 읽어 검증까지 마친 뒤에만 성공으로 표시됩니다.
                {cfgSavedAt && <> · 마지막 저장 {String(cfgSavedAt).slice(0, 16).replace("T", " ")}</>}
                {cfgDirty && <b style={{ color: "var(--gold)" }}> · 저장 안 된 수정사항 있음</b>}
                <br />{cfgMsg && <b style={{ color: cfgMsg.startsWith("✓") ? "var(--hp)" : "var(--red)" }}>{cfgMsg}</b>}
              </div>

              {/* 실사이트 미리보기 */}
              <div className="ed-frame">
                <iframe ref={frameRef} src="/" title="미리보기" />
              </div>

              {/* 섹션 순서/표시 */}
              <details className="ed-group" open>
                <summary>섹션 순서 · 표시</summary>
                {cfg.order.map((k, i) => (
                  <div className="ed-row" key={k}>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600, opacity: cfg.hidden.includes(k) ? 0.4 : 1 }}>
                      {SECTION_LABELS[k] || k}
                    </span>
                    <button className="sm ghost" onClick={() => moveSection(i, -1)}>▲</button>
                    <button className="sm ghost" onClick={() => moveSection(i, 1)}>▼</button>
                    <button className="sm ghost" onClick={() => toggleHidden(k)}>
                      {cfg.hidden.includes(k) ? "숨김" : "표시"}
                    </button>
                  </div>
                ))}
              </details>

              {/* 핵심 문구 */}
              <details className="ed-group">
                <summary>핵심 문구</summary>
                {[
                  ["dialog", "인카운터 대사"],
                  ["titleChip", "칭호"],
                  ["name", "이름"],
                  ["subtitle", "직함"],
                  ["tagline", "태그라인"],
                  ["level", "레벨"],
                ].map(([k, label]) => (
                  <div className="fgroup" key={k}>
                    <div className="flabel">{label}</div>
                    <input value={cfg.texts[k]} onChange={(e) => setText(k, e.target.value)} />
                  </div>
                ))}
              </details>

              {/* 기본 정보 */}
              <details className="ed-group">
                <summary>기본 정보</summary>
                {cfg.info.map((row, i) => (
                  <div className="ed-row" key={i}>
                    <input style={{ width: 90, flexShrink: 0 }} value={row.k} onChange={(e) => infoOps.set(i, "k", e.target.value)} />
                    <input style={{ flex: 1, minWidth: 0 }} value={row.v} onChange={(e) => infoOps.set(i, "v", e.target.value)} />
                    <button className="sm ghost" onClick={() => infoOps.move(i, -1)}>▲</button>
                    <button className="sm ghost" onClick={() => infoOps.move(i, 1)}>▼</button>
                    <button className="sm ghost" onClick={() => infoOps.del(i)}>✕</button>
                  </div>
                ))}
                <button className="sm" onClick={() => infoOps.add({ k: "항목", v: "내용" })}>+ 항목 추가</button>
              </details>

              {/* 스텟 */}
              <details className="ed-group">
                <summary>스텟</summary>
                {cfg.stats.map((s, i) => (
                  <div className="ed-row" key={i}>
                    <input style={{ flex: 1, minWidth: 0 }} value={s.name} onChange={(e) => statOps.set(i, "name", e.target.value)} />
                    <select style={{ width: 70, flexShrink: 0 }} value={s.v} onChange={(e) => statOps.set(i, "v", parseInt(e.target.value, 10))}>
                      {Array.from({ length: 10 }, (_, n) => <option key={n + 1} value={n + 1}>{n + 1}</option>)}
                    </select>
                    <button className="sm ghost" onClick={() => statOps.move(i, -1)}>▲</button>
                    <button className="sm ghost" onClick={() => statOps.move(i, 1)}>▼</button>
                    <button className="sm ghost" onClick={() => statOps.del(i)}>✕</button>
                  </div>
                ))}
                <button className="sm" onClick={() => statOps.add({ name: "새 스텟", v: 5 })}>+ 스텟 추가</button>
              </details>

              {/* 사업 */}
              <details className="ed-group">
                <summary>사업 목록</summary>
                <div className="fgroup">
                  <div className="flabel">섹션 제목</div>
                  <input value={cfg.texts.bizTitle} onChange={(e) => setText("bizTitle", e.target.value)} />
                </div>
                <div className="fgroup">
                  <div className="flabel">설명 문구</div>
                  <input value={cfg.texts.bizDesc} onChange={(e) => setText("bizDesc", e.target.value)} />
                </div>
                {cfg.biz.map((b, i) => (
                  <div className="ed-biz" key={i}>
                    <div className="ed-row">
                      <input style={{ width: 52, flexShrink: 0, textAlign: "center" }} value={b.icon} onChange={(e) => bizOps.set(i, "icon", e.target.value)} />
                      <input style={{ flex: 1, minWidth: 0 }} value={b.name} onChange={(e) => bizOps.set(i, "name", e.target.value)} />
                      <select style={{ width: 92, flexShrink: 0 }} value={b.stage} onChange={(e) => bizOps.set(i, "stage", e.target.value)}>
                        <option>고도화</option><option>초기</option>
                      </select>
                    </div>
                    <div className="ed-row">
                      <input style={{ flex: 1, minWidth: 0 }} value={b.tag} onChange={(e) => bizOps.set(i, "tag", e.target.value)} placeholder="이커머스 · 3개 · 2024년~" />
                      <button className="sm ghost" onClick={() => bizOps.move(i, -1)}>▲</button>
                      <button className="sm ghost" onClick={() => bizOps.move(i, 1)}>▼</button>
                      <button className="sm ghost" onClick={() => bizOps.del(i)}>✕</button>
                    </div>
                  </div>
                ))}
                <button className="sm" onClick={() => bizOps.add({ icon: "🆕", name: "새 사업", tag: "카테고리 · 1개", stage: "초기" })}>+ 사업 추가</button>
              </details>

              {/* 섹션 문구 */}
              <details className="ed-group">
                <summary>섹션 문구 (인맥·구독·포획)</summary>
                {[
                  ["netDesc", "인맥 설명"],
                  ["subTitle", "구독 버튼 문구"],
                  ["subDesc", "구독 설명"],
                  ["ctaLine", "포획 첫 줄"],
                  ["ctaVerbBefore", "잡기 전 어미"],
                  ["ctaVerbAfter", "잡은 후 어미"],
                  ["ctaWelcome", "환영 문구"],
                  ["ctaLocation", "위치 문구"],
                  ["caughtLine", "포획 성공 대사"],
                ].map(([k, label]) => (
                  <div className="fgroup" key={k}>
                    <div className="flabel">{label}</div>
                    <input value={cfg.texts[k]} onChange={(e) => setText(k, e.target.value)} />
                  </div>
                ))}
                <div className="fgroup">
                  <div className="flabel">미팅 안내 (줄바꿈 가능)</div>
                  <textarea rows={2} value={cfg.texts.ctaMeeting} style={{ resize: "vertical" }}
                    onChange={(e) => setText("ctaMeeting", e.target.value)} />
                </div>
              </details>

              <div style={{ textAlign: "right", marginTop: 14 }}>
                <button onClick={saveConfig}>저장 &amp; 반영</button>
              </div>
            </div>
          )}

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
