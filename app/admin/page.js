"use client";
import { useState, useRef, useEffect } from "react";
import { SECTION_LABELS, mergeConfig, BUILD, CANONICAL_HOST, NET_CATS, autoCat } from "@/lib/config";

// 오류 시 진단 페이지로 바로 가는 링크 — 캡처해서 보내면 원인 파악 가능
function DiagLink() {
  return (
    <>
      {" · "}
      <a href="/api/health" target="_blank" rel="noreferrer" style={{ color: "var(--mp)", fontWeight: 800, textDecoration: "underline" }}>
        🔍 진단 페이지 열기
      </a>
      {" — 열린 화면을 캡처해서 보내주세요"}
    </>
  );
}


// UTC 시각 문자열 → 한국시간(KST) 표시
function fmtKST(iso, short) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const t = k.toISOString();
  return (short ? t.slice(5, 16) : t.slice(0, 16)).replace("T", " ");
}

export default function Admin() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [err, setErr] = useState(false);
  const [data, setData] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [subMsg, setSubMsg] = useState(""); // 구독자 저장 결과 메시지
  const [edits, setEdits] = useState({});
  const [noteVer, setNoteVer] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [bcText, setBcText] = useState("");
  const [bcMsg, setBcMsg] = useState("");
  const [cfg, setCfg] = useState(null);
  const [cfgDirty, setCfgDirty] = useState(false);
  const [cfgSavedAt, setCfgSavedAt] = useState(null);
  const lastSavedVRef = useRef(null);
  const [cfgMsg, setCfgMsg] = useState("");
  const [live, setLive] = useState(null);   // 사이트가 지금 실제로 보여주는 값 (10초마다 자동 확인)
  const [liveAt, setLiveAt] = useState(null);
  const frameRef = useRef(null);
  const genRef = useRef(0); // 편집 세대 카운터 — 저장 중 타이핑해도 안전하게
  const cfgRef = useRef(null); // 항상 최신 편집 상태를 담는 참조 (한글 입력 버그 방지용)
  const baseAtRef = useRef(null); // 이 탭이 불러온 설정의 버전 번호(#) — 충돌 감지 기준
  const dirtyRef = useRef(false); // cfgDirty의 실시간 참조
  const [hostOk, setHostOk] = useState(null); // ★ 공식 주소인지 검사 (중복 배포 어드민 차단)
  useEffect(() => {
    const h = location.host;
    setHostOk(h === CANONICAL_HOST || h.startsWith("localhost") || h.startsWith("127.0.0.1"));
  }, []);
  const [conflict, _setConflict] = useState(false); // 다른 탭이 먼저 저장한 충돌 상태
  const conflictRef = useRef(false);
  const setConflict = (v) => { conflictRef.current = v; _setConflict(v); };
  const setDirty = (v) => { dirtyRef.current = v; setCfgDirty(v); };

  // ★ 킬스위치: 과거 사이트가 브라우저에 남긴 서비스워커·캐시를 전부 제거
  useEffect(() => {
    try {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
      }
      if (typeof caches !== "undefined" && caches.keys) {
        caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
      }
    } catch (e) {}
  }, []);

  // 저장 안 된 수정사항이 있으면 창을 닫거나 새로고침할 때 경고
  useEffect(() => {
    const h = (e) => {
      if (cfgDirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [cfgDirty]);

  // ★ 사이트가 지금 실제로 보여주는 값을 10초마다 자동 확인 — 새 통로(/api/data2) 사용
  //   어느 디비에 연결됐는지(dbHost), 디비 마지막 저장 시각까지 함께 확인
  const pollLive = () =>
    fetch("/api/data2?t=" + Date.now(), { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.config) {
          setLive({ cfg: mergeConfig(d.config), dbHost: d.dbHost || "?", build: d.build || "?", updatedAt: d.configUpdatedAt || null, cfgV: d.configV ?? null, cfgVia: d.configVia || null, cfgErr: d.configReadError || null });
          // ★ 증발 감지: 방금 #N으로 저장했는데 조회가 그보다 낮거나 없으면 즉시 경보
          if (lastSavedVRef.current && (d.configV == null || Number(d.configV) < lastSavedVRef.current)) {
            setCfgMsg("🚨 방금 저장한 #" + lastSavedVRef.current + "이 조회에서 사라졌습니다" + (d.configReadError ? " · 조회 오류: " + d.configReadError : "") + " — 이 화면과 /api/health 캡처를 함께 전달해주세요.");
          }
          setLiveAt(new Date());
        }
      })
      .catch(() => {});
  useEffect(() => {
    if (!authed) return;
    pollLive();
    const t = setInterval(() => { if (document.visibilityState === "visible") pollLive(); }, 10000); // ★ v57: 탭이 보일 때만
    const t2 = setInterval(() => { if (document.visibilityState === "visible") load(); }, 15000); // ★ v57: 탭이 보일 때만
    // ★ 낡은 탭 방지: 탭으로 돌아왔을 때 수정 중이 아니면 자동으로 최신값을 다시 불러옴
    const onVis = () => {
      if (document.visibilityState === "visible") {
        pollLive();
        if (!dirtyRef.current) load();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      clearInterval(t);
      clearInterval(t2);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [authed]);

  // ★ v54: 만남 기록 & 후속 문자
  const [mtSub, setMtSub] = useState("");     // 만남 기록할 구독자 id
  const [mtNote, setMtNote] = useState("");   // 특이사항
  const [mtMsg, setMtMsg] = useState("");
  const [fuIds, setFuIds] = useState([]);     // 후속 문자 대상 id 목록
  const [fuText, setFuText] = useState("");   // 후속 문자 내용
  const [fuTpl, setFuTpl] = useState("");     // 선택된 템플릿 이름
  const [fuMsg, setFuMsg] = useState("");
  const [fuBusy, setFuBusy] = useState(false);
  async function meetAdd() {
    const id = parseInt(mtSub, 10);
    if (!id) return;
    setMtMsg("기록중...");
    try {
      const r = await post({ action: "meet_add", sub_id: id, note: mtNote.trim() });
      if (r.ok) {
        const nm = (data?.subscribers || []).find((x) => x.id === id)?.name || "";
        setMtMsg("ok:" + nm + "님 " + r.nth + "번째 만남 기록됨 — 아래 후속 문자 대상에 자동 추가");
        setMtNote("");
        setFuIds((p) => (p.includes(id) ? p : [...p, id]));
        load(key);
      } else setMtMsg("err:" + (r.detail || "기록 실패 — 만남 테이블 SQL 실행 여부를 확인해주세요"));
    } catch (e) { setMtMsg("err:네트워크 오류"); }
  }
  async function meetNote(id, note) {
    try { await post({ action: "meet_note", id, note }); load(key); } catch (e) {}
  }
  async function meetDel(id) {
    if (!confirm("이 만남 기록을 삭제할까요? (횟수 카운트도 줄어듭니다)")) return;
    try { await post({ action: "meet_del", id }); load(key); } catch (e) {}
  }
  async function sendFollowup() {
    if (!fuText.trim() || fuIds.length === 0) return;
    const names = fuIds.map((id) => (data?.subscribers || []).find((x) => x.id === id)?.name || "?").join(", ");
    if (!confirm(`${fuIds.length}명(${names})에게 후속 문자를 보냅니다.\n[이름]·[횟수]는 각자에 맞게 바뀌고, 사이트·구독취소 링크가 자동으로 붙습니다. 진행할까요?`)) return;
    setFuBusy(true); setFuMsg("발송중...");
    try {
      const r = await post({ action: "broadcast", text: fuText.trim(), ids: fuIds });
      if (r.ok) { setFuMsg(`✓ ${r.count}명에게 발송 완료`); setFuIds([]); }
      else if (r.error === "no_sms") setFuMsg("❌ Solapi 환경변수가 설정되지 않았습니다.");
      else setFuMsg("❌ 발송 실패 — " + (r.detail || "") + (r.raw ? " · " + r.raw : ""));
    } catch (e) { setFuMsg("❌ 네트워크 오류"); }
    setFuBusy(false);
  }

  // ★ v50: 평균 체류시간 계산 상한(초) — 한 명이 오래 켜놔도 평균이 안 튀게. 조절 가능.
  const [mktCap, setMktCap] = useState(180);
  const mktCapRef = useRef(180);

  async function load(k = key, clearEdits = false) {
    try {
      const r = await fetch("/api/admin?key=" + encodeURIComponent(k) + "&cap=" + (mktCapRef.current || 180));
      if (!r.ok) return false;
      const d = await r.json();
      if (d.error) return false;
      setData(d);
      // ★ v50: 이 기기를 '어드민 기기'로 표시 → 내 방문은 통계에서 자동 제외
      try { localStorage.setItem("admin_device", "1"); } catch (e) {}
      if (clearEdits) setEdits({}); // ★ v39: 자동 폴링은 편집 중인 선택(촌수/승인)을 절대 지우지 않음
      if (d.config && !dirtyRef.current) {
        cfgRef.current = mergeConfig(d.config);
        setCfg(cfgRef.current);
        baseAtRef.current = d.configV ?? null; // 이 버전 번호(#숫자) 기준으로 편집 시작
      }
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
    setSubMsg("");
    try {
      const e = edits[s.id] || {};
      const chon = e.chon ?? s.chon;
      const approved = e.approved ?? (s.approved ? "Y" : "N");
      const res = await post({
        id: s.id,
        chon: parseInt(chon, 10),
        approved: approved === "Y" || approved === true,
        name: e.name ?? s.name ?? "",
        job: e.job ?? s.job ?? "",
        intro: e.intro ?? s.intro ?? "",
        icon: e.icon ?? s.icon ?? "🙋",
        birthday: e.birthday ?? s.birthday ?? "",
        cat: e.cat ?? s.cat ?? "",
      });
      if (!res?.ok) { setSubMsg("err:저장 실패 — 서버가 저장을 거부했습니다."); return; }
      // ★ v39: 디비에 실제로 기록된 값을 돌려받아 대조 — 화면과 디비가 다르면 즉시 들통
      const sentChon = parseInt(chon, 10) || 4;
      const sentApproved = approved === "Y" || approved === true;
      if (res.row && (res.row.chon !== sentChon || res.row.approved !== sentApproved)) {
        setSubMsg("err:⚠️ 디비에 다른 값이 저장됨 (" + res.row.chon + "촌/" + (res.row.approved ? "승인" : "대기") + ") — 다시 저장해주세요.");
        return;
      }
      setSavedId(s.id);
      setTimeout(() => setSavedId(null), 1500);
      setSubMsg("ok:" + s.name + "님 저장·검증 완료 — 디비 기록: " + (res.row ? res.row.chon + "촌 · " + (res.row.approved ? "승인" : "대기") : "확인됨") + (res.smsSent ? " · 환영 문자 발송됨" : "") + " · 사이트에 10초 내 반영");
      setEdits((p) => { const n = { ...p }; delete n[s.id]; return n; });
      load();
    } catch (e) {
      setSubMsg("err:네트워크 오류 — 인터넷 연결을 확인하고 다시 시도해주세요.");
    }
  }

  async function addNote() {
    if (!noteVer.trim() || !noteContent.trim()) return;
    try {
      const r = await post({ action: "addnote", version: noteVer.trim(), content: noteContent.trim() });
      if (r.error === "db") { alert("저장 실패 — Supabase에 patchnotes 테이블이 없을 수 있습니다. SQL을 먼저 실행해주세요."); return; }
      if (!r.ok) { alert("저장 실패 — 잠시 후 다시 시도해주세요."); return; }
      setNoteVer(""); setNoteContent("");
      load();
    } catch (e) {
      alert("네트워크 오류 — 인터넷 연결을 확인하고 다시 시도해주세요.");
    }
  }

  async function delNote(id) {
    if (!confirm("이 패치노트를 삭제할까요?")) return;
    try { await post({ action: "delnote", id }); } catch (e) { alert("네트워크 오류 — 다시 시도해주세요."); }
    load();
  }

  const [subQ, setSubQ] = useState("");          // 구독자 검색어
  const [subFilter, setSubFilter] = useState("all"); // all | 1~4 | pending
  const [bcChons, setBcChons] = useState([1, 2, 3, 4]); // 단체문자 대상 촌
  const [bcAt, setBcAt] = useState(""); // ★ v48 예약 발송 시각 ("" = 즉시 발송)
  const [bcExclude, setBcExclude] = useState([]); // ★ v57: 단체문자에서 뺄 사람 id
  const [bcExtra, setBcExtra] = useState([]);     // ★ v57: 단체문자에 추가할 사람 id (촌수 밖·대기 포함)
  const [testTo, setTestTo] = useState("");
  const [testMsg, setTestMsg] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  async function testSms() {
    setTestBusy(true); setTestMsg("발송 요청중...");
    try {
      const r = await post({ action: "testsms", to: testTo });
      if (r.error === "no_sms") setTestMsg("🔴 솔라피 열쇠가 아직 없습니다 — Vercel 환경변수 3개 추가 + 재배포 필요");
      else if (r.ok) setTestMsg("✓ 발송 요청 성공 (" + (r.detail || "") + ") — 몇 초 안에 문자가 와야 정상. 안 오면 솔라피 잔액/발신번호 등록을 확인하세요.");
      else setTestMsg("❌ 발송 실패 — " + (r.detail || "") + (r.raw ? " · 응답: " + r.raw : ""));
    } catch (e) { setTestMsg("❌ 네트워크 오류"); }
    setTestBusy(false);
  }

  async function delSub(s) {
    if (!confirm(s.name + "님을 삭제할까요?\n사이트 인맥 목록에서도 즉시 사라지며 되돌릴 수 없습니다.")) return;
    const r = await post({ action: "delsub", id: s.id });
    if (r.ok) { setSubMsg("ok:" + s.name + "님 삭제됨"); load(key, true); }
    else setSubMsg("err:삭제 실패 — 잠시 후 다시 시도해주세요");
  }

  // ★ v57: 촌수 기준 + 개별 제외/추가 반영한 최종 대상
  const bcBase = (data?.subscribers || []).filter((s) => s.approved && bcChons.includes(parseInt(s.chon, 10) || 4));
  const bcTargets = [
    ...bcBase.filter((s) => !bcExclude.includes(s.id)),
    ...(data?.subscribers || []).filter((s) => bcExtra.includes(s.id) && !bcBase.some((b2) => b2.id === s.id)),
  ];
  const bcManual = bcExclude.length > 0 || bcExtra.length > 0;

  // ★ v58: "실제 도착 문자" 미리보기 조립 — 서버가 붙이는 링크까지 그대로 재현
  const SITE_URL = "https://sunghoon-nine.vercel.app";
  const fullSms = (body, sub) => {
    let msg = String(body || "")
      .replace(/\[이름\]/g, sub?.name || "구독자")
      .replace(/\[횟수\]/g, (data?.meetCounts?.[sub?.id] || 0) ? data.meetCounts[sub.id] + "번째" : "이번");
    if (!msg.includes("sunghoon-nine.vercel.app")) msg += "\n\n사이트방문:\n" + SITE_URL;
    const dg = String(sub?.phone || "").replace(/\D/g, "") || "010········";
    msg += "\n\n구독 취소:\n" + SITE_URL + "/bye?p=" + dg + "&t=" + (sub ? "a1b2c3d4e5f6" : "(자동코드)");
    return "[Web발신]\n" + msg;
  };
  const labelWarn = (body) => /사이트\s*방문\s*:|구독\s*취소\s*:/.test(String(body || ""));

  // ★ v48: 예약 시각 표시용 (예: "7/14(화) 오전 9:00")
  const fmtAt = (v) => {
    if (!v) return "";
    const d = new Date(v + ":00+09:00");
    if (isNaN(d)) return v;
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    const p = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", weekday: "short", hour12: true }).format(d);
    return p;
  };

  async function broadcast() {
    if (!bcText.trim()) return;
    // ★ v48: 예약이면 현재+1분 이후인지 브라우저에서 먼저 검사
    if (bcAt) {
      const when = new Date(bcAt + ":00+09:00").getTime();
      if (!when || when < Date.now() + 60 * 1000) { setBcMsg("❌ 예약 시각은 지금부터 1분 이후여야 합니다."); return; }
    }
    const head = bcAt
      ? `⏰ ${fmtAt(bcAt)}에 ${bcChons.sort().join("·")}촌 구독자 ${bcTargets.length}명에게 예약 발송합니다.`
      : `${bcChons.sort().join("·")}촌 구독자 ${bcTargets.length}명에게 지금 바로 발송합니다.`;
    if (!confirm(`${head}\n[이름]은 각자의 이름으로 바뀌고, 사이트 링크·구독취소 링크가 자동으로 붙습니다. 진행할까요?`)) return;
    setBcMsg(bcAt ? "예약 등록중..." : "발송중...");
    let r;
    try {
      r = bcManual
        ? await post({ action: "broadcast", text: bcText.trim(), ids: bcTargets.map((t) => t.id), src: "broadcast", at: bcAt || undefined })
        : await post({ action: "broadcast", text: bcText.trim(), chons: bcChons, at: bcAt || undefined });
    }
    catch (e) { setBcMsg("❌ 네트워크 오류 — 인터넷 연결을 확인해주세요."); return; }
    if (r.error === "no_sms") setBcMsg("❌ Solapi 환경변수(SOLAPI_API_KEY 등)가 아직 설정되지 않았습니다.");
    else if (r.error === "no_target") setBcMsg("❌ 승인된 구독자가 없습니다.");
    else if (r.error === "bad_time") setBcMsg("❌ 예약 시각이 올바르지 않습니다 — 지금부터 1분 이후로 지정해주세요.");
    else if (r.ok && r.scheduled) { setBcMsg(`⏰ ${r.count}명 예약 완료 — ${fmtAt(r.scheduled)}에 발송됩니다. (취소: solapi.com → 문자 → 예약 목록)`); setBcText(""); setBcAt(""); setBcExclude([]); setBcExtra([]); }
    else if (r.ok) { setBcMsg(`✓ ${r.count}명에게 발송 완료`); setBcText(""); setBcExclude([]); setBcExtra([]); }
    else setBcMsg("❌ 발송 실패 — " + (r.detail || "잠시 후 다시 시도해주세요.") + (r.raw ? " · 응답: " + r.raw : ""));
  }

  /* ── 사이트 편집기 헬퍼 ── */
  const updateCfg = (next) => {
    genRef.current++;
    cfgRef.current = next;
    setCfg(next);
    setDirty(true);
    scheduleAutoSave(); // ★ 실시간 연동: 수정하면 1.5초 뒤 자동 저장
  };

  // ★ 자동 저장 (실시간 연동) — 타이핑을 멈추고 1.5초가 지나면 저장 버튼 없이 자동 저장
  const autoTimerRef = useRef(null);
  const savingRef = useRef(false);
  const scheduleAutoSave = () => {
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    autoTimerRef.current = setTimeout(async () => {
      if (savingRef.current || conflictRef.current) { scheduleAutoSave(); return; } // 저장 중/충돌 중이면 잠시 후 재시도
      savingRef.current = true;
      try { await saveConfig(undefined, true); } finally { savingRef.current = false; }
    }, 1500);
  };
  const setText = (k, v) => updateCfg({ ...cfg, texts: { ...cfg.texts, [k]: v } });
  const setGauge = (g, field, v) => updateCfg({ ...cfg, [g]: { ...cfg[g], [field]: v } });
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
  const postOps = cfg ? listOps("posts") : null;

  /* ── 인맥(1~4촌) 편집 헬퍼 ── */
  const setNetRule = (gi, v) => {
    const network = cfg.network.map((g, i) => (i === gi ? { ...g, rule: v } : g));
    updateCfg({ ...cfg, network });
  };
  const netPeople = (gi) => ({
    set: (pi, field, v) => {
      const network = cfg.network.map((g, i) =>
        i === gi ? { ...g, people: g.people.map((p, j) => (j === pi ? { ...p, [field]: v } : p)) } : g
      );
      updateCfg({ ...cfg, network });
    },
    move: (pi, dir) => {
      const people = [...cfg.network[gi].people];
      const j = pi + dir;
      if (j < 0 || j >= people.length) return;
      [people[pi], people[j]] = [people[j], people[pi]];
      const network = cfg.network.map((g, i) => (i === gi ? { ...g, people } : g));
      updateCfg({ ...cfg, network });
    },
    del: (pi) => {
      const network = cfg.network.map((g, i) =>
        i === gi ? { ...g, people: g.people.filter((_, j) => j !== pi) } : g
      );
      updateCfg({ ...cfg, network });
    },
    add: () => {
      const network = cfg.network.map((g, i) =>
        i === gi ? { ...g, people: [...g.people, { icon: "🙋", job: "직함", desc: "한 줄 소개" }] } : g
      );
      updateCfg({ ...cfg, network });
    },
  });

  // 키 순서 무시하고 내용만 비교 (디비는 JSON 키 순서를 재정렬해서 저장함)
  function canon(v) {
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === "object") {
      const r = {};
      Object.keys(v).sort().forEach((k) => { r[k] = canon(v[k]); });
      return r;
    }
    return v;
  }

  // 저장 전 숫자값 정리 (빈칸·이상한 값 → 안전한 범위로)
  function sanitizeCfg(c) {
    const clamp = (x, lo, hi, fb) => {
      const n = parseInt(x, 10);
      return isNaN(n) ? fb : Math.max(lo, Math.min(hi, n));
    };
    return {
      ...c,
      hp: { ...c.hp, v: clamp(c.hp.v, 0, 100, 50) },
      mp: { ...c.mp, v: clamp(c.mp.v, 0, 100, 50) },
      stats: (c.stats || []).map((s) => ({ ...s, v: clamp(s.v, 1, 10, 5) })),
    };
  }

  async function saveConfig(forceArg, auto) {
    const force = forceArg === true; // 버튼 이벤트 객체가 들어와도 안전하게
    setConflict(false);
    setCfgMsg(auto ? "자동 저장중..." : "저장중...");
    // ★ 한글 입력 버그 수정: 조합 중 저장 시 마지막 글자가 빠지는 문제
    //   수동 저장: 포커스를 해제해 글자를 강제 확정
    //   자동 저장: 타이핑을 방해하지 않도록 포커스는 유지 (어차피 다음 자동 저장이 따라잡음)
    if (!auto && typeof document !== "undefined" && document.activeElement?.blur) document.activeElement.blur();
    await new Promise((r) => setTimeout(r, 120));
    const gen = genRef.current;             // 저장 시작 시점의 편집 세대
    const sentCfg = sanitizeCfg(cfgRef.current || cfg); // 숫자 정리된 최신 스냅샷을 보냄
    let r = null;
    // 네트워크 오류 시 1회 자동 재시도
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        r = await post({ action: "saveconfig", data: sentCfg, baseV: baseAtRef.current, force });
        break;
      } catch (e) {
        if (attempt === 2) {
          setCfgMsg("❌ 네트워크 오류 — 인터넷 연결을 확인하고 다시 저장을 눌러주세요. 수정한 내용은 이 화면에 그대로 남아있습니다.");
          return;
        }
        await new Promise((res) => setTimeout(res, 800));
      }
    }
    // ★ 충돌: 다른 탭/기기에서 먼저 저장함 — 아래 버튼으로 선택
    if (r?.error === "conflict") {
      setConflict(true);
      setCfgMsg("⚠️ 다른 탭(또는 다른 기기)에서 먼저 저장된 값이 있습니다. 아래에서 선택해주세요.");
      return;
    }
    if (r?.error === "db") { setCfgMsg("❌ 저장 실패 — " + (r.detail || "디비 오류") + " · 잠시 후 다시 저장을 눌러주세요."); return; }
    if (!r?.ok || !r?.saved) { setCfgMsg("❌ 저장 실패 — 잠시 후 다시 저장을 눌러주세요. 수정한 내용은 남아있습니다."); return; }

    baseAtRef.current = r.v ?? null; // 이제 이 버전 번호가 새 기준
    lastSavedVRef.current = r.v ?? null;
    const back = mergeConfig(r.saved);
    const verified = JSON.stringify(canon(back)) === JSON.stringify(canon(mergeConfig(sentCfg)));
    setCfgSavedAt(r.at || null);
    if (!auto && frameRef.current) frameRef.current.src = "/?preview=" + Date.now();

    // 저장하는 동안 추가로 수정한 게 있으면 화면의 수정본을 보호 (덮어쓰지 않음) — 자동 저장이 곧 이어받음
    if (genRef.current !== gen) {
      setCfgMsg("✓ 저장됨 — 이어서 수정한 내용은 잠시 후 자동 저장됩니다.");
      scheduleAutoSave();
      return;
    }
    cfgRef.current = back;
    setCfg(back);
    setDirty(false);
    pollLive(); // 저장 직후 사이트 실시간 값 즉시 재확인
    if (!verified) {
      setCfgMsg("⚠️ 저장은 됐지만 기록이 일부 달라 보여요 — 새로고침(F5) 후 값을 확인해주세요.");
      return;
    }
    if (r.warn) {
      setCfgMsg("✓ 저장은 성공(사이트 반영됨) · ⚠️ " + r.warn + " — 이 문구를 캡처해서 전달해주세요.");
    } else {
      setCfgMsg("✓ 저장·검증 완료 — 사이트에 10초 안에 자동 반영됩니다");
      setTimeout(() => setCfgMsg(""), 6000);
    }
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
      {hostOk === false && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(15,17,38,0.97)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 440, textAlign: "center", background: "var(--card)", border: "2px solid var(--red)", borderRadius: 16, padding: "32px 24px" }}>
            <div style={{ fontSize: 40 }}>⛔</div>
            <h2 style={{ margin: "12px 0", color: "var(--red)" }}>잘못된 주소의 어드민입니다</h2>
            <p style={{ color: "var(--dim)", fontSize: 14, lineHeight: 1.8 }}>
              지금 주소: <b>{typeof location !== "undefined" ? location.host : ""}</b><br />
              여기서 저장하면 <b>실제 사이트에 반영되지 않습니다.</b><br />
              반드시 공식 어드민에서만 수정해주세요.
            </p>
            <a href={"https://" + CANONICAL_HOST + "/admin"} style={{ display: "inline-block", marginTop: 12, background: "var(--gold)", color: "#17182E", fontWeight: 800, borderRadius: 10, padding: "12px 20px", textDecoration: "none" }}>
              👉 공식 어드민으로 이동
            </a>
          </div>
        </div>
      )}
      <div className="eyebrow" style={{ color: "var(--gold)" }}>— ADMIN CONSOLE · BUILD {BUILD} —</div>

      {!authed ? (
        <div className="card">
          <div className="sechead"><h2>관리자 인증</h2><span className="en">AUTH</span></div>
          <div className="row">
            <input type="password" placeholder="관리자 키 입력" value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && unlock()} />
            <button onClick={unlock}>입장</button>
          </div>
          {err && <div className="adm-msg err">키가 올바르지 않거나 서버 연결에 실패했습니다.<DiagLink /></div>}
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
              {/* ★ v50 마케팅 지표 */}
              {data.marketing?.enabled && (
                <>
                  <div className="mcard">
                    <div className="k">순 방문자 (기기)</div>
                    <div className="v">{data.marketing.uniqueVisitors}</div>
                    <div className="s">어드민 방문 {data.marketing.adminExcluded}건 제외됨</div>
                  </div>
                  <div className="mcard hl">
                    <div className="k">재방문율</div>
                    <div className="v">{data.marketing.returningRate}%</div>
                    <div className="s">2회 이상 방문 기기 {data.marketing.returningCount}개</div>
                  </div>
                  <div className="mcard" style={{ gridColumn: "1 / -1" }}>
                    <div className="k">평균 체류시간</div>
                    <div className="v">{data.marketing.avgDwell >= 60 ? Math.floor(data.marketing.avgDwell / 60) + "분 " + (data.marketing.avgDwell % 60) + "초" : data.marketing.avgDwell + "초"}</div>
                    <div className="s" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
                      표본 {data.marketing.dwellSamples}건 · 1회 상한
                      <input type="number" min={10} max={3600} value={mktCap} style={{ width: 70, padding: "4px 6px" }}
                        onChange={(e) => { const v = parseInt(e.target.value, 10) || 180; setMktCap(v); mktCapRef.current = v; }} />
                      초 <button className="sm ghost" onClick={() => load(key)}>적용</button>
                      <span style={{ opacity: 0.7 }}>← 한 명이 오래 켜놔도 이 값 이상은 안 세요</span>
                    </div>
                  </div>
                </>
              )}
            </div>
            {data.marketing && !data.marketing.enabled && (
              <div className="adm-msg" style={{ textAlign: "left", color: "#ff9f43", paddingBottom: 0 }}>
                ⚠️ 재방문율·체류시간·관심도를 켜려면 Supabase → SQL Editor에서 1회 실행 (zip의 supabase/방문지표_컬럼추가.sql):
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, background: "rgba(255,255,255,.06)", padding: 8, borderRadius: 6, marginTop: 6 }}>{`alter table visits add column if not exists vid text;
alter table visits add column if not exists phone text;
alter table visits add column if not exists dur int;
alter table visits add column if not exists is_admin boolean default false;`}</pre>
              </div>
            )}
            <div className="adm-msg" style={{ paddingBottom: 0 }}>{tip}</div>
          </div>

          {/* ★ v61 구독자 관심도 — 전부 자동 집계 (방문·체류·문자 반응·만남) */}
          {(() => {
            const engMap = {};
            (data.marketing?.engagement || []).forEach((e) => { engMap[e.id] = e; });
            const rows = (data.subscribers || []).filter((x) => x.approved).map((x) => {
              const web = engMap[x.id] || { visits: 0, totalDur: 0, lastAt: null };
              const sm = data.smsStats?.[x.id] || { sent: 0, reacted: 0 };
              const meets = data.meetCounts?.[x.id] || 0;
              // 점수: 방문 5점 · 체류 1분당 1점 · 문자 반응 10점 · 만남 20점 (전부 자동)
              const score = web.visits * 5 + Math.round((web.totalDur || 0) / 60) + sm.reacted * 10 + meets * 20;
              const grade = score >= 100 ? "S" : score >= 60 ? "A" : score >= 30 ? "B" : score >= 10 ? "C" : "D";
              return { ...x, web, sm, meets, score, grade };
            }).sort((a, b) => b.score - a.score || (a.name || "").localeCompare(b.name || ""));
            const gColor = { S: "var(--gold)", A: "var(--hp)", B: "var(--mp)", C: "var(--dim)", D: "var(--dim)" };
            return (
              <div className="card">
                <div className="sechead"><h2>구독자 관심도</h2><span className="en">ENGAGEMENT</span></div>
                {data.smsEventsTableMissing && (
                  <div className="adm-msg" style={{ textAlign: "left", color: "#ff9f43", paddingTop: 0 }}>
                    ⚠️ 문자 반응 추적을 켜려면 Supabase → SQL Editor에서 1회 실행 (zip의 supabase/문자이벤트_테이블.sql):
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, background: "rgba(255,255,255,.06)", padding: 8, borderRadius: 6, marginTop: 6 }}>{`create table if not exists sms_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  sub_id bigint not null, kind text not null
);
create index if not exists idx_smsevents_sub on sms_events (sub_id);
alter table sms_events enable row level security;`}</pre>
                  </div>
                )}
                {!data.marketing?.enabled && (
                  <div className="adm-msg" style={{ textAlign: "left", color: "#ff9f43", paddingTop: 0 }}>
                    ⚠️ 방문·체류 집계는 방문지표 SQL(방문지표_컬럼추가.sql) 실행 후 켜집니다.
                  </div>
                )}
                {rows.length === 0 ? (
                  <div className="adm-msg" style={{ textAlign: "left", padding: 0 }}>승인된 구독자가 없습니다.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {rows.map((x, i) => (
                      <div key={x.id} style={{ border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, padding: "10px 12px", fontSize: 13 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <b style={{ color: "var(--gold)", minWidth: 26 }}>{i + 1}위</b>
                          <span>{x.icon || "🙋"}</span>
                          <b>{x.name}</b>
                          <span className={"chip t" + (parseInt(x.chon, 10) || 4)}>{parseInt(x.chon, 10) || 4}촌</span>
                          <b style={{ marginLeft: "auto", color: gColor[x.grade], fontSize: 15 }}>{x.grade}</b>
                          <span style={{ color: "var(--dim)", fontSize: 12 }}>{x.score}점</span>
                        </div>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6, color: "var(--dim)", fontSize: 12.5 }}>
                          <span>🌐 방문 <b style={{ color: "var(--text)" }}>{x.web.visits}</b>회</span>
                          <span>⏱ 체류 <b style={{ color: "var(--text)" }}>{Math.round((x.web.totalDur || 0) / 60)}</b>분</span>
                          <span>📲 문자 반응 <b style={{ color: x.sm.reacted > 0 ? "var(--hp)" : "var(--text)" }}>{x.sm.reacted}</b>/{x.sm.sent}통{x.sm.sent > 0 ? " (" + Math.round((x.sm.reacted / x.sm.sent) * 100) + "%)" : ""}</span>
                          <span>🤝 만남 <b style={{ color: "var(--text)" }}>{x.meets}</b>회</span>
                          {x.web.lastAt && <span>마지막 방문 {fmtKST(x.web.lastAt).slice(5, 11)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="adm-msg" style={{ padding: "10px 0 0", textAlign: "left", opacity: 0.7 }}>
                  전부 자동 집계됩니다 — 점수 = 방문 5점 · 체류 1분당 1점 · 문자 반응(문자 받고 48시간 내 사이트 방문) 10점 · 만남 20점 → S(100+) A(60+) B(30+) C(10+) D.
                  방문·체류·문자 반응은 <b>번호 인증한 방문</b>만 잡힙니다.
                </div>
              </div>
            );
          })()}

          {/* ★ v52 생일 임박 (30일 이내) — 비공개, 나만 보는 관리용 */}
          {(() => {
            const now = new Date(Date.now() + 9 * 3600 * 1000);
            const y = now.getUTCFullYear();
            const today = Date.UTC(y, now.getUTCMonth(), now.getUTCDate());
            const list = (data.subscribers || [])
              .filter((s2) => s2.approved && s2.birthday)
              .map((s2) => {
                const mm = parseInt(String(s2.birthday).slice(0, 2), 10);
                const dd = parseInt(String(s2.birthday).slice(3), 10);
                if (!mm || !dd) return null;
                let t = Date.UTC(y, mm - 1, dd);
                if (t < today) t = Date.UTC(y + 1, mm - 1, dd);
                return { ...s2, dday: Math.round((t - today) / 86400000) };
              })
              .filter((x) => x && x.dday <= 30)
              .sort((a, b) => a.dday - b.dday);
            const close = list.filter((x) => (parseInt(x.chon, 10) || 4) <= 3);
            const subsOnly = list.filter((x) => (parseInt(x.chon, 10) || 4) === 4);
            const row = (x) => (
              <div key={x.id} style={{ border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, padding: "8px 10px", fontSize: 13, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <b style={{ color: x.dday <= 7 ? "var(--red)" : "var(--gold)", minWidth: 44 }}>{x.dday === 0 ? "🎉 오늘!" : "D-" + x.dday}</b>
                <span>🎂 {x.birthday}</span>
                <span>{x.icon || "🙋"} <b>{x.name}</b></span>
                <span className={"chip t" + (parseInt(x.chon, 10) || 4)}>{parseInt(x.chon, 10) || 4}촌</span>
                <span style={{ opacity: 0.8 }}>{x.job}</span>
              </div>
            );
            return (
              <div className="card">
                <div className="sechead"><h2>🎂 생일 임박</h2><span className="en">BIRTHDAYS</span></div>
                {list.length === 0 ? (
                  <div className="adm-msg" style={{ textAlign: "left", padding: 0 }}>
                    30일 이내 생일인 구독자가 없습니다. 생일은 구독 신청 시(선택) 또는 아래 구독자 카드의 "생일 MM-DD" 칸으로 입력됩니다.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {close.length > 0 && <>
                      <div className="flabel" style={{ color: "var(--gold)" }}>가까운 사이 (1~3촌) — 선물 준비 추천 🎁</div>
                      {close.map(row)}
                    </>}
                    {subsOnly.length > 0 && <>
                      <div className="flabel" style={{ color: "var(--mp)" }}>구독자 (4촌) — 축하 문자 추천 💬</div>
                      {subsOnly.map(row)}
                    </>}
                  </div>
                )}
                <div className="adm-msg" style={{ padding: "8px 0 0", textAlign: "left", opacity: 0.7 }}>
                  생일·이름은 사이트에 절대 공개되지 않습니다. 7일 이내는 빨간색으로 표시됩니다.
                </div>
              </div>
            );
          })()}

          {/* ★ v62 추천 현황 */}
          {(() => {
            const subById = (id) => (data.subscribers || []).find((x) => x.id === id);
            const refs = data.referrals || [];
            const pending = refs.filter((r) => r.status !== "paid");
            // 이름만 입력됐고 아직 추천 확정이 안 된 승인 구독자 → 수동 연결 대상
            const manual = (data.subscribers || []).filter((x) => x.approved && x.ref_name && !refs.some((r) => r.referee_id === x.id));
            const refCount = {};
            refs.forEach((r) => { refCount[r.referrer_id] = (refCount[r.referrer_id] || 0) + 1; });
            return (
              <div className="card">
                <div className="sechead"><h2>🎁 추천 현황</h2><span className="en">REFERRAL</span>
                  {pending.length > 0 && <span style={{ marginLeft: "auto", color: "var(--red)", fontWeight: 800, fontSize: 13 }}>🍗 지급 대기 {pending.length}건</span>}
                </div>
                {data.referralsTableMissing && (
                  <div className="adm-msg" style={{ textAlign: "left", color: "#ff9f43", paddingTop: 0 }}>
                    ⚠️ 추천 테이블이 아직 없습니다. Supabase → SQL Editor에서 1회 실행 (zip의 supabase/추천제도_테이블.sql):
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, background: "rgba(255,255,255,.06)", padding: 8, borderRadius: 6, marginTop: 6 }}>{`alter table subscribers add column if not exists referrer_id bigint;
alter table subscribers add column if not exists ref_name text;
create table if not exists referrals (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  referrer_id bigint not null, referee_id bigint not null,
  status text not null default 'pending', paid_at timestamptz
);
create index if not exists idx_referrals_referrer on referrals (referrer_id);
alter table referrals enable row level security;`}</pre>
                  </div>
                )}
                {refs.length === 0 && manual.length === 0 && !data.referralsTableMissing ? (
                  <div className="adm-msg" style={{ textAlign: "left", padding: 0 }}>
                    아직 추천이 없습니다. 구독자가 인증 후 "🎁 추천하고 치킨 받기"로 링크를 공유하면, 그 링크로 온 신규 구독자를 <b>승인하는 순간</b> 여기에 자동으로 잡힙니다 (추천인·사장님께 알림 문자도 자동 발송).
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {refs.map((r) => {
                      const a = subById(r.referrer_id), b2 = subById(r.referee_id);
                      return (
                        <div key={r.id} style={{ border: "1px solid " + (r.status === "paid" ? "rgba(255,255,255,.12)" : "var(--gold)"), borderRadius: 8, padding: "8px 10px", fontSize: 13, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span className="time" style={{ opacity: 0.7 }}>{fmtKST(r.created_at).slice(5, 11)}</span>
                          <b>{a?.name || "?"}</b>
                          <span style={{ color: "var(--dim)" }}>님이</span>
                          <b>{b2?.name || "?"}</b>
                          <span style={{ color: "var(--dim)" }}>님 추천</span>
                          {refCount[r.referrer_id] > 1 && <span style={{ color: "var(--gold)", fontSize: 12 }}>누적 {refCount[r.referrer_id]}명</span>}
                          {r.status === "paid" ? (
                            <span style={{ marginLeft: "auto", color: "var(--hp)", fontSize: 12 }}>✓ 지급 완료 {r.paid_at ? fmtKST(r.paid_at).slice(5, 11) : ""}</span>
                          ) : (
                            <button className="sm" style={{ marginLeft: "auto" }} onClick={async () => {
                              if (!confirm((a?.name || "") + "님에게 치킨 쿠폰을 보내셨나요? 지급 완료로 표시합니다.")) return;
                              await post({ action: "ref_paid", id: r.id }); load(key);
                            }}>🍗 지급 완료</button>
                          )}
                        </div>
                      );
                    })}
                    {manual.map((x) => (
                      <div key={"m" + x.id} style={{ border: "1px dashed var(--mp)", borderRadius: 8, padding: "8px 10px", fontSize: 13, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ color: "var(--mp)" }}>✍️ 수동 확인</span>
                        <b>{x.name}</b>
                        <span style={{ color: "var(--dim)" }}>님이 입력한 추천인: "{x.ref_name}"</span>
                        <select style={{ marginLeft: "auto" }} value="" onChange={async (e) => {
                          const rid = parseInt(e.target.value, 10);
                          if (!rid) return;
                          const r = await post({ action: "ref_link", referrer_id: rid, referee_id: x.id });
                          if (r.ok) load(key); else alert("연결 실패 — 이미 연결됐거나 잘못된 대상입니다.");
                        }}>
                          <option value="">추천인 지정 →</option>
                          {(data.subscribers || []).filter((y) => y.id !== x.id).map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
                <div className="adm-msg" style={{ padding: "10px 0 0", textAlign: "left", opacity: 0.7 }}>
                  흐름: 추천 링크로 구독 신청 → <b>승인 순간 자동 확정</b> → 추천인에게 "쿠폰 보내드릴게요" 문자 + 나에게 알림 문자 자동 발송 → 카톡 선물하기로 BHC 쿠폰 전송 → [🍗 지급 완료] 클릭. 이름만 입력된 건은 위 "수동 확인"에서 연결하면 됩니다.
                </div>
              </div>
            );
          })()}

          {/* ★ v54 만남 기록 & 후속 문자 */}
          {(() => {
            const kToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
            const subById = (id) => (data.subscribers || []).find((x) => x.id === id);
            const todayMeets = (data.meetings || []).filter((m) => String(m.met_on).slice(0, 10) === kToday);
            const tpls = (cfg?.smsTemplates || []);
            const firstTarget = fuIds.length ? subById(fuIds[0]) : null;
            return (
              <div className="card">
                <div className="sechead"><h2>🤝 만남 & 후속 문자</h2><span className="en">FOLLOW-UP</span></div>
                {data.meetingsTableMissing && (
                  <div className="adm-msg" style={{ textAlign: "left", color: "#ff9f43", paddingTop: 0 }}>
                    ⚠️ 만남 테이블이 아직 없습니다. Supabase → SQL Editor에서 1회 실행 (zip의 supabase/만남기록_테이블.sql):
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, background: "rgba(255,255,255,.06)", padding: 8, borderRadius: 6, marginTop: 6 }}>{`create table if not exists meetings (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  sub_id bigint not null, met_on date not null, note text
);
alter table meetings enable row level security;`}</pre>
                  </div>
                )}
                {/* A. 오늘 만남 기록 */}
                <div className="flabel">1) 오늘 만난 사람 기록 — 기록하면 몇 번째 만남인지 자동으로 셉니다</div>
                <div className="ed-row" style={{ flexWrap: "wrap", marginBottom: 6 }}>
                  <select style={{ minWidth: 150 }} value={mtSub} onChange={(e) => setMtSub(e.target.value)}>
                    <option value="">누구를 만났나요?</option>
                    {(data.subscribers || []).map((x) => (
                      <option key={x.id} value={x.id}>{x.name} ({x.job || "직업 미입력"}){data.meetCounts?.[x.id] ? " · " + data.meetCounts[x.id] + "회" : ""}</option>
                    ))}
                  </select>
                  <input style={{ flex: 1, minWidth: 140 }} value={mtNote} maxLength={200} placeholder="특이사항 (예: 골프 좋아함, 다음에 소개 약속)"
                    onChange={(e) => setMtNote(e.target.value)} />
                  <button className="sm" disabled={!mtSub} onClick={meetAdd}>+ 만남 기록</button>
                </div>
                {mtMsg && (
                  <div className="adm-msg" style={{ padding: "0 0 8px", textAlign: "left" }}>
                    <b style={{ color: mtMsg.startsWith("ok:") ? "var(--hp)" : "var(--red)" }}>{mtMsg.startsWith("ok:") ? "✓ " : "❌ "}{mtMsg.slice(mtMsg.indexOf(":") + 1)}</b>
                  </div>
                )}
                {/* B. 최근 만남 목록 */}
                {(data.meetings || []).length > 0 && (
                  <details style={{ marginBottom: 12 }} open={todayMeets.length > 0}>
                    <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--dim)" }}>📒 최근 만남 기록 {data.meetings.length}건 (오늘 {todayMeets.length}건)</summary>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                      {(data.meetings || []).slice(0, 30).map((m) => {
                        const sub = subById(m.sub_id);
                        const isToday = String(m.met_on).slice(0, 10) === kToday;
                        return (
                          <div key={m.id} style={{ border: "1px solid " + (isToday ? "var(--gold)" : "rgba(255,255,255,.12)"), borderRadius: 8, padding: "7px 9px", fontSize: 13, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ color: isToday ? "var(--gold)" : "var(--dim)" }}>{String(m.met_on).slice(5, 10)}{isToday ? " 오늘" : ""}</span>
                            <b>{sub?.name || "삭제된 구독자"}</b>
                            <input style={{ flex: 1, minWidth: 120, fontSize: 12, padding: "4px 6px" }} defaultValue={m.note || ""} placeholder="특이사항 메모"
                              onBlur={(e) => e.target.value !== (m.note || "") && meetNote(m.id, e.target.value)} />
                            <button className="sm ghost" style={{ color: "#ff8f8f" }} onClick={() => meetDel(m.id)}>✕</button>
                          </div>
                        );
                      })}
                    </div>
                    <div className="adm-msg" style={{ padding: "6px 0 0", textAlign: "left", opacity: 0.7 }}>메모는 칸을 벗어나면 자동 저장됩니다.</div>
                  </details>
                )}
                {/* C. 후속 문자 */}
                <div className="flabel">2) 후속 문자 보내기 — 만났으면 무조건 후속 문자! 대상 선택 → 템플릿 → 수정 → 발송</div>
                <div className="ed-row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {todayMeets.length > 0 && (
                    <button className="sm ghost" onClick={() => setFuIds([...new Set(todayMeets.map((m) => m.sub_id))])}>☀️ 오늘 만난 {new Set(todayMeets.map((m) => m.sub_id)).size}명 모두 선택</button>
                  )}
                  <select value="" onChange={(e) => { const id = parseInt(e.target.value, 10); if (id) setFuIds((p) => (p.includes(id) ? p : [...p, id])); }}>
                    <option value="">+ 사람 추가</option>
                    {(data.subscribers || []).filter((x) => !fuIds.includes(x.id)).map((x) => (
                      <option key={x.id} value={x.id}>{x.name} ({x.job || ""})</option>
                    ))}
                  </select>
                </div>
                {fuIds.length > 0 && (
                  <div className="ed-row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {fuIds.map((id) => {
                      const x = subById(id);
                      return (
                        <button key={id} className="sm" title="눌러서 제외" onClick={() => setFuIds((p) => p.filter((v) => v !== id))}>
                          {x?.icon || "🙋"} {x?.name || "?"}{data.meetCounts?.[id] ? " · " + data.meetCounts[id] + "회" : ""} ✕
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="ed-row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                  <span className="adm-msg" style={{ padding: 0 }}>템플릿:</span>
                  {tpls.map((t) => (
                    <button key={t.name} className={"sm " + (fuTpl === t.name ? "" : "ghost")}
                      onClick={() => { setFuTpl(t.name); setFuText(t.text); }}>{t.name}</button>
                  ))}
                </div>
                <textarea rows={4} value={fuText} maxLength={1000} style={{ resize: "vertical" }}
                  placeholder="템플릿을 고르거나 직접 작성하세요. [이름]·[횟수]는 사람마다 자동으로 바뀝니다."
                  onChange={(e) => setFuText(e.target.value)} />
                {fuTpl && fuText.trim() && (
                  <div className="ed-row" style={{ marginTop: 6 }}>
                    <button className="sm ghost" onClick={() => {
                      updateCfg({ ...cfg, smsTemplates: tpls.map((t) => (t.name === fuTpl ? { ...t, text: fuText } : t)) });
                      setFuMsg("💾 \"" + fuTpl + "\" 템플릿에 저장됨 (자동 저장)");
                    }}>💾 이 내용을 "{fuTpl}" 템플릿으로 저장</button>
                  </div>
                )}
                {fuText.trim() && firstTarget && (
                  <div style={{ marginTop: 8 }}>
                    <div className="flabel">📩 실제 도착 문자 미리보기 ({firstTarget.name}님 기준 · 솔라피 발송 시)</div>
                    {labelWarn(fuText) && <div className="adm-msg" style={{ padding: "0 0 6px", textAlign: "left", color: "var(--red)" }}>⚠️ "사이트방문:" / "구독 취소:" 라벨은 자동으로 붙습니다 — 본문에서 지워주세요</div>}
                    <pre className="smsprev">{fullSms(fuText, firstTarget)}</pre>
                    <div className="adm-msg" style={{ padding: "4px 0 0", textAlign: "left", opacity: 0.7 }}>📱 내 폰으로 보낼 땐 [Web발신]·링크 없이 본문만 갑니다.</div>
                  </div>
                )}
                {/* ★ v55: 내 폰으로 직접 보내기 — [Web발신] 없이 개인 문자로 발송 */}
                {fuText.trim() && fuIds.length > 0 && (
                  <details style={{ marginTop: 10 }}>
                    <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--gold)" }}>
                      📱 내 폰으로 직접 보내기 — [Web발신] 표시 없이, 개인 문자로 도착
                    </summary>
                    <div className="adm-msg" style={{ padding: "6px 0 8px", textAlign: "left", opacity: 0.75 }}>
                      사람별 버튼을 누르면 문자 앱이 번호·문구가 채워진 채 열립니다. 전송만 누르면 끝! (이 방식은 링크가 자동으로 안 붙으니 필요하면 문구에 직접 넣어주세요)
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {fuIds.map((id) => {
                        const x = subById(id);
                        if (!x) return null;
                        const digits = String(x.phone || "").replace(/\D/g, "");
                        const body = fuText
                          .replace(/\[이름\]/g, x.name || "구독자")
                          .replace(/\[횟수\]/g, (data.meetCounts?.[id] || 0) ? data.meetCounts[id] + "번째" : "이번");
                        return (
                          <div key={"sms-" + id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
                            <span style={{ minWidth: 90 }}>{x.icon || "🙋"} <b>{x.name}</b></span>
                            <a className="sm" style={{ textDecoration: "none", background: "var(--gold)", color: "#17182E", fontWeight: 800, borderRadius: 8, padding: "7px 12px" }}
                              href={"sms:" + digits + "?&body=" + encodeURIComponent(body)}>
                              문자 앱 열기 →
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}
                <div className="adm-msg" style={{ padding: "6px 0 0", textAlign: "left", opacity: 0.75 }}>
                  모든 문자 끝에 "사이트방문:" / "구독 취소:" 링크가 자동으로 붙습니다. 대기중인 사람에게도 발송됩니다.
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                  <span className="adm-msg" style={{ padding: 0 }}>{fuMsg}</span>
                  <button className="sm" disabled={fuBusy || !fuText.trim() || fuIds.length === 0} onClick={sendFollowup}>
                    {fuBusy ? "발송중..." : `${fuIds.length}명에게 발송`}
                  </button>
                </div>
              </div>
            );
          })()}

          {/* 구독자 관리 */}
          <div className="card">
            <div className="toolbar">
              <div className="sechead" style={{ border: "none", padding: 0, margin: 0 }}>
                <h2>구독자 관리</h2><span className="en">SUBSCRIBERS</span>
              </div>
              <button className="sm" onClick={() => load(key, true)}>새로고침</button>
            </div>
            <div className="adm-msg" style={{ padding: "0 0 12px", textAlign: "left" }}>
              대기 → 승인으로 바꾸고 저장하면 환영 문자가 자동 발송됩니다{data.smsReady ? "" : " (Solapi 설정 후 활성화)"}.
              {" "}승인 후 사이트 4촌에 보이는지는{" "}
              <a href="/api/public" target="_blank" rel="noreferrer" style={{ color: "var(--mp)", fontWeight: 700, textDecoration: "underline" }}>여기(공개 데이터)</a>
              에서 바로 확인할 수 있어요.
            </div>
            {subMsg && (
              <div className="adm-msg" style={{ padding: "0 0 12px", textAlign: "left" }}>
                <b style={{ color: subMsg.startsWith("ok:") ? "var(--hp)" : "var(--red)" }}>
                  {subMsg.startsWith("ok:") ? "✓ " : "❌ "}{subMsg.slice(subMsg.indexOf(":") + 1)}
                </b>
                {subMsg.startsWith("err:") && <DiagLink />}
              </div>
            )}
            {/* ★ v44: 검색·필터 바 */}
            <div className="ed-row" style={{ marginBottom: 8 }}>
              <input style={{ flex: 1, minWidth: 0 }} placeholder="🔍 이름·전화·직업 검색" value={subQ} onChange={(e) => setSubQ(e.target.value)} />
            </div>
            <div className="ed-row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {[["all", "전체"], [1, "1촌"], [2, "2촌"], [3, "3촌"], [4, "4촌"], ["pending", "대기"]].map(([k, label]) => {
                const cnt = k === "all" ? data.subscribers.length
                  : k === "pending" ? data.subscribers.filter((x) => !x.approved).length
                  : data.subscribers.filter((x) => x.approved && (parseInt(x.chon, 10) || 4) === k).length;
                return (
                  <button key={k} className={"sm " + (subFilter === k ? "" : "ghost")} onClick={() => setSubFilter(k)}>
                    {label} {cnt}
                  </button>
                );
              })}
            </div>
            {(() => {
              const q = subQ.trim().toLowerCase();
              const list = data.subscribers.filter((x) => {
                if (subFilter === "pending" && x.approved) return false;
                if (typeof subFilter === "number" && (!x.approved || (parseInt(x.chon, 10) || 4) !== subFilter)) return false;
                if (q && !((x.name || "") + (x.phone || "") + (x.job || "") + (x.intro || "")).toLowerCase().includes(q)) return false;
                return true;
              });
              return list.length === 0 ? (
                <div className="adm-msg">{data.subscribers.length === 0 ? "아직 구독자가 없습니다." : "조건에 맞는 구독자가 없습니다."}</div>
              ) : (
              list.map((s) => {
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
                      <span className="time">{fmtKST(s.created_at)}</span>
                    </div>
                    <div className="meta">{s.phone}{s.ref_name ? <> · <span style={{ color: "var(--gold)" }}>🧭 {s.ref_name}</span></> : null}{s.referrer_id ? <> · <span style={{ color: "var(--mp)" }}>🔗 추천링크</span></> : null}</div>
                    {/* ★ 표시 정보 직접 수정 — 사이트 인맥 칸에 노출되는 값 */}
                    <div className="ctrl" style={{ marginTop: 6, flexWrap: "wrap" }}>
                      <input style={{ width: 46, textAlign: "center" }} value={e.icon ?? s.icon ?? "🙋"} maxLength={4} title="프로필 이모티콘"
                        onChange={(ev) => setEdit(s.id, { icon: ev.target.value })} />
                      <input style={{ width: 100 }} value={e.name ?? s.name ?? ""} placeholder="이름(비공개)"
                        onChange={(ev) => setEdit(s.id, { name: ev.target.value })} />
                      <input style={{ width: 110 }} value={e.job ?? s.job ?? ""} placeholder="직업(공개)"
                        onChange={(ev) => setEdit(s.id, { job: ev.target.value })} />
                      <input style={{ flex: 1, minWidth: 120 }} value={e.intro ?? s.intro ?? ""} placeholder="한줄소개(공개)"
                        onChange={(ev) => setEdit(s.id, { intro: ev.target.value })} />
                    </div>
                    {/* ★ v52: 생일(비공개) + 카테고리 수동 지정 */}
                    <div className="ctrl" style={{ marginTop: 6, flexWrap: "wrap" }}>
                      <input style={{ width: 110 }} value={e.birthday ?? s.birthday ?? ""} placeholder="생일 MM-DD" title="생일 (비공개, 선택)"
                        onChange={(ev) => setEdit(s.id, { birthday: ev.target.value })} />
                      <select value={e.cat ?? s.cat ?? ""} title="인맥 카테고리 (비우면 직업 기반 자동)"
                        onChange={(ev) => setEdit(s.id, { cat: ev.target.value })}>
                        <option value="">자동: {(NET_CATS.find((c) => c.id === autoCat(e.job ?? s.job, e.intro ?? s.intro)) || {}).name}</option>
                        {NET_CATS.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                      </select>
                    </div>
                    <div className="ctrl">
                      <select value={chonVal} onChange={(ev) => setEdit(s.id, { chon: ev.target.value })}>
                        {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}촌</option>)}
                      </select>
                      <select value={apvVal} onChange={(ev) => setEdit(s.id, { approved: ev.target.value })}>
                        <option value="N">대기</option>
                        <option value="Y">승인</option>
                      </select>
                      <button className="sm" onClick={() => save(s)}>저장</button>
                      <button className="sm ghost" style={{ color: "#ff8f8f", borderColor: "#5c2a2a" }} onClick={() => delSub(s)}>삭제</button>
                      {savedId === s.id && <span className="saved">저장됨 ✓</span>}
                    </div>
                  </div>
                );
              })
              );
            })()}
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
                <div className="meta">{fmtKST(n.created_at).slice(0, 10)}</div>
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
                {cfgSavedAt && <> · 마지막 저장 {fmtKST(cfgSavedAt)} (한국시간)</>}
                {cfgDirty && <b style={{ color: "var(--gold)" }}> · 저장 안 된 수정사항 있음</b>}
                <br />{cfgMsg && (
                  <b style={{ color: cfgMsg.startsWith("✓") ? "var(--hp)" : "var(--red)" }}>
                    {cfgMsg}
                    {(cfgMsg.startsWith("❌") || cfgMsg.startsWith("⚠️")) && !conflict && <DiagLink />}
                  </b>
                )}
                {conflict && (
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <button className="sm" onClick={() => { setConflict(false); setDirty(false); setCfgMsg(""); load(); }}>
                      🔄 최신값 불러오기 (이 화면의 수정 버림)
                    </button>
                    <button className="sm" onClick={() => saveConfig(true)}>
                      💪 이 화면의 값으로 덮어쓰기
                    </button>
                  </div>
                )}
              </div>

              {/* ★ 연결 상태 + 사이트 실시간 값 — 이 탭이 어디에 연결돼 있는지 즉시 확인 */}
              {live && (
                <div className="adm-msg" style={{ padding: "10px 12px", textAlign: "left", background: "var(--card2)", border: "1px solid var(--line)", borderRadius: 10, marginBottom: 12, fontSize: 13 }}>
                  <b style={{ color: "var(--gold)" }}>🔌 이 탭의 연결 상태</b>
                  <br />어드민 주소 <b>{typeof location !== "undefined" ? location.host : "?"}</b> · 서버 빌드 <b>{live.build}</b>
                  <br />연결된 디비 <b style={{ color: "var(--mp)" }}>{live.dbHost}</b>
                  <br />설정 버전 <b style={{ color: "var(--gold)" }}>{live.cfgV != null ? "#" + live.cfgV : "#100(첫 저장 전)"}</b>{live.cfgVia ? <span style={{ opacity: 0.8 }}> ({live.cfgVia})</span> : null} · 디비 마지막 저장 <b>{fmtKST(live.updatedAt)}</b> <span style={{ opacity: 0.7 }}>← 저장할 때마다 번호가 +1 되어야 정상</span>{live.cfgErr ? <><br /><b style={{ color: "#ff6b6b" }}>⚠️ 설정 조회 오류: {live.cfgErr}</b></> : null}
                  <div style={{ borderTop: "1px dashed var(--line)", margin: "8px 0" }} />
                  <b style={{ color: "var(--gold)" }}>📡 사이트 실시간 값</b>
                  {liveAt && <span style={{ opacity: 0.6 }}> · {liveAt.toLocaleTimeString()} 확인 (10초마다 자동)</span>}
                  <br />이름 <b>{live.cfg.texts.name}</b> · HP <b>{live.cfg.hp.v}</b> · 개발스텟 <b>{(live.cfg.stats.find((s) => s.name === "개발") || {}).v ?? "-"}</b>
                  <br /><span style={{ opacity: 0.7 }}>저장 &amp; 반영 후 이 줄이 바뀌면 = 반영 성공. "디비 마지막 저장" 시각도 방금 시각으로 바뀌어야 정상입니다.</span>
                </div>
              )}

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

              {/* HP / MP */}
              <details className="ed-group">
                <summary>HP / MP 게이지</summary>
                {["hp", "mp"].map((g) => (
                  <div key={g}>
                    <div className="ed-row">
                      <span style={{ width: 40, fontWeight: 800, fontFamily: "var(--pixel)", fontSize: 11, color: g === "hp" ? "#FF5B5B" : "var(--mp)" }}>{g.toUpperCase()}</span>
                      <input type="number" min={0} max={100} style={{ width: 90, flexShrink: 0 }}
                        value={cfg[g].v}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setGauge(g, "v", raw === "" ? "" : Math.max(0, Math.min(100, parseInt(raw, 10) || 0)));
                        }}
                        onBlur={(e) => {
                          const n = parseInt(e.target.value, 10);
                          setGauge(g, "v", isNaN(n) ? 50 : Math.max(0, Math.min(100, n)));
                        }} />
                      <input style={{ flex: 1, minWidth: 0 }} placeholder="설명 문구"
                        value={cfg[g].cap}
                        onChange={(e) => setGauge(g, "cap", e.target.value)} />
                    </div>
                  </div>
                ))}
                <div className="adm-msg" style={{ padding: 0, textAlign: "left", fontSize: 12 }}>HP 30 이하면 빨간색으로 깜빡입니다.</div>
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
                        <option>확장</option><option>고도화</option><option>성장</option><option>초기</option>
                      </select>
                    </div>
                    <div className="ed-row">
                      <textarea rows={2} style={{ flex: 1, minWidth: 0 }} value={b.desc || ""} onChange={(e) => bizOps.set(i, "desc", e.target.value)} placeholder="3촌에게만 보이는 상세 설명 (줄바꿈 가능)" />
                    </div>
                    <div className="ed-row">
                      <input style={{ flex: 1, minWidth: 0 }} value={b.tag} onChange={(e) => bizOps.set(i, "tag", e.target.value)} placeholder="이커머스 · 3개 · 2024년~" />
                      <button className="sm ghost" onClick={() => bizOps.move(i, -1)}>▲</button>
                      <button className="sm ghost" onClick={() => bizOps.move(i, 1)}>▼</button>
                      <button className="sm ghost" onClick={() => bizOps.del(i)}>✕</button>
                    </div>
                  </div>
                ))}
                <button className="sm" onClick={() => bizOps.add({ icon: "🆕", name: "새 사업", tag: "카테고리 · 1개", stage: "초기", desc: "" })}>+ 사업 추가</button>
              </details>

              {/* ✍️ 글 — 자유 게시 */}
              <details>
                <summary>✍️ 글 — 자유롭게 쓰는 공간</summary>
                <div className="fgroup">
                  <div className="flabel">섹션 제목</div>
                  <input value={cfg.texts.postsTitle} onChange={(e) => setText("postsTitle", e.target.value)} />
                </div>
                <div className="fgroup">
                  <div className="flabel">섹션 설명 (비우면 숨김)</div>
                  <input value={cfg.texts.postsDesc} onChange={(e) => setText("postsDesc", e.target.value)} />
                </div>
                {(cfg.posts || []).map((po, i) => (
                  <div className="ed-biz" key={i}>
                    <div className="ed-row">
                      <input style={{ flex: 1, minWidth: 0 }} value={po.title} placeholder="제목" onChange={(e) => postOps.set(i, "title", e.target.value)} />
                      <input style={{ width: 110, flexShrink: 0 }} value={po.date} placeholder="2026.07.13" onChange={(e) => postOps.set(i, "date", e.target.value)} />
                    </div>
                    <div className="ed-row">
                      <textarea rows={5} style={{ flex: 1, minWidth: 0, resize: "vertical" }} value={po.body} placeholder="내용 — 줄바꿈 그대로 표시됩니다" onChange={(e) => postOps.set(i, "body", e.target.value)} />
                    </div>
                    <div className="ed-row" style={{ justifyContent: "flex-end" }}>
                      <button className="sm ghost" onClick={() => postOps.move(i, -1)}>▲</button>
                      <button className="sm ghost" onClick={() => postOps.move(i, 1)}>▼</button>
                      <button className="sm ghost" onClick={() => postOps.del(i)}>✕</button>
                    </div>
                  </div>
                ))}
                <button className="sm" onClick={() => {
                  const k = new Date(Date.now() + 9 * 3600 * 1000).toISOString();
                  postOps.add({ title: "", date: k.slice(0, 10).replace(/-/g, "."), body: "" });
                }}>+ 글 추가</button>
                <div className="adm-msg" style={{ padding: "8px 0 0", textAlign: "left", opacity: 0.75 }}>
                  글은 모든 방문자에게 공개됩니다. 저장하면 사이트 "글" 칸에 제목만 보이고, 누르면 펼쳐져요. 글이 하나도 없으면 칸 자체가 숨겨집니다.
                </div>
              </details>

              {/* 인맥 (1~4촌) */}
              <details className="ed-group" open>
                <summary>🧑‍🤝‍🧑 인맥 편집 — 1~4촌 멘트·인물 추가/수정</summary>
                <div className="fgroup">
                  <div className="flabel">인맥 설명 문구</div>
                  <input value={cfg.texts.netDesc} onChange={(e) => setText("netDesc", e.target.value)} />
                </div>
                <div className="fgroup">
                  <div className="flabel">빈 슬롯 문구 (1~3촌에 아무도 없을 때)</div>
                  <input value={cfg.texts.netEmpty} onChange={(e) => setText("netEmpty", e.target.value)} />
                </div>
                <div className="fgroup">
                  <div className="flabel">4촌 비어있을 때 문구</div>
                  <input value={cfg.texts.net4Empty} onChange={(e) => setText("net4Empty", e.target.value)} />
                </div>
                {cfg.network.map((g, gi) => {
                  const ops = netPeople(gi);
                  return (
                    <div className="ed-biz" key={g.chon}>
                      <div className="ed-row">
                        <span className={`chip t${g.chon}`} style={{ flexShrink: 0 }}>{g.chon}촌</span>
                        <input style={{ flex: 1, minWidth: 0 }} value={g.rule} placeholder="촌수 기준 멘트"
                          onChange={(e) => setNetRule(gi, e.target.value)} />
                      </div>
                      {(g.people || []).map((p, pi) => (
                        <div className="ed-row" key={pi}>
                          <input style={{ width: 52, flexShrink: 0, textAlign: "center" }} value={p.icon}
                            onChange={(e) => ops.set(pi, "icon", e.target.value)} />
                          <input style={{ width: 105, flexShrink: 0 }} value={p.job} placeholder="직함"
                            onChange={(e) => ops.set(pi, "job", e.target.value)} />
                          <input style={{ flex: 1, minWidth: 0 }} value={p.desc} placeholder="한 줄 소개"
                            onChange={(e) => ops.set(pi, "desc", e.target.value)} />
                          <select style={{ width: 96, flexShrink: 0 }} value={p.cat || ""} title="카테고리 (비우면 자동)"
                            onChange={(e) => ops.set(pi, "cat", e.target.value)}>
                            <option value="">자동</option>
                            {NET_CATS.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                          </select>
                          <button className="sm ghost" onClick={() => ops.move(pi, -1)}>▲</button>
                          <button className="sm ghost" onClick={() => ops.move(pi, 1)}>▼</button>
                          <button className="sm ghost" onClick={() => ops.del(pi)}>✕</button>
                        </div>
                      ))}
                      <button className="sm" onClick={ops.add}>+ {g.chon}촌 사람 추가</button>
                      {g.chon === 4 && (
                        <div className="adm-msg" style={{ padding: "8px 0 0", textAlign: "left", fontSize: 12 }}>
                          승인된 구독자는 여기 목록과 별개로 촌수에 맞춰 자동으로 표시됩니다.
                        </div>
                      )}
                    </div>
                  );
                })}
              </details>

              {/* 섹션 문구 */}
              <details className="ed-group">
                <summary>섹션 문구 (구독·포획·잠금팝업)</summary>
                {[
                  ["subTitle", "구독 버튼 문구"],
                  ["subDesc", "구독 설명"],
                  ["ctaLine", "포획 첫 줄"],
                  ["ctaVerbBefore", "잡기 전 어미"],
                  ["ctaVerbAfter", "잡은 후 어미"],
                  ["ctaWelcome", "환영 문구"],
                  ["ctaLocation", "위치 문구"],
                  ["caughtLine", "포획 성공 대사"],
                  ["bizGateDesc", "사업 잠금(미구독) 안내 문구"],
                  ["netGateDesc", "인맥 잠금(미구독) 안내 문구"],
                  ["gateSubBtn", "잠금화면 구독 버튼"],
                  ["gateUnlockBtn", "잠금화면 인증 버튼"],
                  ["unlockTitle", "구독자 인증 팝업 제목"],
                  ["unlockDesc", "구독자 인증 팝업 설명"],
                  ["unlockFail", "인증 실패 문구"],
                  ["lockBiz3Title", "사업 상세 3촌 안내 제목"],
                  ["lockBiz3Desc", "사업 상세 3촌 안내 내용"],
                  ["lockNet3Title", "소개 신청 3촌 안내 제목"],
                  ["lockNet3Desc", "소개 신청 3촌 안내 내용"],
                  ["introReqTitle", "소개 신청 팝업 제목"],
                  ["introReqDesc", "소개 신청 팝업 설명"],
                  ["introPhone", "소개·커피챗 수신 번호"],
                  ["coffeeBtn", "커피챗 버튼 문구"],
                  ["coffeeSms", "커피챗 문자 기본 양식 (줄바꿈 가능)"],
                  ["lockBizTitle", "사업 잠금 팝업 제목"],
                  ["lockBizDesc", "사업 잠금 팝업 내용"],
                  ["lockNetTitle", "소개받기 팝업 제목"],
                  ["lockNetDesc", "소개받기 팝업 내용"],
                  ["lockBtn", "팝업 구독 버튼 문구"],
                ].map(([k, label]) => (
                  <div className="fgroup" key={k}>
                    <div className="flabel">{label}</div>
                    <input value={cfg.texts[k]} onChange={(e) => setText(k, e.target.value)} />
                  </div>
                ))}
                <div className="fgroup">
                  <div className="flabel">커피챗 안내 (줄바꿈 가능)</div>
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
              {data.smsReady
                ? "🟢 솔라피 연결됨 — 승인된 구독자 전원에게 발송됩니다. 사업 소식·인맥 업데이트 알림용."
                : "🔴 솔라피 미연결 — Vercel에 SOLAPI_API_KEY · SOLAPI_API_SECRET · SOLAPI_SENDER 3개를 추가하고 재배포하면 켜집니다."}
            </div>
            <div className="ed-row" style={{ marginBottom: 10 }}>
              <input style={{ flex: 1, minWidth: 0 }} inputMode="tel" placeholder="테스트 받을 번호 (예: 내 번호)" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
              <button className="sm ghost" disabled={testTo.replace(/\D/g, "").length < 10 || testBusy} onClick={testSms}>{testBusy ? "발송중..." : "테스트 발송"}</button>
            </div>
            {testMsg && <div className="adm-msg" style={{ padding: "0 0 10px", textAlign: "left" }}>{testMsg}</div>}
            <div className="ed-row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              <span className="adm-msg" style={{ padding: 0 }}>받는 사람:</span>
              {[1, 2, 3, 4].map((n) => (
                <button key={n} className={"sm " + (bcChons.includes(n) ? "" : "ghost")}
                  onClick={() => setBcChons(bcChons.includes(n) ? bcChons.filter((x) => x !== n) : [...bcChons, n])}>
                  {n}촌 {(data.subscribers || []).filter((x) => x.approved && (parseInt(x.chon, 10) || 4) === n).length}
                </button>
              ))}
              <b style={{ color: "var(--gold)", fontSize: 13 }}>→ 총 {bcTargets.length}명</b>
            </div>
            {/* ★ v57: 보내기 전 개별 제외/추가 */}
            <div className="ed-row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {bcTargets.map((t) => (
                <button key={t.id} className="sm" title="눌러서 이번 발송에서 제외"
                  onClick={() => bcExtra.includes(t.id) ? setBcExtra(bcExtra.filter((v) => v !== t.id)) : setBcExclude([...bcExclude, t.id])}>
                  {t.icon || "🙋"} {t.name} ✕
                </button>
              ))}
              <select value="" onChange={(e) => { const id = parseInt(e.target.value, 10); if (!id) return; setBcExclude(bcExclude.filter((v) => v !== id)); if (!bcBase.some((x) => x.id === id) && !bcExtra.includes(id)) setBcExtra([...bcExtra, id]); }}>
                <option value="">+ 사람 추가</option>
                {(data.subscribers || []).filter((x) => !bcTargets.some((t) => t.id === x.id)).map((x) => (
                  <option key={x.id} value={x.id}>{x.name} ({x.job || ""}){x.approved ? "" : " · 대기중"}</option>
                ))}
              </select>
              {bcManual && <button className="sm ghost" onClick={() => { setBcExclude([]); setBcExtra([]); }}>↺ 조정 초기화</button>}
            </div>
            <textarea rows={3} value={bcText} maxLength={1000} style={{ resize: "vertical" }}
              placeholder="예: [전성훈 상태창] [이름]님, AI 사주 플랫폼이 오픈했어요!  ← [이름]은 각자 이름으로 자동 변환"
              onChange={(e) => setBcText(e.target.value)} />
            {bcText.trim() && bcTargets[0] && (
              <div style={{ marginTop: 8 }}>
                <div className="flabel">📩 실제 도착 문자 미리보기 ({bcTargets[0].name}님 기준)</div>
                {labelWarn(bcText) && <div className="adm-msg" style={{ padding: "0 0 6px", textAlign: "left", color: "var(--red)" }}>⚠️ "사이트방문:" / "구독 취소:" 라벨은 자동으로 붙습니다 — 본문에서 지워주세요 (안 지우면 두 번 나와요)</div>}
                <pre className="smsprev">{fullSms(bcText, bcTargets[0])}</pre>
              </div>
            )}
            <div className="adm-msg" style={{ padding: "6px 0 0", textAlign: "left", opacity: 0.75 }}>
              모든 문자 끝에 "사이트방문:" / "구독 취소:" 링크가 각각 줄을 나눠 자동으로 붙습니다.
            </div>
            {/* ★ v48 예약 발송 */}
            <div className="ed-row" style={{ flexWrap: "wrap", gap: 6, marginTop: 10, alignItems: "center" }}>
              <span className="adm-msg" style={{ padding: 0 }}>⏰ 예약(선택):</span>
              <input type="datetime-local" value={bcAt} min={new Date(Date.now() + 9 * 3600 * 1000 + 2 * 60 * 1000).toISOString().slice(0, 16)}
                style={{ minWidth: 0 }} onChange={(e) => setBcAt(e.target.value)} />
              {bcAt && <button className="sm ghost" onClick={() => setBcAt("")}>예약 해제</button>}
            </div>
            {bcAt && (
              <div className="adm-msg" style={{ padding: "6px 0 0", textAlign: "left", opacity: 0.75 }}>
                한국시간 기준으로 예약됩니다. 등록 후 취소는 solapi.com → 문자 → 예약 목록에서 가능합니다.
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
              <span className="adm-msg" style={{ padding: 0 }}>{bcMsg}</span>
              <button className="sm" disabled={!bcText.trim() || bcTargets.length === 0} onClick={broadcast}>{bcAt ? "예약 발송" : "발송"}</button>
            </div>
            {/* ★ v57: 승인 시 자동 발송되는 환영 문자 — 여기서 수정, 자동 저장 */}
            <details style={{ marginTop: 14 }}>
              <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--gold)" }}>🤖 자동 환영 문자 수정 — 구독 승인할 때 자동으로 나가는 멘트</summary>
              <textarea rows={3} maxLength={500} style={{ resize: "vertical", marginTop: 8 }}
                value={cfg?.welcomeSms || ""}
                onChange={(e) => updateCfg({ ...cfg, welcomeSms: e.target.value })} />
              {(cfg?.welcomeSms || "").trim() && (() => {
                const sample = (data.subscribers || []).find((x) => x.approved) || null;
                return (
                  <div style={{ marginTop: 8 }}>
                    <div className="flabel">📩 실제 도착 문자 미리보기 ({sample?.name || "구독자"}님 기준)</div>
                    {labelWarn(cfg?.welcomeSms) && <div className="adm-msg" style={{ padding: "0 0 6px", textAlign: "left", color: "var(--red)" }}>⚠️ "사이트방문:" / "구독 취소:" 라벨은 자동으로 붙습니다 — 본문에서 지워주세요 (안 지우면 두 번 나와요)</div>}
                    <pre className="smsprev">{fullSms(cfg?.welcomeSms, sample)}</pre>
                  </div>
                );
              })()}
              <div className="adm-msg" style={{ padding: "6px 0 0", textAlign: "left", opacity: 0.7 }}>
                [이름]은 승인되는 사람 이름으로 바뀌고, "사이트방문:" / "구독 취소:" 링크가 자동으로 붙습니다. 수정하면 1.5초 뒤 자동 저장됩니다.
              </div>
            </details>
          </div>

          {/* ★ v49 문자 발송 내역 */}
          <div className="card">
            <div className="sechead"><h2>문자 발송 내역</h2><span className="en">SMS LOG</span></div>
            {data.smsLogTableMissing ? (
              <div className="adm-msg" style={{ padding: "0 0 8px", textAlign: "left", color: "#ff9f43" }}>
                ⚠️ 내역 테이블이 아직 없습니다. Supabase → SQL Editor에서 아래 한 번만 실행해주세요 (zip의 supabase/문자내역_테이블.sql과 동일):
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, background: "rgba(255,255,255,.06)", padding: 8, borderRadius: 6, marginTop: 6 }}>{`create table if not exists sms_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null, to_count int not null default 0,
  targets text, body text, scheduled_at text,
  ok boolean not null default false, detail text
);
alter table sms_log enable row level security;`}</pre>
              </div>
            ) : (data.smsLogs || []).length === 0 ? (
              <div className="adm-msg" style={{ padding: "0 0 8px", textAlign: "left" }}>아직 발송 내역이 없습니다. (테이블 생성 이후의 발송부터 기록됩니다)</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(data.smsLogs || []).map((l) => (
                  <div key={l.id} style={{ border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, padding: "8px 10px", fontSize: 13, lineHeight: 1.5 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <b style={{ color: l.ok ? "#2ecc71" : "#ff6b6b" }}>{l.ok ? "✓ 성공" : "❌ 실패"}</b>
                      <span style={{ color: "var(--gold)" }}>{l.kind === "broadcast" ? "단체" : l.kind === "welcome" ? "환영" : l.kind === "followup" ? "후속" : "테스트"}</span>
                      <span>{l.targets || ""}</span>
                      {l.scheduled_at && <span>⏰ 예약 {l.scheduled_at.replace("T", " ")}</span>}
                      <span className="time" style={{ opacity: 0.7 }}>{fmtKST(l.created_at)}</span>
                    </div>
                    {l.body && <div style={{ opacity: 0.85, marginTop: 3, whiteSpace: "pre-wrap", wordBreak: "keep-all" }}>{String(l.body).slice(0, 120)}{String(l.body).length > 120 ? "…" : ""}</div>}
                    {l.detail && <div style={{ opacity: 0.7, marginTop: 2, fontSize: 12 }}>{l.detail}</div>}
                  </div>
                ))}
              </div>
            )}
            <div className="adm-msg" style={{ padding: "8px 0 0", textAlign: "left", opacity: 0.7 }}>
              최근 30건 · 어드민에서 보낸 테스트/단체/환영 문자가 기록됩니다. 실제 수신 성공 여부·예약 목록은 solapi.com → 문자 메뉴에서 확인 가능합니다.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
