"use client";
import { useState, useRef, useEffect } from "react";
import { SECTION_LABELS, mergeConfig, BUILD, CANONICAL_HOST } from "@/lib/config";

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
    const t = setInterval(pollLive, 10000);
    const t2 = setInterval(() => load(), 15000); // ★ 구독자·지표도 15초마다 자동 갱신 (새 구독자 실시간 표시)
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

  async function load(k = key, clearEdits = false) {
    try {
      const r = await fetch("/api/admin?key=" + encodeURIComponent(k));
      if (!r.ok) return false;
      const d = await r.json();
      if (d.error) return false;
      setData(d);
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

  async function broadcast() {
    const n = (data?.subscribers || []).filter((s) => s.approved).length;
    if (!bcText.trim()) return;
    if (!confirm(`승인된 구독자 ${n}명에게 문자를 발송합니다. 진행할까요?`)) return;
    setBcMsg("발송중...");
    let r;
    try { r = await post({ action: "broadcast", text: bcText.trim() }); }
    catch (e) { setBcMsg("❌ 네트워크 오류 — 인터넷 연결을 확인해주세요."); return; }
    if (r.error === "no_sms") setBcMsg("❌ Solapi 환경변수(SOLAPI_API_KEY 등)가 아직 설정되지 않았습니다.");
    else if (r.error === "no_target") setBcMsg("❌ 승인된 구독자가 없습니다.");
    else if (r.ok) { setBcMsg(`✓ ${r.count}명에게 발송 완료`); setBcText(""); }
    else setBcMsg("❌ 발송 실패 — 잠시 후 다시 시도해주세요.");
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
            </div>
            <div className="adm-msg" style={{ paddingBottom: 0 }}>{tip}</div>
          </div>

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
                      <span className="time">{fmtKST(s.created_at)}</span>
                    </div>
                    <div className="meta">{s.phone}</div>
                    {/* ★ 표시 정보 직접 수정 — 사이트 인맥 칸에 노출되는 값 */}
                    <div className="ctrl" style={{ marginTop: 6, flexWrap: "wrap" }}>
                      <input style={{ width: 100 }} value={e.name ?? s.name ?? ""} placeholder="이름(비공개)"
                        onChange={(ev) => setEdit(s.id, { name: ev.target.value })} />
                      <input style={{ width: 110 }} value={e.job ?? s.job ?? ""} placeholder="직업(공개)"
                        onChange={(ev) => setEdit(s.id, { job: ev.target.value })} />
                      <input style={{ flex: 1, minWidth: 120 }} value={e.intro ?? s.intro ?? ""} placeholder="한줄소개(공개)"
                        onChange={(ev) => setEdit(s.id, { intro: ev.target.value })} />
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
                      <input style={{ flex: 1, minWidth: 0 }} value={b.tag} onChange={(e) => bizOps.set(i, "tag", e.target.value)} placeholder="이커머스 · 3개 · 2024년~" />
                      <button className="sm ghost" onClick={() => bizOps.move(i, -1)}>▲</button>
                      <button className="sm ghost" onClick={() => bizOps.move(i, 1)}>▼</button>
                      <button className="sm ghost" onClick={() => bizOps.del(i)}>✕</button>
                    </div>
                  </div>
                ))}
                <button className="sm" onClick={() => bizOps.add({ icon: "🆕", name: "새 사업", tag: "카테고리 · 1개", stage: "초기" })}>+ 사업 추가</button>
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
