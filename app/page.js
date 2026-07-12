"use client";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_CONFIG, mergeConfig, lines } from "@/lib/config";

const RANK = (v) => (v >= 9 ? "S" : v >= 7 ? "A" : v >= 5 ? "B" : v >= 3 ? "C" : "D");

const NET = [
  [1, "사적으로 9회 이상 만난 사람", [
    ["🛒", "커머스 마케터", "연매출 1,200억 커머스"],
    ["🛒", "커머스 마케터", "연매출 1,000억 커머스"],
  ]],
  [2, "사적으로 6회 이상 만난 사람", []],
  [3, "사적으로 3회 이상 만났거나, 1촌과 연결된 사람", [
    ["🍜", "F&B 대표", "엑싯 2회"],
    ["🧾", "세무사", "세무대 출신"],
    ["⚖️", "변호사", "서울대 출신"],
  ]],
  [4, "사적으로 1~3회 만났거나, 구독 신청한 사람", []],
];

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

  const T = cfg.texts;

  const stars = useMemo(
    () =>
      Array.from({ length: 42 }, () => ({
        left: Math.random() * 100 + "%",
        top: Math.random() * 100 + "%",
        delay: Math.random() * 3 + "s",
        gold: Math.random() < 0.25,
      })),
    []
  );

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
    fetch("/api/public")
      .then((r) => r.json())
      .then((d) => { setMembers(d.members || []); setTotal(d.total ?? 0); setNotes(d.notes || []); })
      .catch(() => {});
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => { if (d.config) setCfg(mergeConfig(d.config)); })
      .catch(() => {});
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
            <div className="title-chip">{T.titleChip}</div>
            <div className="name">{T.name}</div>
            <div className="sub">{T.subtitle}</div>
            <div className="tagline">{T.tagline}</div>
          </div>
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
        <div className="desc">{T.bizDesc}</div>
        {cfg.biz.map((b, i) => (
          <div className="biz" key={i}>
            <span className="ic">{b.icon}</span>
            <div><div className="nm">{b.name}</div><div className="tg">{b.tag}</div></div>
            <span className={`stage ${b.stage === "고도화" ? "adv" : "early"}`}>{b.stage}</span>
            <span className="lock">🔒</span>
          </div>
        ))}
        <div className="note">{T.bizNote}</div>
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
        <div className="desc">{T.netDesc}</div>
        {NET.map(([chon, rule, people]) => {
          const dyn = membersOf(chon);
          const all = [...people, ...dyn.map((m) => ["🙋", m.job, m.intro || ""])];
          if (chon === 4) {
            return (
              <div className="chon" key={chon}>
                <div className="chonhead"><span className="n t4">4촌</span><span className="r">{rule}</span></div>
                <button className="fold" onClick={() => setOpen4(!open4)}>
                  🙋 구독자 {total === null ? "-" : total}명 <span style={{ color: "var(--dim)", fontWeight: 400 }}>· {open4 ? "접기 ▲" : "눌러서 보기 ▼"}</span>
                </button>
                {open4 && (
                  all.length === 0 ? (
                    <div className="empty" style={{ marginTop: 8 }}>승인된 구독자가 표시되는 자리입니다</div>
                  ) : (
                    <div style={{ marginTop: 8 }}>
                      {all.map(([ic, nm, ds], i) => (
                        <div className="person" key={"4-" + i}>
                          <span className="ic">{ic}</span>
                          <div><div className="nm">{nm}</div><div className="ds">{ds}</div></div>
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
                <div className="empty">빈 슬롯 — 현재 모집중</div>
              ) : (
                all.map(([ic, nm, ds], i) => (
                  <div className="person" key={chon + "-" + i}>
                    <span className="ic">{ic}</span>
                    <div><div className="nm">{nm}</div><div className="ds">{ds}</div></div>
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
          <div className="loc" style={{ marginTop: 6 }}>{T.ctaWelcome}</div>
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
        <div className="footer">PRESS START TO NETWORK<br />SEOUL SEONGBUK · NO GAME OVER</div>
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

      {toastMsg && <div className="toast">{toastMsg}</div>}
    </>
  );
}
