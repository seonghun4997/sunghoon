"use client";
import { useEffect, useState, useRef } from "react";
import { DEFAULT_CONFIG, mergeConfig, lines, BUILD, CANONICAL_HOST, NET_CATS, autoCat } from "@/lib/config";

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
  const [diag, setDiag] = useState({ db: "", v: null }); // 푸터 자가진단용 (디비·설정버전)
  const [open4, setOpen4] = useState(false);
  const [notes, setNotes] = useState([]);
  const [phase, setPhase] = useState("idle");
  const [subOpen, setSubOpen] = useState(false);
  const [subDone, setSubDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", job: "", intro: "", icon: "🙋", birthday: "", refName: "" });
  const [toastMsg, setToastMsg] = useState("");
  const [lock, setLock] = useState(null); // {title, desc} — 구독 유도 모달
  // ★ v51: 구독자 본인 소개 수정 모달
  const [me, setMe] = useState(null); // {icon, job, intro} 편집값 (null = 닫힘)
  const [meBusy, setMeBusy] = useState(false);
  const [meMsg, setMeMsg] = useState("");
  const loadDataRef = useRef(null);
  const [catSel, setCatSel] = useState(null); // ★ v52: 인맥 카테고리 선택 (null = 미선택)
  const [refOpen, setRefOpen] = useState(false); // ★ v62: 추천 모달
  const [viewer, setViewer] = useState(null); // {chon, name} — 인증된 구독자 등급 (null = 미구독 방문자)
  const [unlock, setUnlock] = useState(false); // 구독자 인증 모달
  const [uPhone, setUPhone] = useState("");
  const [uMsg, setUMsg] = useState("");
  const [uBusy, setUBusy] = useState(false);
  const [intro, setIntro] = useState(null); // 소개받기 신청 모달 — 대상 직업명

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
    // ★★ v36: 공식 주소 강제 — 중복 배포(다른 Vercel 프로젝트) 주소로 들어오면
    //    방문자든 관리자든 무조건 공식 사이트로 이동시킨다. (QR/공유 파라미터는 유지)
    try {
      const h = location.host;
      if (h !== CANONICAL_HOST && !h.startsWith("localhost") && !h.startsWith("127.0.0.1")) {
        location.replace("https://" + CANONICAL_HOST + location.pathname + location.search);
        return;
      }
    } catch (e) {}

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
    // ★ v62: 추천 링크(?ref=코드)로 들어오면 저장 → 구독 신청 시 자동 연결
    try {
      const rc = new URLSearchParams(location.search).get("ref");
      if (rc && /^\d+-[0-9a-f]{10}$/.test(rc)) localStorage.setItem("ref_code", rc);
    } catch (e) {}
    // ★ v50 마케팅 지표: 익명 방문자ID(재방문 판별) + 어드민 기기 제외 + 체류시간(초)
    let vid = null;
    try {
      vid = localStorage.getItem("visitor_id");
      if (!vid) { vid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); localStorage.setItem("visitor_id", vid); }
    } catch (e) {}
    let isAdminDevice = false;
    try { isAdminDevice = localStorage.getItem("admin_device") === "1"; } catch (e) {}
    let savedPhone0 = null;
    try { savedPhone0 = localStorage.getItem("viewer_phone") || null; } catch (e) {}
    const startedAt = Date.now();
    const durBase = (() => { try { return parseInt(sessionStorage.getItem("dur_base"), 10) || 0; } catch (e) { return 0; } })();
    const sendDur = () => {
      try {
        const id = sessionStorage.getItem("visit_id");
        if (!id) return;
        const dur = durBase + Math.round((Date.now() - startedAt) / 1000);
        if (dur < 3) return;
        sessionStorage.setItem("dur_base", String(dur));
        const payload = JSON.stringify({ upd: id, dur });
        if (navigator.sendBeacon) navigator.sendBeacon("/api/visit", new Blob([payload], { type: "application/json" }));
        else fetch("/api/visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
      } catch (e) {}
    };
    const ping = () =>
      fetch("/api/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ src, vid, phone: savedPhone0, admin: isAdminDevice }),
      }).then((r) => r.json()).then((d) => { try { if (d && d.id) sessionStorage.setItem("visit_id", String(d.id)); } catch (e) {} }).catch(() => {});
    try {
      if (!sessionStorage.getItem("visited")) {
        sessionStorage.setItem("visited", "1");
        ping();
      }
    } catch (e) { ping(); }
    // 체류시간: 화면이 보이는 동안 15초마다 + 탭을 떠날 때 갱신
    const durTimer = setInterval(() => { if (document.visibilityState === "visible") sendDur(); }, 15000);
    document.addEventListener("visibilitychange", sendDur);
    window.addEventListener("pagehide", sendDur);

    // ★ 최신 데이터 불러오기 — 새 통로(/api/data2)만 사용 (과거 캐시 오염 원천 차단)
    //   처음 1회 + 탭으로 돌아올 때 + 30초마다 자동 갱신
    const loadData = () => {
      fetch("/api/data2?t=" + Date.now(), { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          setMembers(d.members || []);
          setTotal(d.total ?? 0);
          setDiag({ db: String(d.dbHost || "").slice(0, 8), v: d.configV ?? null });
          setNotes(d.notes || []);
          if (d.config) setCfg(mergeConfig(d.config));
        })
        .catch(() => {});
    };
    loadDataRef.current = loadData;
    loadData();
    // ★ v42: 이전에 인증한 번호가 있으면 자동 재인증 (승인 상태가 바뀌면 자동 반영)
    try {
      const saved = localStorage.getItem("viewer_phone");
      if (saved) {
        fetch("/api/whoami", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: saved }), cache: "no-store" })
          .then((r) => r.json())
          .then((d) => { if (d.ok) setViewer({ chon: d.chon, name: d.name, job: d.job || "", intro: d.intro || "", icon: d.icon || "🙋", birthday: d.birthday || "", refCode: d.refCode || "", phone: saved }); else localStorage.removeItem("viewer_phone"); })
          .catch(() => {});
      }
    } catch (e) {}
    const onVisible = () => { if (document.visibilityState === "visible") loadData(); };
    const timer = setInterval(() => { if (document.visibilityState === "visible") loadData(); }, 10000); // ★ v57: 탭이 보일 때만 10초 갱신
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      clearInterval(durTimer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("visibilitychange", sendDur);
      window.removeEventListener("pagehide", sendDur);
    };
  }, []);

  const toast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 1800);
  };

  const canSubmit =
    form.name.trim() && form.phone.replace(/\D/g, "").length >= 10 && form.job.trim();

  // ★ v51: 내 소개 수정
  const openMe = () => {
    if (!viewer) return;
    setMeMsg("");
    setMe({ icon: viewer.icon || "🙋", job: viewer.job || "", intro: viewer.intro || "", birthday: viewer.birthday || "" });
  };
  async function saveMe() {
    if (!me || !viewer?.phone) return;
    if (!me.job.trim()) { setMeMsg("직업(하는 일)은 비울 수 없어요."); return; }
    setMeBusy(true); setMeMsg("");
    try {
      const r = await fetch("/api/myprofile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: viewer.phone, icon: me.icon, job: me.job, intro: me.intro, birthday: me.birthday }), cache: "no-store" });
      const d = await r.json();
      if (d.ok) {
        setViewer({ ...viewer, icon: d.icon, job: d.job, intro: d.intro, birthday: d.birthday || "" });
        setMe(null);
        toast("✏️ 내 소개가 수정됐어요!");
        loadDataRef.current && loadDataRef.current(); // 인맥 목록 즉시 갱신
      } else setMeMsg("저장에 실패했어요. 잠시 후 다시 시도해주세요.");
    } catch (e) { setMeMsg("네트워크 오류 — 다시 시도해주세요."); }
    setMeBusy(false);
  }

  async function doUnlock() {
    setUBusy(true); setUMsg("");
    try {
      const r = await fetch("/api/whoami", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: uPhone }), cache: "no-store" });
      const d = await r.json();
      if (d.ok) {
        setViewer({ chon: d.chon, name: d.name, job: d.job || "", intro: d.intro || "", icon: d.icon || "🙋", birthday: d.birthday || "", refCode: d.refCode || "", phone: uPhone });
        try { localStorage.setItem("viewer_phone", uPhone); } catch (e) {}
        // ★ v50: 이번 방문 기록에 인증 번호 연결 → 어드민 "구독자 관심도"에 집계
        try {
          const vidRow = sessionStorage.getItem("visit_id");
          if (vidRow) fetch("/api/visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upd: vidRow, phone: uPhone }) }).catch(() => {});
        } catch (e) {}
        setUnlock(false); setUPhone("");
        toast("🔓 구독자 인증 완료 — 잠긴 칸이 열렸습니다");
      } else {
        setUMsg(T.unlockFail);
      }
    } catch (e) { setUMsg("확인 실패 — 잠시 후 다시 시도해주세요"); }
    setUBusy(false);
  }

  // 잠금 게이트 공용 패널 (미구독 방문자에게 표시)
  const Gate = ({ desc }) => (
    <div className="gate">
      <div className="gate-ic">🔒</div>
      <div className="gate-tx">{desc}</div>
      <button className="mp" onClick={openSub}>{T.gateSubBtn}</button>
      <button className="ghost" onClick={() => { setUMsg(""); setUnlock(true); }}>{T.gateUnlockBtn}</button>
    </div>
  );

  async function doSub() {
    setSending(true);
    try {
      let refCode = "";
      try { refCode = localStorage.getItem("ref_code") || ""; } catch (e) {}
      const r = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, refCode }),
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
        await navigator.share({ title: T.name + " — " + T.subtitle, text: "『앗! 야생의 " + T.name + "이 나타났다!』 " + cfg.biz.length + "개 사업을 굴리는 창업가의 RPG 상태창 — 포획해보세요 🎯", url });
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
      <section className="card" key="hero" style={{ position: "relative" }}>
        <button className="sharepill" onClick={shareLink} title="이 상태창 공유하기">📤 공유</button>
        <div className="hero">
          <div className="sprite-box">
            <img src="/profile.jpg" alt={T.name} width={126} height={126} />
            <div className="lv">{T.level}</div>
          </div>
          <div style={{ minWidth: 0, paddingTop: 4 }}>
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
        {cfg.info.map((row, i) => {
          // ★ v62: 나이(출생)·연락처는 구독자에게만 공개
          const isLocked = !viewer && ["출생", "나이", "연락처", "전화"].some((w) => String(row.k).includes(w));
          return (
            <div className="inforow" key={i}>
              <span className="k">{row.k}</span>
              {isLocked ? (
                <span className="v">
                  <button className="lockv" onClick={openSub}>🔒 구독자에게만 공개</button>
                  <button className="linklike" style={{ marginLeft: 8, fontSize: 12 }} onClick={() => { setUMsg(""); setUnlock(true); }}>이미 구독자예요</button>
                </span>
              ) : (
                <span className="v"><ML t={row.v} /></span>
              )}
            </div>
          );
        })}
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
        {/* ★ v51 등급 설명 */}
        <div className="note" style={{ marginTop: 12, lineHeight: 2.2, wordBreak: "keep-all" }}>
          <span className="rank S" style={{ display: "inline-block", marginLeft: 0, marginRight: 2 }}>S</span>~<span className="rank A" style={{ display: "inline-block", margin: "0 6px 0 2px" }}>A</span>등급 : 자신있는 분야<br />
          <span className="rank B" style={{ display: "inline-block", margin: "0 6px 0 0" }}>B</span>등급 : 할 줄 아는 분야<br />
          <span className="rank C" style={{ display: "inline-block", marginLeft: 0, marginRight: 2 }}>C</span>~<span className="rank D" style={{ display: "inline-block", margin: "0 6px 0 2px" }}>D</span>등급 : 부족한 분야
        </div>
      </section>
    ),

    biz: (
      <section className="card" key="biz">
        <div className="sechead"><h2>{T.bizTitle}</h2><span className="en">BUSINESS</span></div>
        {T.bizDesc?.trim() && <div className="desc">{T.bizDesc}</div>}
        {!viewer ? (
          <>
            {/* ★ v62: 잠금 위 공개 훅 — 궁금하게 만들기 */}
            <div className="tz-hooks">
              <span className="tz-icons">{cfg.biz.map((b) => b.icon).join(" ")}</span>
              <b className="tz-big">{cfg.biz.length}개 사업 동시 운영 중</b>
              <span className="tz-sub">{cfg.biz.filter((b) => b.stage === "고도화" || b.stage === "확장").length}개 고도화 · {cfg.biz.filter((b) => b.stage === "초기" || b.stage === "성장").length}개 신규 확장</span>
            </div>
            <div className="tease">
              <div className="tease-blur" aria-hidden="true">
                {cfg.biz.slice(0, 4).map((b, i) => (
                  <div className="biz" key={i}>
                    <span className="ic">{b.icon}</span>
                    <div style={{ minWidth: 0, flex: 1 }}><div className="nm">{b.name}</div><div className="tg">{b.tag}</div></div>
                    <span className={`stage ${STAGE_CLS[b.stage] || "early"}`}>{b.stage}</span>
                  </div>
                ))}
              </div>
              <div className="tease-gate"><Gate desc={T.bizGateDesc} /></div>
            </div>
          </>
        ) : cfg.biz.map((b, i) => (
          <div className="biz" key={i} style={viewer.chon <= 3 ? { flexWrap: "wrap" } : undefined}>
            <span className="ic">{b.icon}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="nm">{b.name}</div><div className="tg">{b.tag}</div>
              {viewer.chon <= 3 && b.desc?.trim() && (
                <div className="bizdetail">{lines(b.desc).map((l, j) => <div key={j}>{l}</div>)}</div>
              )}
            </div>
            <span className={`stage ${STAGE_CLS[b.stage] || "early"}`}>{b.stage}</span>
            {viewer.chon === 4 && (
              <button className="mini-act" onClick={() => setLock({ title: T.lockBiz3Title, desc: T.lockBiz3Desc, noSub: true })}>자세히 🔒</button>
            )}
          </div>
        ))}
        {viewer ? <div className="note">🔓 구독자로 인증됨{viewer.chon >= 4 ? " — 상세 설명은 가까운 사이(3회 이상 만남)부터" : ""} · <button className="linklike" onClick={() => setRefOpen(true)}>🎁 추천하고 치킨 받기</button> · <button className="linklike" onClick={openMe}>✏️ 내 소개 수정</button> · <button className="linklike" onClick={() => { try { localStorage.removeItem("viewer_phone"); } catch (e) {} setViewer(null); }}>번호 변경</button></div> : (T.bizNote?.trim() && <div className="note">{T.bizNote}</div>)}
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

    posts: (cfg.posts || []).length > 0 && (
      <section className="card" key="posts">
        <div className="sechead"><h2>{T.postsTitle}</h2><span className="en">LOG</span></div>
        {T.postsDesc?.trim() && <div className="desc">{T.postsDesc}</div>}
        {cfg.posts.map((p, i) => (
          <details className="post" key={i}>
            <summary>
              <span className="post-t">{p.title || "제목 없음"}</span>
              {p.date?.trim() && <span className="post-d">{p.date}</span>}
            </summary>
            <div className="post-b">{lines(p.body).map((l, j) => (l === "" ? <br key={j} /> : <div key={j}>{l}</div>))}</div>
          </details>
        ))}
      </section>
    ),

    network: (
      <section className="card" key="network">
        <div className="sechead"><h2>네트워킹</h2><span className="en">NETWORK</span></div>
        {T.netDesc?.trim() && <div className="desc">{T.netDesc}</div>}
        {!viewer ? (
          <>
            {/* ★ v62: 잠금 위 공개 훅 — 어떤 사람들이 있는지 살짝 보여주기 */}
            {(() => {
              const fixed = cfg.network.flatMap((g) => g.people || []);
              const totalN = fixed.length + members.length;
              const hooks = [...fixed, ...members.map((m) => ({ icon: m.icon || "🙋", job: m.job, desc: m.intro }))]
                .filter((h) => (h.desc || "").trim()).slice(0, 3);
              return (
                <div className="tz-hooks">
                  <b className="tz-big">현재 {totalN}명과 연결되어 있어요</b>
                  {hooks.length > 0 && (
                    <div className="tz-chips">
                      {hooks.map((h, i) => <span className="hookchip" key={i}>{h.icon} {h.desc}</span>)}
                    </div>
                  )}
                  <span className="tz-sub">구독하면 분야별로 구경하고, 소개도 받을 수 있어요</span>
                </div>
              );
            })()}
            <div className="tease">
            <div className="tease-blur" aria-hidden="true">
              {/* ★ v52: 카테고리 그리드 미리보기 */}
              <div className="catgrid">
                {NET_CATS.map((c) => (
                  <div key={c.id} className="catbtn"><span className="ci">{c.icon}</span><span className="cn">{c.name}</span></div>
                ))}
              </div>
              {cfg.network.filter((g) => g.chon <= 3).flatMap((g) => g.people || []).slice(0, 2).map((pp, i) => (
                <div className="person" key={i}>
                  <span className="ic">{pp.icon}</span>
                  <div style={{ minWidth: 0 }}><div className="nm">{pp.job}</div><div className="ds">{pp.desc}</div></div>
                </div>
              ))}
            </div>
            <div className="tease-gate"><Gate desc={T.netGateDesc} /></div>
            </div>
          </>
        ) : (() => {
          // ★ v52: 카테고리 3×2 그리드 — 클릭하면 해당 분야 사람들이 뜸.
          //   사람마다 "가까운 사이"(1~3촌) / "구독자"(4촌) 배지. 내부 촌수는 노출하지 않음.
          const people = [];
          cfg.network.forEach((g) => {
            const tier = g.chon <= 3 ? "close" : "sub";
            (g.people || []).forEach((p) => people.push({ icon: p.icon, job: p.job, desc: p.desc, tier, cat: p.cat || autoCat(p.job, p.desc) }));
            membersOf(g.chon).forEach((m) => people.push({ icon: m.icon || "🙋", job: m.job, desc: m.intro || "", tier, cat: m.cat || autoCat(m.job, m.intro) }));
          });
          const closeCnt = people.filter((p) => p.tier === "close").length;
          const subCnt = people.filter((p) => p.tier === "sub").length;
          const cnt = (id) => people.filter((p) => p.cat === id).length;
          const shown = catSel ? people.filter((p) => p.cat === catSel) : [];
          return (
            <>
              <div className="tierlegend">
                <span><b className="tb close">{T.tierCloseName}</b> {closeCnt}명 · {T.tierCloseRule}</span>
                <span><b className="tb sub">{T.tierSubName}</b> {subCnt}명 · {T.tierSubRule}</span>
              </div>
              <div className="catgrid">
                {NET_CATS.map((c) => (
                  <button key={c.id} className={"catbtn" + (catSel === c.id ? " on" : "")}
                    onClick={() => setCatSel(catSel === c.id ? null : c.id)}>
                    <span className="ci">{c.icon}</span>
                    <span className="cn">{c.name}</span>
                    <span className="cc">{cnt(c.id)}명</span>
                  </button>
                ))}
              </div>
              {!catSel ? (
                <div className="empty">👆 분야를 누르면 해당하는 분들이 나타납니다</div>
              ) : shown.length === 0 ? (
                <div className="empty">{T.netEmpty}</div>
              ) : (
                shown.map((p, i) => (
                  <div className="person" key={catSel + "-" + i}>
                    <span className="ic">{p.icon}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="nm">{p.job} <span className={"tb " + (p.tier === "close" ? "close" : "sub")}>{p.tier === "close" ? T.tierCloseName : T.tierSubName}</span></div>
                      <div className="ds">{p.desc}</div>
                    </div>
                    <button className="mini-act" onClick={() => viewer.chon <= 3 ? setIntro(p.job) : setLock({ title: T.lockNet3Title, desc: T.lockNet3Desc, noSub: true })}>소개받기</button>
                  </div>
                ))
              )}
            </>
          );
        })()}
      </section>
    ),

    subscribe: (
      <section className="card" key="subscribe">
        <div className="sechead"><h2>구독</h2><span className="en" style={{ color: "var(--mp)" }}>SUBSCRIBE</span></div>
        <div className="desc">
          {T.subDesc}
          {members.length > 0 && (
            <><br />현재 <b style={{ color: "var(--mp)" }}>{members.length}명</b>이 구독중입니다.</>
          )}
        </div>
        <div style={{ textAlign: "center" }}>
          <button className="mp" onClick={openSub}>{T.subTitle}</button>
        </div>
      </section>
    ),

    catch: (
      <section className="card" key="catch">
        <div className="sechead"><h2>포획</h2><span className="en">CATCH & COFFEE</span></div>
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
          <a className="coffee" href={"sms:" + String(T.introPhone || "").replace(/\D/g, "") + "?&body=" + encodeURIComponent(T.coffeeSms || "")}>{T.coffeeBtn}</a>
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
        <div className="footer">PRESS START TO NETWORK<br />SEOUL SEONGBUK · NO GAME OVER<br /><span style={{ opacity: 0.45, fontSize: "0.85em" }}>BUILD {BUILD} · DB {diag.db || "?"} · 설정 {diag.v != null ? "#" + diag.v : "#100"}</span></div>
      </div>

      {/* 하단 구독바 */}
      <div className="bottombar">
        <div className="inner">
          {subDone ? (
            <div className="msg" style={{ textAlign: "center", width: "100%" }}>
              <b className="inline">✓ 구독 접수 완료</b> — 등록되면 네트워킹 칸에 표시됩니다
            </div>
          ) : (
            <>
              <div className="msg"><b>새 사업 · 네트워킹 소식 받기</b>구독하면 네트워킹 칸에 등록됩니다</div>
              <button className="mp" onClick={openSub}>📡 구독하기</button>
            </>
          )}
        </div>
      </div>

      {/* 구독자 인증(잠금해제) 모달 */}
      {/* ★ v62 추천 모달 */}
      {refOpen && viewer && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setRefOpen(false)}>
          <div className="modal">
            <div className="sechead" style={{ border: "none", paddingBottom: 0, marginBottom: 6 }}>
              <h2 style={{ fontSize: 17 }}>🍗 추천하고 치킨 받기</h2>
              <span className="en" style={{ color: "var(--gold)" }}>REFERRAL</span>
            </div>
            <div className="desc">
              아래 <b style={{ color: "var(--gold)" }}>내 추천 링크</b>로 친구가 구독하고 등록이 완료되면,
              감사의 의미로 <b>BHC 치킨 기프티콘</b>을 보내드립니다! 인원 제한 없이 추천할 때마다 드려요.
            </div>
            <div className="fgroup">
              <div className="flabel">내 추천 링크</div>
              <input readOnly value={"https://sunghoon-nine.vercel.app/?ref=" + (viewer.refCode || "")} onFocus={(e) => e.target.select()} />
            </div>
            <div className="btnrow" style={{ marginTop: 14 }}>
              <button className="mp" onClick={async () => {
                const url = "https://sunghoon-nine.vercel.app/?ref=" + (viewer.refCode || "");
                try {
                  if (navigator.share) { await navigator.share({ title: "전성훈 — 레벨업 중인 창업가", url }); }
                  else { await navigator.clipboard.writeText(url); toast("📋 추천 링크가 복사됐어요!"); }
                } catch (e) { try { await navigator.clipboard.writeText(url); toast("📋 추천 링크가 복사됐어요!"); } catch (e2) {} }
              }}>📤 공유하기 / 복사</button>
              <button className="ghost" onClick={() => setRefOpen(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* ★ v51 내 소개 수정 모달 */}
      {me && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setMe(null)}>
          <div className="modal">
            <div className="sechead" style={{ border: "none", paddingBottom: 0, marginBottom: 6 }}>
              <h2 style={{ fontSize: 17 }}>내 소개 수정</h2>
              <span className="en" style={{ color: "var(--gold)" }}>MY PROFILE</span>
            </div>
            <div className="desc">네트워킹 칸에 공개되는 내 모습이에요. 이름·연락처는 계속 비공개입니다.</div>
            <div className="fgroup">
              <div className="flabel">아이콘</div>
              <div className="iconpick">
                {["🙋","😎","🚀","💼","💰","🩺","⚖️","📈","🎨","🍳","🏗️","💻","📚","🧠","🔥","🌟"].map((ic) => (
                  <button key={ic} type="button" className={me.icon === ic ? "on" : ""} onClick={() => setMe({ ...me, icon: ic })}>{ic}</button>
                ))}
              </div>
            </div>
            <div className="fgroup">
              <div className="flabel">직업 (하는 일)</div>
              <input value={me.job} maxLength={10} placeholder="예: 마케터" onChange={(e) => setMe({ ...me, job: e.target.value })} />
            </div>
            <div className="fgroup">
              <div className="flabel">나를 자랑하는 한 줄</div>
              <input value={me.intro} maxLength={20} placeholder="예: 매출 100억 만들어 본 마케터" onChange={(e) => setMe({ ...me, intro: e.target.value })} />
            </div>
            <div className="fgroup">
              <div className="flabel">생일 <span style={{ opacity: 0.6 }}>(선택 · 비공개)</span></div>
              <input value={me.birthday} inputMode="numeric" maxLength={5} placeholder="예: 0514 (비우면 삭제)" onChange={(e) => setMe({ ...me, birthday: e.target.value })} />
            </div>
            <div className="person" style={{ marginTop: 10 }}>
              <span className="ic">{me.icon}</span>
              <div style={{ minWidth: 0 }}><div className="nm">{me.job || "직업"}</div><div className="ds">{me.intro || "자랑 한 줄"}</div></div>
            </div>
            {meMsg && <div style={{ color: "#ff8f8f", fontSize: 13, marginTop: 8 }}>{meMsg}</div>}
            <div className="btnrow" style={{ marginTop: 14 }}>
              <button className="mp" disabled={meBusy || !me.job.trim()} onClick={saveMe}>{meBusy ? "저장 중..." : "💾 저장"}</button>
              <button className="ghost" onClick={() => setMe(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {unlock && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setUnlock(false)}>
          <div className="modal">
            <div className="sechead" style={{ border: "none", paddingBottom: 0, marginBottom: 6 }}>
              <h2 style={{ fontSize: 17 }}>{T.unlockTitle}</h2>
              <span className="en" style={{ color: "var(--gold)" }}>UNLOCK</span>
            </div>
            <div className="desc">{T.unlockDesc}</div>
            <div className="fgroup">
              <div className="flabel">전화번호 <span style={{ opacity: 0.6 }}>(비공개 · 인증용으로만 사용)</span></div>
              <input value={uPhone} inputMode="tel" placeholder="010-0000-0000"
                onChange={(e) => setUPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !uBusy && doUnlock()} />
            </div>
            {uMsg && <div style={{ color: "#ff8f8f", fontSize: 13, marginTop: 8 }}>{uMsg}</div>}
            <div className="btnrow" style={{ marginTop: 14 }}>
              <button className="mp" disabled={uBusy || uPhone.replace(/\D/g, "").length < 10} onClick={doUnlock}>{uBusy ? "확인 중..." : "🔓 열기"}</button>
              <button className="ghost" onClick={() => setUnlock(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 소개받기 신청 모달 (3촌 이상) */}
      {intro && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setIntro(null)}>
          <div className="modal">
            <div className="sechead" style={{ border: "none", paddingBottom: 0, marginBottom: 6 }}>
              <h2 style={{ fontSize: 17 }}>{T.introReqTitle}</h2>
              <span className="en" style={{ color: "var(--gold)" }}>INTRO</span>
            </div>
            <div className="desc">{T.introReqDesc}</div>
            <div className="note" style={{ textAlign: "left", marginTop: 8 }}>요청 대상: <b style={{ color: "var(--gold)" }}>{intro}</b></div>
            <div className="btnrow" style={{ marginTop: 14 }}>
              <a className="mp" style={{ textAlign: "center", textDecoration: "none", display: "block" }}
                href={"sms:" + String(T.introPhone || "").replace(/\D/g, "") + "?&body=" + encodeURIComponent("[소개요청] " + intro + " — (목적을 적어주세요)")}
              >💬 문자로 신청하기</a>
              <button className="ghost" onClick={() => setIntro(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 구독 모달 */}
      {subOpen && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setSubOpen(false)}>
          <div className="modal">
            {subDone ? (
              <div className="centerpad">
                <div style={{ fontSize: 32 }}>📡</div>
                <div style={{ fontWeight: 800, fontSize: 17, marginTop: 10, color: "var(--mp)" }}>신청 완료!</div>
                <div style={{ fontSize: 13.5, color: "var(--dim)", marginTop: 6 }}>
                  등록이 끝나면 문자로 알려드릴게요.<br />그때부터 잠긴 칸도 번호로 열 수 있습니다.
                </div>
                <div style={{ fontSize: 13, color: "var(--gold)", marginTop: 14 }}>재밌으셨다면, 이 상태창을 주변에도 공유해주세요! 🙏</div>
                <div className="btnrow" style={{ marginTop: 10, justifyContent: "center" }}>
                  <button className="mp" onClick={shareLink}>📤 친구에게 공유</button>
                  <button className="ghost" onClick={() => setSubOpen(false)}>닫기</button>
                </div>
              </div>
            ) : (
              <>
                <div className="sechead" style={{ border: "none", paddingBottom: 0, marginBottom: 6 }}>
                  <h2 style={{ fontSize: 17 }}>구독 신청</h2>
                  <span className="en" style={{ color: "var(--mp)" }}>SUBSCRIBE</span>
                </div>
                <div className="desc">신청 후 <b style={{ color: "var(--mp)" }}>구독자로 등록</b>됩니다. 이름·연락처는 비공개 — 아이콘·직업·자랑 한 줄만 공개돼요.</div>
                <div className="fgroup">
                  <div className="flabel">프로필 아이콘 (공개)</div>
                  <div className="iconpick">
                    {["🙋","😎","🚀","💼","💰","🩺","⚖️","📈","🎨","🍳","🏗️","💻","📚","🧠","🔥","🌟"].map((ic) => (
                      <button key={ic} type="button" className={form.icon === ic ? "on" : ""} onClick={() => setForm({ ...form, icon: ic })}>{ic}</button>
                    ))}
                  </div>
                </div>
                <div className="fgroup">
                  <div className="flabel">이름 (비공개 · 연락용)</div>
                  <input value={form.name} maxLength={20} placeholder="홍길동"
                    onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="fgroup">
                  <div className="flabel">연락처 (비공개 · 소식 문자 수신용)</div>
                  <input value={form.phone} inputMode="tel" placeholder="010-0000-0000"
                    onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="fgroup">
                  <div className="flabel">직업 <span style={{ opacity: 0.6 }}>(10자 이내)</span></div>
                  <input value={form.job} maxLength={10} placeholder="예: 이커머스 마케터"
                    onChange={(e) => setForm({ ...form, job: e.target.value })} />
                </div>
                <div className="fgroup">
                  <div className="flabel">나를 자랑하는 한 줄 <span style={{ opacity: 0.6 }}>(20자 이내 · 공개)</span></div>
                  <textarea value={form.intro} maxLength={20} rows={2} placeholder="예: 매출 100억 만들어 본 마케터"
                    style={{ resize: "vertical" }}
                    onChange={(e) => setForm({ ...form, intro: e.target.value })} />
                </div>
                <div className="fgroup">
                  <div className="flabel">생일 <span style={{ opacity: 0.6 }}>(선택 · 비공개 — 축하 인사만 드려요)</span></div>
                  <input value={form.birthday} inputMode="numeric" maxLength={5} placeholder="예: 0514"
                    onChange={(e) => setForm({ ...form, birthday: e.target.value })} />
                </div>
                <div className="fgroup">
                  <div className="flabel">추천인 <span style={{ opacity: 0.6 }}>(선택 · 비공개 — 추천해주신 분께 감사 선물을 드려요 🍗)</span></div>
                  <input value={form.refName} maxLength={20} placeholder="나를 추천해준 분 이름"
                    onChange={(e) => setForm({ ...form, refName: e.target.value })} />
                  {(() => { try { return localStorage.getItem("ref_code") ? <div className="note" style={{ marginTop: 4 }}>🎁 추천 링크로 접속하셨네요 — 추천인이 자동으로 연결됩니다!</div> : null; } catch (e) { return null; } })()}
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
              {!lock.noSub && <button className="mp" onClick={() => { setLock(null); openSub(); }}>{T.lockBtn}</button>}
              <button className="ghost" onClick={() => setLock(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="toast">{toastMsg}</div>}
    </>
  );
}
