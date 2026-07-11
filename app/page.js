"use client";
import { useEffect, useMemo, useState } from "react";

const STATS = [
  ["사업아이디어", 10], ["실행력", 9], ["마케팅", 8], ["제조", 6],
  ["개발", 4], ["인사", 4], ["영업", 2],
];
const RANK = (v) => (v >= 9 ? "S" : v >= 7 ? "A" : v >= 5 ? "B" : v >= 3 ? "C" : "D");

const BIZ = [
  ["💪", "헬스케어 브랜드", "이커머스 · 3개 · 2024년~", "고도화"],
  ["💄", "뷰티 브랜드", "이커머스 · 1개 · 2025년~", "고도화"],
  ["📞", "분양 DB 납품 실행사", "마케팅 · 1개 · 26.05~", "초기"],
  ["🏠", "부동산 매물 홍보 플랫폼", "플랫폼 · 1개 · 26.06~", "초기"],
  ["📚", "교육 플랫폼", "이커머스 · 1개 · 26.06~", "초기"],
  ["🔮", "AI 사주 플랫폼", "플랫폼 · 1개 · 26.07~", "초기"],
];

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

const TMI = [
  "은둔형인데 어쩌다 미팅을 받게 됐는지",
  "성북동 은둔자의 단골 밥집",
  "휴학은 대체 몇 번째인지",
  "INTP가 영업 2점으로 살아남는 법",
  "요즘 새벽마다 꽂혀있는 것",
  "사주 플랫폼 대표가 본 자기 사주",
];

const DLG = "어? 야생의 전성훈이 나타났다!";

