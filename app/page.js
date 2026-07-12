"use client";
import { useEffect, useState } from "react";
import { DEFAULT_CONFIG, mergeConfig, lines, BUILD } from "@/lib/config";

const RANK = (v) => (v >= 9 ? "S" : v >= 7 ? "A" : v >= 5 ? "B" : v >= 3 ? "C" : "D");

// 사업 단계 → 칩 색상 클래스 (확장=금색, 고도화=초록, 성장=파랑, 초기=회색)
const STAGE_CLS = { 확장: "expand", 고도화: "adv", 성장: "grow", 초기: "early" };

function ML({ t }) {
  const arr = lines(t);
  return arr.map((l, i) => (
    <span key={i}>{l}{i < arr.length - 1 && <br />}</span>
  ));
}

export default function Home() {
  const [cfg, setCfg] = useState(DEFAULT_CONFIG);
  const [dlg, setDlg] = useState("");
  const [members, setMembers] = useState([]);
  const [total, setTotal] = useState(null);
  const [open4, setOpen4] = useState(false);
  const [notes, setNotes] = useState([]);
  const [phase, setPhase] = useState("idle");
  const [subOpen, setSubOpen] = useState(false);
  const [subDone, setSubDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", job: "", intro: "" });
  const [toastMsg, setToastMsg] = useState("");
  const [lock, setLock] = useState(null); // {title, desc} — 구독 유도 모달

  const T = cfg.texts;

  const [stars, setStars] = useState([]);
  useEffect(() => {
    setStars(
      Array.from({ length: 42 }, () => ({
        left: Math.random() * 100 + "%",
        top: Math.random() * 100 + "%",
        delay: Math.random() * 3 + "s",
        gold: Math.random() < 0.25,
      }))
    );
  }, []);

  // 대화창 타자기 (문구가 바뀌면 다시 타이핑)
  useEffect(() => {
    let i = 0;
    setDlg("");
    const t = setInterval(() => {
      i++;
      setDlg(T.dialog.slice(0, i));
      if (i >= T.dialog.length) clearInterval(t);
    }, 55);
    return () => clearInterval(t);
  }, [T.dialog]);

  useEffect(() => {
    // ★ 킬스위치: 과거 사이트가 브라우저에 남긴 서비스워커·캐시를 전부 제거
    //   (서버를 아무리 고쳐도 브라우저가 옛날 응답을 돌려주던 원인 차단)
    try {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
      }
      if (typeof caches !== "undefined" && caches.keys) {
        caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
      }
    } catch (e) {}

    const src = new URLSearchParams(location.search).get("src");
    const ping = () =>
      fetch("/api/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ src }),
      }).catch(() => {});
    try {
      if (!sessionStorage.getItem("visited")) {
        sessionStorage.setItem("visited", "1");
        ping();
      }
    } catch (e) { ping(); }

    // ★ 최신 데이터 불러오기 — 처음 1회 + 탭으로 돌아올 때 + 30초마다 자동 갱신
    //   (어드민에서 저장하면 열려있는 사이트에도 새로고침 없이 반영됨)
    const loadData = () => {
      fetch("/api/public?t=" + Date.now(), { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => { setMembers(d.members || []); setTotal(d.total ?? 0); setNotes(d.notes || []); })
        .catch(() => {});
      fetch("/api/config?t=" + Date.now(), { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => { if (d.config) setCfg(mergeConfig(d.config)); })
        .catch(() => {});
    };
    loadData();
    const onVisible = () => { if (document.visibilityState === "visible") loadData(); };
    const timer = setInterval(loadData, 30000);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const toast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 1800);
  };

  const canSubmit =
    form.name.trim() && form.phone.replace(/\D/g, "").length >= 10 && form.job.trim();

  async function doSub() {
    setSending(true);
    try {
      const r = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (d.error === "dup") { toast("이미 구독된 번호입니다"); setSending(false); return; }
      if (!d.ok) { toast("전송 실패 — 다시 시도해주세요"); setSending(false); return; }
      setSubDone(true);
    } catch (e) {
      toast("전송 실패 — 다시 시도해주세요");
    }
    setSending(false);
  }

  async function shareLink() {
    const url = location.origin + "/?src=share";
    if (navigator.share) {
      try {
        await navigator.share({ title: T.name + " — " + T.subtitle, text: "야생의 " + T.name + "을 만나보세요", url });
      } catch (e) {}
    } else {
      try { await navigator.clipboard.writeText(url); toast("링크가 복사됐습니다!"); }
      catch (e) { prompt("링크를 복사하세요:", url); }
    }
  }

  function throwBall() {
    if (phase !== "idle") return;
    setPhase("fly");
    setTimeout(() => setPhase("absorb"), 600);
    setTimeout(() => setPhase("wobble"), 950);
    setTimeout(() => setPhase("caught"), 2750);
  }

  const membersOf = (chon) => members.filter((m) => (parseInt(m.chon) || 4) === chon);
  const openSub = () => { setSubOpen(true); setSubDone(false); };

  /* ── 섹션 렌더러 (순서·표시는 cfg가 결정) ── */
  const sections = {
    encounter: (
      <div key="encounter">
        <div className="encounter">
          <div className="wild">
            <img src="/wild-sprite.png" alt="야생" className="wild-img" />
            <div className="platform" />
          </div>
          <div className="balls">
            {Array.from({ length: 6 }, (_, i) => <i key={i} />)}
            <span className="bracket" />
          </div>
          <div className="trainer">
            <img src="/trainer.png" alt="트레이너" className="trainer-img" />
            <div className="platform small" />
          </div>
        </div>
        <div className="dialog">
          <span>{dlg}</span>
          <span className="arrow">▼</span>
        </div>
      </div>
    ),

    hero: (
      <section className="card" key="hero">
        <div className="hero">
          <div className="sprite-box">
            <img src="/profile.jpg" alt={T.name} width={126} height={126} />
            <div className="lv">{T.level}</div>
          </div>
          <div style={{ minWidth: 0, paddingTop: 4 }}>
            {T.titleChip?.trim() && <div className="title-chip">{T.titleChip}</div>}
            <div className="name">{T.name}</div>
            {T.subtitle?.trim() && <div className="sub">{T.subtitle}</div>}
            {T.tagline?.trim() && <div className="tagline">{T.tagline}</div>}
          </div>
        </div>
        <div className="barwrap">
          <div className="barhead">
            <span className="lb" style={{ color: cfg.hp.v <= 30 ? "#FF5B5B" : "var(--hp)" }}>HP</span>
            <span className="val">{cfg.hp.v} / 100</span>
          </div>
          <div className="bar">
            <div className={cfg.hp.v <= 30 ? "hp-crit" : ""} style={{ width: Math.max(2, cfg.hp.v) + "%", background: cfg.hp.v <= 30 ? "#FF5B5B" : "var(--hp)" }} />
          </div>
          {cfg.hp.cap?.trim() && <div className="cap">{cfg.hp.cap}</div>}
        </div>
        <div className="barwrap">
          <div className="barhead">
            <span className="lb" style={{ color: "var(--mp)" }}>MP</span>
            <span className="val">{cfg.mp.v} / 100</span>
          </div>
          <div className="bar">
            <div style={{ width: Math.max(2, cfg.mp.v) + "%", background: "var(--mp)" }} />
          </div>
          {cfg.mp.cap?.trim() && <div className="cap">{cfg.mp.cap}</div>}
        </div>
      </section>
    ),

    info: (
      <section className="card" key="info">
        <div className="sechead"><h2>기본 정보</h2><span className="en">INFO</span></div>
        {cfg.info.map((row, i) => (
          <div className="inforow" key={i}>
            <span className="k">{row.k}</span>
            <span className="v"><ML t={row.v} /></span>
          </div>
        ))}
      </section>
    ),

    stat: (
      <section className="card" key="stat">
        <div className="sechead"><h2>스텟</h2><span className="en">STAT</span></div>
        {cfg.stats.map((s) => (
          <div className="stat" key={s.name}>
            <span className="nm">{s.name}</span>
            <span className="seg">
              {Array.from({ length: 10 }, (_, i) => <i key={i} className={i < s.v ? "on" : ""} />)}
            </span>
            <span className="pt">{s.v}</span>
            <span className={`rank ${RANK(s.v)}`}>{RANK(s.v)}</span>
          </div>
        ))}
      </section>
    ),

    biz: (
      <section className="card" key="biz">
        <div className="sechead"><h2>{T.bizTitle}</h2><span className="en">BUSINESS</span></div>
        {T.bizDesc?.trim() && <div className="desc">{T.bizDesc}</div>}
        {cfg.biz.map((b, i) => (
          <div className="biz" key={i}>
            <span className="ic">{b.icon}</span>
            <div style={{ minWidth: 0 }}><div className="nm">{b.name}</div><div className="tg">{b.tag}</div></div>
            <span className={`stage ${STAGE_CLS[b.stage] || "early"}`}>{b.stage}</span>
            <button className="mini-act" onClick={() => setLock({ title: T.lockBizTitle, desc: T.lockBizDesc })}>자세히 🔒</button>
          </div>
        ))}
        {T.bizNote?.trim() && <div className="note">{T.bizNote}</div>}
      </section>
    ),

    notes: notes.length > 0 && (
      <section className="card" key="notes">
        <div className="sechead"><h2>패치노트</h2><span className="en">PATCH NOTES</span></div>
        <div className="desc">{T.name}의 최근 업데이트 내역입니다.</div>
        {notes.map((n) => (
          <div className="pnote" key={n.id}>
            <span className="ver">{n.version}</span>
            <div style={{ minWidth: 0 }}>
              <div className="pn-c">{n.content}</div>
              <div className="pn-d">{String(n.created_at).slice(0, 10)}</div>
            </div>
          </div>
        ))}
      </section>
    ),

    network: (
      <section className="card" key="network">
        <div className="sechead"><h2>인맥</h2><span className="en">NETWORK</span></div>
        {T.netDesc?.trim() && <div className="desc">{T.netDesc}</div>}
        {cfg.network.map((g) => {
          const chon = g.chon;
          const rule = g.rule;
          const dyn = membersOf(chon);
          const all = [
            ...(g.people || []).map((p) => [p.icon, p.job, p.desc]),
            ...dyn.map((m) => ["🙋", m.job, m.intro || ""]),
          ];
          if (chon === 4) {
            return (
              <div className="chon" key={chon}>
                <div className="chonhead"><span className="n t4">4촌</span><span className="r">{rule}</span></div>
                <button className="fold" onClick={() => setOpen4(!open4)}>
                  🙋 구독자 {total === null ? "-" : total}명 <span style={{ color: "var(--dim)", fontWeight: 400 }}>· {open4 ? "접기 ▲" : "눌러서 보기 ▼"}</span>
                </button>
                {open4 && (
                  all.length === 0 ? (
                    <div className="empty" style={{ marginTop: 8 }}>{T.net4Empty}</div>
                  ) : (
                    <div style={{ marginTop: 8 }}>
                      {all.map(([ic, nm, ds], i) => (
                        <div className="person" key={"4-" + i}>
                          <span className="ic">{ic}</span>
                          <div style={{ minWidth: 0 }}><div className="nm">{nm}</div><div className="ds">{ds}</div></div>
                          <button className="mini-act" onClick={() => setLock({ title: T.lockNetTitle, desc: T.lockNetDesc })}>소개받기</button>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            );
          }
          return (
            <div className="chon" key={chon}>
              <div className="chonhead"><span className={`n t${chon}`}>{chon}촌</span><span className="r">{rule}</span></div>
              {all.length === 0 ? (
                <div className="empty">{T.netEmpty}</div>
              ) : (
                all.map(([ic, nm, ds], i) => (
                  <div className="person" key={chon + "-" + i}>
                    <span className="ic">{ic}</span>
                    <div style={{ minWidth: 0 }}><div className="nm">{nm}</div><div className="ds">{ds}</div></div>
                    <button className="mini-act" onClick={() => setLock({ title: T.lockNetTitle, desc: T.lockNetDesc })}>소개받기</button>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </section>
    ),

    subscribe: (
      <section className="card" key="subscribe">
        <div className="sechead"><h2>구독</h2><span className="en" style={{ color: "var(--mp)" }}>SUBSCRIBE</span></div>
        <div className="desc">
          {T.subDesc}
          {total !== null && total > 0 && (
            <><br />현재 <b style={{ color: "var(--mp)" }}>{total}명</b>이 구독중입니다.</>
          )}
        </div>
        <div style={{ textAlign: "center" }}>
          <button className="mp" onClick={openSub}>{T.subTitle}</button>
        </div>
      </section>
    ),

    catch: (
      <section className="card" key="catch">
        <div className="sechead"><h2>포획</h2><span className="en">CATCH & MEET</span></div>
        <div className="catch-scene">
          {phase !== "caught" ? (
            <>
              <div className={`c-wild ${phase === "absorb" || phase === "wobble" ? "absorbed" : ""}`}>
                <img src="/wild-sprite.png" alt="야생" className="c-wild-img" />
                <div className="platform" style={{ width: 130 }} />
              </div>
              {phase === "fly" && <div className="cball fly" />}
              {phase === "absorb" && <div className="cball attop" />}
              {phase === "wobble" && <div className="cball wob" />}
              {phase === "idle" && (
                <button className="throw-btn" onClick={throwBall}>
                  <span className="cball mini" /> 공 던져서 잡기
                </button>
              )}
            </>
          ) : (
            <div className="caught-wrap">
              <span className="spark s1">✨</span>
              <div className="cball" />
              <span className="spark s2">✨</span>
            </div>
          )}
        </div>
        {phase === "caught" && (
          <div className="dialog" style={{ marginBottom: 16 }}>
            {T.caughtLine}<span className="arrow">▼</span>
          </div>
        )}
        <div className="cta" style={{ paddingTop: 0 }}>
          <div className="big">
            {T.ctaLine}<br />
            <span style={{ color: "var(--gold)" }}>{T.name}</span>을 {phase === "caught" ? T.ctaVerbAfter : T.ctaVerbBefore}
          </div>
          {T.ctaWelcome?.trim() && <div className="loc" style={{ marginTop: 6 }}>{T.ctaWelcome}</div>}
          <div className="loc" style={{ marginTop: 14 }}>
            <ML t={T.ctaMeeting} /><br />
            {T.ctaLocation}
          </div>
          <div className="battle">
            <button onClick={shareLink}><b>▶</b>공유하기</button>
            <button onClick={openSub}><b>▶</b>구독하기</button>
          </div>
        </div>
      </section>
    ),
  };

  const visible = cfg.order.filter((k) => !cfg.hidden.includes(k));

  return (
    <>
      <div className="stars">
        {stars.map((s, i) => (
          <i key={i} className={s.gold ? "g" : ""} style={{ left: s.left, top: s.top, animationDelay: s.delay }} />
        ))}
      </div>

      <div className="wrap">
        <div className="eyebrow">— PLAYER STATUS —</div>
        {visible.map((k) => sections[k] || null)}
        <div className="footer">PRESS START TO NETWORK<br />SEOUL SEONGBUK · NO GAME OVER<br /><span style={{ opacity: 0.45, fontSize: "0.85em" }}>BUILD {BUILD}</span></div>
      </div>

      {/* 하단 구독바 */}
      <div className="bottombar">
        <div className="inner">
          {subDone ? (
            <div className="msg" style={{ textAlign: "center", width: "100%" }}>
              <b className="inline">✓ 구독 접수 완료</b> — 승인되면 4촌에 등록됩니다
            </div>
          ) : (
            <>
              <div className="msg"><b>새 사업 · 인맥 소식 받기</b>구독하면 4촌으로 등록됩니다</div>
              <button className="mp" onClick={openSub}>📡 구독하기</button>
            </>
          )}
        </div>
      </div>

      {/* 구독 모달 */}
      {subOpen && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setSubOpen(false)}>
          <div className="modal">
            {subDone ? (
              <div className="centerpad">
                <div style={{ fontSize: 32 }}>📡</div>
                <div style={{ fontWeight: 800, fontSize: 17, marginTop: 10, color: "var(--mp)" }}>구독 접수 완료!</div>
                <div style={{ fontSize: 13.5, color: "var(--dim)", marginTop: 6 }}>
                  승인되면 4촌 명단에 등록됩니다.<br />사업·인맥 업데이트가 문자로 갑니다.
                </div>
                <div style={{ marginTop: 18 }}><button onClick={() => setSubOpen(false)}>닫기</button></div>
              </div>
            ) : (
              <>
                <div className="sechead" style={{ border: "none", paddingBottom: 0, marginBottom: 6 }}>
                  <h2 style={{ fontSize: 17 }}>구독 = 4촌 등록</h2>
                  <span className="en" style={{ color: "var(--mp)" }}>SUBSCRIBE</span>
                </div>
                <div className="desc">신청 후 승인되면 4촌에 등록됩니다. 이름은 비공개, 직업과 소개만 표시됩니다.</div>
                <div className="fgroup">
                  <div className="flabel">이름 (비공개 · 연락용)</div>
                  <input value={form.name} maxLength={20} placeholder="홍길동"
                    onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="fgroup">
                  <div className="flabel">연락처</div>
                  <input value={form.phone} inputMode="tel" placeholder="010-0000-0000"
                    onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="fgroup">
                  <div className="flabel">직업 <span style={{ opacity: 0.6 }}>(10자 이내)</span></div>
                  <input value={form.job} maxLength={10} placeholder="예: 이커머스 마케터"
                    onChange={(e) => setForm({ ...form, job: e.target.value })} />
                </div>
                <div className="fgroup">
                  <div className="flabel">나를 소개하는 한 줄 <span style={{ opacity: 0.6 }}>(20자 이내)</span></div>
                  <textarea value={form.intro} maxLength={20} rows={2} placeholder="예: 뷰티 브랜드 3개 키워봄"
                    style={{ resize: "vertical" }}
                    onChange={(e) => setForm({ ...form, intro: e.target.value })} />
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                  <button className="sm ghost" onClick={() => setSubOpen(false)}>닫기</button>
                  <button className="sm mp" disabled={!canSubmit || sending} onClick={doSub}>
                    {sending ? "전송중..." : "구독하기"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 구독 유도 모달 */}
      {lock && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setLock(null)}>
          <div className="modal" style={{ textAlign: "center", padding: "26px 22px" }}>
            <div style={{ fontSize: 32 }}>🔒</div>
            <div style={{ fontWeight: 800, fontSize: 18, marginTop: 10 }}>{lock.title}</div>
            <div style={{ fontSize: 14, color: "var(--dim)", marginTop: 8, lineHeight: 1.8 }}>{lock.desc}</div>
            <div style={{ marginTop: 18, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="mp" onClick={() => { setLock(null); openSub(); }}>{T.lockBtn}</button>
              <button className="ghost" onClick={() => setLock(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="toast">{toastMsg}</div>}
    </>
  );
}