export default function Home() {
  const [dlg, setDlg] = useState("");
  const [members, setMembers] = useState([]);
  const [total, setTotal] = useState(null);
  const [open4, setOpen4] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [subDone, setSubDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", job: "", intro: "" });
  const [toastMsg, setToastMsg] = useState("");

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

  // 대화창 타자기
  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      i++;
      setDlg(DLG.slice(0, i));
      if (i >= DLG.length) clearInterval(t);
    }, 55);
    return () => clearInterval(t);
  }, []);

  // 방문 집계 (세션당 1회) + 승인된 구독자 로드
  useEffect(() => {
    try {
      if (!sessionStorage.getItem("visited")) {
        sessionStorage.setItem("visited", "1");
        fetch("/api/visit", { method: "POST" }).catch(() => {});
      }
    } catch (e) {
      fetch("/api/visit", { method: "POST" }).catch(() => {});
    }
    fetch("/api/public")
      .then((r) => r.json())
      .then((d) => { setMembers(d.members || []); setTotal(d.total ?? 0); })
      .catch(() => {});
  }, []);

  const toast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 1800);
  };

  const canSubmit =
    form.name.trim() &&
    form.phone.replace(/\D/g, "").length >= 10 &&
    form.job.trim();

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
    const url = location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: "전성훈 — 은둔형 연쇄창업가", text: "야생의 전성훈을 만나보세요", url });
      } catch (e) {}
    } else {
      try { await navigator.clipboard.writeText(url); toast("링크가 복사됐습니다!"); }
      catch (e) { prompt("링크를 복사하세요:", url); }
    }
  }

  const membersOf = (chon) => members.filter((m) => (parseInt(m.chon) || 4) === chon);

  return (
    <>
      <div className="stars">
        {stars.map((s, i) => (
          <i key={i} className={s.gold ? "g" : ""} style={{ left: s.left, top: s.top, animationDelay: s.delay }} />
        ))}
      </div>

      <div className="wrap">
        <div className="eyebrow">— PLAYER STATUS —</div>

        <div className="dialog">
          <span>{dlg}</span>
          <span className="arrow">▼</span>
        </div>

        {/* 캐릭터 */}
        <section className="card">
          <div className="hero">
            <div className="sprite-box">
              <img src="/profile.jpg" alt="전성훈" width={126} height={126} />
              <div className="lv">LV.25</div>
            </div>
            <div style={{ minWidth: 0, paddingTop: 4 }}>
              <div className="title-chip">«성북동의 은둔자»</div>
              <div className="name">전성훈</div>
              <div className="sub">은둔형 연쇄창업가</div>
              <div className="tagline">혼자 사업 8개 굴리는 중</div>
            </div>
          </div>
          <div className="barwrap">
            <div className="barhead"><span className="lb" style={{ color: "#FF5B5B" }}>HP</span><span className="val">13 / 100</span></div>
            <div className="bar"><div className="hp-crit" style={{ width: "13%", background: "#FF5B5B" }} /></div>
            <div className="cap">툭 치면 과로사 직전</div>
          </div>
          <div className="barwrap">
            <div className="barhead"><span className="lb" style={{ color: "var(--mp)" }}>MP</span><span className="val">100 / 100</span></div>
            <div className="bar"><div style={{ width: "100%", background: "var(--mp)" }} /></div>
            <div className="cap">아이디어 — 무한 리젠</div>
          </div>
        </section>

        {/* 기본 정보 */}
        <section className="card">
          <div className="sechead"><h2>기본 정보</h2><span className="en">INFO</span></div>
          <div className="inforow"><span className="k">출생</span><span className="v">2002년생 (25)</span></div>
          <div className="inforow"><span className="k">MBTI</span><span className="v">INTP</span></div>
          <div className="inforow"><span className="k">학력</span><span className="v">국민대학교 휴학중</span></div>
          <div className="inforow"><span className="k">취미</span><span className="v">맛집탐방 · 서울근교 드라이브 · 인테리어 · 일본여행 · 외국어공부</span></div>
          <div className="inforow"><span className="k">거점</span><span className="v">서울 성북동</span></div>
          <div className="inforow">
            <span className="k">연락처</span>
            <span className="v">
              <a href="sms:01039534997">010-3953-4997</a>
              <br />
              <span style={{ fontSize: 12.5, color: "var(--dim)", fontWeight: 400 }}>유선전화는 따로 안 받고 있습니다</span>
            </span>
          </div>
        </section>

        {/* 스텟 */}
        <section className="card">
          <div className="sechead"><h2>스텟</h2><span className="en">STAT</span></div>
          {STATS.map(([nm, v]) => (
            <div className="stat" key={nm}>
              <span className="nm">{nm}</span>
              <span className="seg">
                {Array.from({ length: 10 }, (_, i) => <i key={i} className={i < v ? "on" : ""} />)}
              </span>
              <span className="pt">{v}</span>
              <span className={`rank ${RANK(v)}`}>{RANK(v)}</span>
            </div>
          ))}
        </section>

        {/* 사업 */}
        <section className="card">
          <div className="sechead"><h2>운영중인 사업 8개</h2><span className="en">BUSINESS ×8</span></div>
          <div className="desc">솔직히 관리 잘 안 되는 것도 많습니다. 매출·구조 등 상세 정보는 잘 공개 안 하는 성격입니다.</div>
          {BIZ.map(([ic, nm, tg, stage]) => (
            <div className="biz" key={nm}>
              <span className="ic">{ic}</span>
              <div><div className="nm">{nm}</div><div className="tg">{tg}</div></div>
              <span className={`stage ${stage === "고도화" ? "adv" : "early"}`}>{stage}</span>
              <span className="lock">🔒</span>
            </div>
          ))}
          <div className="note">🔒 지금 보고 계신 화면은 4촌(공개) 기준입니다</div>
        </section>

        {/* 인맥 */}
        <section className="card">
          <div className="sechead"><h2>인맥</h2><span className="en">NETWORK</span></div>
          <div className="desc">촌수는 <b style={{ color: "var(--text)" }}>사적으로 만난 횟수</b> 기준의 분류일 뿐, 실제 친분의 깊이와는 무관합니다. 이름은 전원 비공개입니다.</div>
          {NET.map(([chon, rule, people]) => {
            const dyn = membersOf(chon);
            const all = [...people, ...dyn.map((m) => ["🙋", m.job, m.intro || ""])];
            if (chon === 4) {
              return (
                <div className="chon" key={chon}>
                  <div className="chonhead"><span className={`n t${chon}`}>4촌</span><span className="r">{rule}</span></div>
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

        {/* TMI */}
        <section className="card">
          <div className="sechead"><h2>TMI</h2><span className="en">LOCKED</span></div>
          {TMI.map((t, i) => (
            <div className="codex" key={i}>
              <span className="no">#{String(i + 1).padStart(2, "0")}</span>
              <span className="t">{t}</span>
              <span className="st">🔒</span>
            </div>
          ))}
        </section>

        {/* 구독 */}
        <section className="card">
          <div className="sechead"><h2>구독</h2><span className="en" style={{ color: "var(--mp)" }}>SUBSCRIBE</span></div>
          <div className="desc">
            새 사업 소식과 인맥 업데이트를 문자로 보내드립니다. 신청 후 <b style={{ color: "var(--mp)" }}>승인되면 4촌</b>에 등록됩니다.
            {total !== null && total > 0 && (
              <><br />현재 <b style={{ color: "var(--mp)" }}>{total}명</b>이 구독중입니다.</>
            )}
          </div>
          <div style={{ textAlign: "center" }}>
            <button className="mp" onClick={() => { setSubOpen(true); setSubDone(false); }}>📡 구독하고 4촌 되기</button>
          </div>
        </section>

        {/* CTA */}
        <section className="card">
          <div className="sechead"><h2>미팅</h2><span className="en">MEETING</span></div>
          <div className="cta">
            <div style={{ fontSize: 30 }}>🌿</div>
            <div className="big">야생에서 뛰어다니고 있는<br /><span style={{ color: "var(--gold)" }}>전성훈</span>을 만나셨나요?</div>
            <div className="loc" style={{ marginTop: 6 }}>인맥 소개 / 비즈니스 협업 언제든 환영합니다</div>
            <div className="loc" style={{ marginTop: 14 }}>
              혼자 이것저것 다 하다 보니 바쁜 편이라<br />
              <b style={{ color: "var(--text)" }}>내방 미팅</b>을 먼저 제안해주시면 감사하겠습니다<br />
              📍 사무실 — 혜화역 도보 5분
            </div>
            <div className="battle">
              <button onClick={shareLink}><b>▶</b>공유하기</button>
              <button onClick={() => { setSubOpen(true); setSubDone(false); }}><b>▶</b>구독하기</button>
            </div>
          </div>
        </section>

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
              <button className="mp" onClick={() => { setSubOpen(true); setSubDone(false); }}>📡 구독하기</button>
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
