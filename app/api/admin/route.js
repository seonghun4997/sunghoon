import { sb, kstDayStart, isApproved, readLatestConfig, writeNewConfig, unsubToken } from "@/lib/supabase";
import { mergeConfig } from "@/lib/config";
import { sendSMS } from "@/lib/solapi";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SITE = "https://sunghoon-nine.vercel.app";

function authed(key) {
  return key && key === process.env.ADMIN_KEY;
}

// ★ v49: 문자 발송 내역 기록. 테이블이 아직 없거나 실패해도 발송 자체를 막지 않음(조용히 무시).
async function logSms(client, entry) {
  try { await client.from("sms_log").insert(entry); } catch (e) {}
}

// ★ v60: 구독자별 '문자 보냄' 이벤트 기록 (관심도 집계용). 테이블 없어도 발송은 안 막음.
async function logSentEvents(client, subIds) {
  try {
    const ids = (subIds || []).filter(Boolean);
    if (ids.length) await client.from("sms_events").insert(ids.map((id) => ({ sub_id: id, kind: "sent" })));
  } catch (e) {}
}

// ★ v49: 솔라피 응답에서 사람이 읽을 요약 뽑기
function smsDetail(r) {
  if (!r) return "";
  if (r.skipped) return "환경변수 없음";
  try {
    const g = r.data?.groupInfo?.count || {};
    let d = "등록 " + (g.total ?? "?") + "건";
    const failed = r.data?.failedMessageList || [];
    if (failed.length) d += " · 실패: " + (failed[0].statusMessage || failed[0].statusCode || "원인미상");
    if (!r.ok && !failed.length) d += " · " + JSON.stringify(r.data || r.error || "").slice(0, 200);
    return d;
  } catch (e) { return r.ok ? "성공" : "실패"; }
}

export async function GET(req) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!authed(key)) return NextResponse.json({ error: "denied" }, { status: 401 });
  // ★ v50: 평균 체류시간 계산 상한(초) — 한 사람이 오래 봐도 통계가 안 튀게. 어드민에서 조절.
  const cap = Math.max(10, Math.min(3600, parseInt(url.searchParams.get("cap"), 10) || 180));
  try {
    const client = sb();
    const dayStart = kstDayStart();
    // ★ v57 최적화: 방문 통계는 행 1회 조회로 전부 계산 (기존 카운트 쿼리 4개 제거)
    const [subs, notes, cfgRow] = await Promise.all([
      client.from("subscribers").select("*").order("created_at", { ascending: false }),
      client.from("patchnotes").select("*").neq("version", "__config__").order("created_at", { ascending: false }),
      readLatestConfig(client),
    ]);
    const list = (subs.data || []).map((s) => ({ ...s, approved: isApproved(s.approved) }));
    // ★ v50 마케팅 지표: 방문 행을 직접 읽어 어드민 제외/재방문율/체류시간/구독자별 관심도 계산.
    //    새 컬럼 SQL 미실행이면 조용히 기존(총계) 방식만 유지.
    let marketing = { enabled: false, cap };
    let vTotal = 0, vToday = 0, vQr = 0, vShare = 0;
    const phoneVisitTimes = {}; // ★ v61: 번호별 방문 시각 (문자 반응 자동 계산용)
    {
      const { data: vr, error: ve } = await client
        .from("visits")
        .select("vid,phone,dur,created_at,src,is_admin")
        .order("created_at", { ascending: false })
        .limit(5000);
      if (ve) {
        // 새 컬럼 SQL 미실행 디비 폴백 — 이때만 카운트 쿼리 사용
        const [vt, vd, vqr, vshare] = await Promise.all([
          client.from("visits").select("*", { count: "exact", head: true }),
          client.from("visits").select("*", { count: "exact", head: true }).gte("created_at", dayStart),
          client.from("visits").select("*", { count: "exact", head: true }).eq("src", "qr"),
          client.from("visits").select("*", { count: "exact", head: true }).eq("src", "share"),
        ]);
        vTotal = vt.count || 0; vToday = vd.count || 0; vQr = vqr.count || 0; vShare = vshare.count || 0;
      }
      if (!ve && vr) {
        const rows = vr.filter((r) => !r.is_admin);
        const adminExcluded = vr.length - rows.length;
        vTotal = rows.length;
        vToday = rows.filter((r) => r.created_at >= dayStart).length;
        vQr = rows.filter((r) => r.src === "qr").length;
        vShare = rows.filter((r) => r.src === "share").length;
        // 재방문율: 방문자ID(vid)가 2회 이상 기록된 기기 비율
        const byVid = {};
        rows.forEach((r) => { if (r.vid) byVid[r.vid] = (byVid[r.vid] || 0) + 1; });
        const uniq = Object.keys(byVid).length;
        const returning = Object.values(byVid).filter((n) => n >= 2).length;
        // 평균 체류: 각 방문의 dur를 상한(cap)으로 자른 뒤 평균
        const durs = rows.map((r) => r.dur).filter((d) => d > 0).map((d) => Math.min(d, cap));
        const avgDwell = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0;
        // 구독자별 관심도: 인증(phone)된 방문을 구독자에 연결
        const byPhone = {};
        rows.forEach((r) => {
          if (r.phone) (phoneVisitTimes[r.phone] = phoneVisitTimes[r.phone] || []).push(new Date(r.created_at).getTime());
        });
        rows.forEach((r) => {
          if (!r.phone) return;
          const p = byPhone[r.phone] || (byPhone[r.phone] = { visits: 0, dur: 0, last: null });
          p.visits += 1;
          if (r.dur > 0) p.dur += Math.min(r.dur, cap);
          if (!p.last || r.created_at > p.last) p.last = r.created_at;
        });
        const engagement = list
          .filter((s) => s.approved && byPhone[s.phone_digits])
          .map((s) => {
            const p = byPhone[s.phone_digits];
            return { id: s.id, name: s.name, chon: parseInt(s.chon, 10) || 4, visits: p.visits, totalDur: p.dur, avgDur: Math.round(p.dur / Math.max(1, p.visits)), lastAt: p.last };
          })
          .sort((a, b) => (b.visits * 60 + b.totalDur) - (a.visits * 60 + a.totalDur));
        marketing = {
          enabled: true, cap,
          uniqueVisitors: uniq,
          returningRate: uniq ? Math.round((returning / uniq) * 1000) / 10 : 0,
          returningCount: returning,
          avgDwell, dwellSamples: durs.length,
          adminExcluded,
          engagement,
        };
      }
    }
    // ★ v49: 문자 발송 내역 (최근 30건). 테이블이 아직 없으면 안내 플래그만.
    let smsLogs = [];
    let smsLogTableMissing = false;
    {
      const { data: lg, error: lgErr } = await client.from("sms_log").select("*").order("created_at", { ascending: false }).limit(30);
      if (lgErr) smsLogTableMissing = true;
      else smsLogs = lg || [];
    }
    // ★ v62: 추천 현황
    let referrals = [];
    let referralsTableMissing = false;
    {
      const { data: rf, error: re } = await client.from("referrals").select("*").order("id", { ascending: false }).limit(200);
      if (re) referralsTableMissing = true;
      else referrals = rf || [];
    }
    // ★ v61: 구독자별 문자 지표 — 전부 자동. sent(보낸 수) + reacted(문자 받고 48시간 내 사이트 방문한 수)
    let smsStats = {};
    let smsEventsTableMissing = false;
    {
      const { data: ev, error: ee } = await client.from("sms_events").select("sub_id,kind,created_at").order("id", { ascending: false }).limit(5000);
      if (ee) smsEventsTableMissing = true;
      else {
        const digitsById = {};
        list.forEach((x) => { digitsById[x.id] = x.phone_digits; });
        (ev || []).forEach((r) => {
          if (r.kind !== "sent") return; // 과거 reply 행은 무시
          const st = smsStats[r.sub_id] || (smsStats[r.sub_id] = { sent: 0, reacted: 0 });
          st.sent += 1;
          const t0 = new Date(r.created_at).getTime();
          const vts = phoneVisitTimes[digitsById[r.sub_id]] || [];
          if (vts.some((t) => t >= t0 && t <= t0 + 48 * 3600 * 1000)) st.reacted += 1;
        });
      }
    }
    // ★ v54: 만남 기록 (최근 100건 + 전체 횟수)
    let meetings = [];
    let meetCounts = {};
    let meetingsTableMissing = false;
    {
      // ★ v57 최적화: 만남 1회 조회로 최근목록+횟수 동시 계산
      const { data: mr, error: me } = await client.from("meetings").select("id,sub_id,met_on,note").order("met_on", { ascending: false }).order("id", { ascending: false }).limit(1000);
      if (me) meetingsTableMissing = true;
      else {
        (mr || []).forEach((r) => { meetCounts[r.sub_id] = (meetCounts[r.sub_id] || 0) + 1; });
        meetings = (mr || []).slice(0, 100);
      }
    }
    const total = vTotal;
    const qr = vQr;
    const share = vShare;
    return NextResponse.json({
      visitsTotal: total,
      visitsToday: vToday,
      srcQr: qr,
      srcShare: share,
      srcDirect: Math.max(0, total - qr - share),
      subsTotal: list.length,
      subsToday: list.filter((s) => s.created_at >= dayStart).length,
      pending: list.filter((s) => !s.approved).length,
      subscribers: list,
      notes: notes.data || [],
      config: mergeConfig(cfgRow?.data),
      configUpdatedAt: cfgRow?.updated_at || null,
      configId: cfgRow?.id || null,
      configV: cfgRow?.v ?? null,
      configVia: cfgRow?.via || null,
      configReadError: cfgRow?.readError || null,
      smsReady: !!(process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET && process.env.SOLAPI_SENDER),
      smsLogs: smsLogs || [],
      smsLogTableMissing,
      marketing,
      meetings,
      meetCounts,
      meetingsTableMissing,
      smsStats,
      smsEventsTableMissing,
      referrals,
      referralsTableMissing,
    });
  } catch (e) {
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const b = await req.json();
    if (!authed(b.key)) return NextResponse.json({ error: "denied" }, { status: 401 });
    const client = sb();

    // 사이트 설정 저장
    if (b.action === "saveconfig") {
      // ★ v33 저널 저장: 덮어쓰기 대신 새 버전 행 추가 — 과거 데이터가 최신 저장을 이길 수 없음
      // 충돌 방지: 이 탭이 본 버전 번호(baseId)와 현재 최신 번호가 다르면 차단
      const latest = await readLatestConfig(client);
      // ★ v36: 충돌 판정은 사람이 읽는 버전 번호(#101, #102…)로 통일
      if (!b.force && b.baseV != null && latest?.v != null && Number(latest.v) !== Number(b.baseV)) {
        return NextResponse.json({ error: "conflict", at: latest.updated_at, v: latest.v });
      }
      const clean = mergeConfig(b.data || {});
      const { check, error, warn } = await writeNewConfig(client, clean, latest?.v);
      if (error) return NextResponse.json({ error: "db", detail: error.message }, { status: 500 });
      // 방금 추가된 버전 행을 재조회해 그대로 반환 (프론트가 대조 검증)
      return NextResponse.json({ ok: true, saved: check?.data || null, at: check?.updated_at || null, id: check?.id || null, v: check?.v || null, warn: warn || null });
    }

    // 패치노트 등록
    if (b.action === "addnote") {
      const version = String(b.version || "").trim().slice(0, 20);
      if (version === "__config__") return NextResponse.json({ error: "invalid" }, { status: 400 });
      const content = String(b.content || "").trim().slice(0, 200);
      if (!version || !content) return NextResponse.json({ error: "invalid" }, { status: 400 });
      const { error } = await client.from("patchnotes").insert({ version, content });
      if (error) return NextResponse.json({ error: "db" }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // 패치노트 삭제
    if (b.action === "delnote") {
      await client.from("patchnotes").delete().eq("id", b.id);
      return NextResponse.json({ ok: true });
    }

    // ★ v43: 테스트 문자 1건 발송 — 연동 확인용, 솔라피의 응답 원문 일부를 그대로 보여줌
    if (b.action === "testsms") {
      const to = String(b.to || "").replace(/\D/g, "");
      if (to.length < 10) return NextResponse.json({ error: "invalid" }, { status: 400 });
      const r = await sendSMS(to, String(b.text || "[전성훈 상태창] 문자 연동 테스트입니다."));
      if (r.skipped) return NextResponse.json({ error: "no_sms" });
      let detail = "";
      try {
        const g = r.data?.groupInfo?.count || {};
        detail = "등록 " + (g.total ?? "?") + "건";
        const failed = (r.data?.failedMessageList || []);
        if (failed.length) detail += " · 실패: " + (failed[0].statusMessage || failed[0].statusCode || "원인미상");
      } catch (e) {}
      await logSms(client, { kind: "test", to_count: 1, targets: "…" + to.slice(-4), body: String(b.text || "[전성훈 상태창] 문자 연동 테스트입니다."), ok: !!r.ok, detail: smsDetail(r) });
      return NextResponse.json({ ok: !!r.ok, detail, raw: r.ok ? undefined : JSON.stringify(r.data || r.error || "").slice(0, 300) });
    }

    // ★ v62: 추천 쿠폰 지급 완료 표시
    if (b.action === "ref_paid") {
      const { error } = await client.from("referrals").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", b.id);
      if (error) return NextResponse.json({ error: "db" }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    // ★ v62: 추천인 수동 연결 (이름으로만 입력된 경우 어드민이 확정)
    if (b.action === "ref_link") {
      const referrerId = parseInt(b.referrer_id, 10);
      const refereeId = parseInt(b.referee_id, 10);
      if (!referrerId || !refereeId || referrerId === refereeId) return NextResponse.json({ error: "invalid" }, { status: 400 });
      const { data: exist } = await client.from("referrals").select("id").eq("referee_id", refereeId).limit(1);
      if (exist && exist.length) return NextResponse.json({ error: "dup" });
      const { error } = await client.from("referrals").insert({ referrer_id: referrerId, referee_id: refereeId });
      if (error) return NextResponse.json({ error: "db" }, { status: 500 });
      await client.from("subscribers").update({ referrer_id: referrerId }).eq("id", refereeId);
      return NextResponse.json({ ok: true });
    }

    // ★ v54: 만남 기록 추가 — 몇 번째 만남인지 자동 계산해서 반환
    if (b.action === "meet_add") {
      const subId = parseInt(b.sub_id, 10);
      if (!subId) return NextResponse.json({ error: "invalid" }, { status: 400 });
      let metOn = String(b.met_on || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(metOn)) metOn = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // 오늘(KST)
      const note = String(b.note || "").trim().slice(0, 200) || null;
      const { error } = await client.from("meetings").insert({ sub_id: subId, met_on: metOn, note });
      if (error) return NextResponse.json({ error: "db", detail: String(error.message || "").slice(0, 120) }, { status: 500 });
      const { count } = await client.from("meetings").select("*", { count: "exact", head: true }).eq("sub_id", subId);
      return NextResponse.json({ ok: true, nth: count || 1 });
    }
    // ★ v54: 만남 메모 수정
    if (b.action === "meet_note") {
      const { error } = await client.from("meetings").update({ note: String(b.note || "").trim().slice(0, 200) || null }).eq("id", b.id);
      if (error) return NextResponse.json({ error: "db" }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    // ★ v54: 만남 기록 삭제
    if (b.action === "meet_del") {
      const { error } = await client.from("meetings").delete().eq("id", b.id);
      if (error) return NextResponse.json({ error: "db" }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // 구독자 삭제
    if (b.action === "delsub") {
      const { error } = await client.from("subscribers").delete().eq("id", b.id);
      if (error) return NextResponse.json({ error: "db" }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // ★ v44 단체 문자: 촌수 선택 + [이름] 자동 치환 + 링크·구독취소 자동 첨부
    if (b.action === "broadcast") {
      const text = String(b.text || "").trim();
      if (!text) return NextResponse.json({ error: "invalid" }, { status: 400 });
      const chons = Array.isArray(b.chons) && b.chons.length ? b.chons.map((n) => parseInt(n, 10)) : [1, 2, 3, 4];
      const { data } = await client.from("subscribers").select("id,name,phone_digits,chon,approved");
      // ★ v54: ids가 오면 그 사람들에게만(후속 문자 — 대기중이어도 발송 가능), 아니면 기존 촌수 기준
      const targets = Array.isArray(b.ids) && b.ids.length
        ? (data || []).filter((s) => b.ids.includes(s.id))
        : (data || []).filter((s) => isApproved(s.approved) && chons.includes(parseInt(s.chon, 10) || 4));
      if (targets.length === 0) return NextResponse.json({ error: "no_target" });
      // ★ v54: [횟수] 치환용 만남 카운트
      let mCounts = {};
      if (text.includes("[횟수]")) {
        const { data: mm } = await client.from("meetings").select("sub_id");
        (mm || []).forEach((r) => { mCounts[r.sub_id] = (mCounts[r.sub_id] || 0) + 1; });
      }
      // ★ v48 예약 발송: b.at = "YYYY-MM-DDTHH:mm" (한국시간). 현재+1분 이후만 허용.
      let scheduledDate = null;
      if (b.at) {
        const at = String(b.at).trim();
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at)) return NextResponse.json({ error: "bad_time" });
        scheduledDate = at + ":00+09:00"; // 한국시간으로 고정
        const when = new Date(scheduledDate).getTime();
        if (!when || when < Date.now() + 60 * 1000) return NextResponse.json({ error: "bad_time" });
      }
      const messages = targets.map((t) => {
        let msg = text.replace(/\[이름\]/g, t.name || "구독자");
        msg = msg.replace(/\[횟수\]/g, mCounts[t.id] ? mCounts[t.id] + "번째" : "이번");
        // ★ v50: 링크를 라벨과 함께 명확히 분리해서 첨부
        if (!msg.includes("sunghoon-nine.vercel.app")) msg += "\n\n사이트방문:\n" + SITE;
        msg += "\n\n구독 취소:\n" + SITE + "/bye?p=" + t.phone_digits + "&t=" + unsubToken(t.phone_digits);
        return { to: t.phone_digits, text: msg };
      });
      const r = await sendSMS(messages, "", scheduledDate ? { scheduledDate } : {});
      if (r.skipped) return NextResponse.json({ error: "no_sms" });
      const manual = Array.isArray(b.ids) && b.ids.length;
      await logSms(client, {
        kind: manual ? (b.src === "broadcast" ? "broadcast" : "followup") : "broadcast",
        to_count: targets.length,
        targets: (manual ? (b.src === "broadcast" ? "직접 지정 " : "후속 ") : chons.slice().sort().join("·") + "촌 ") + targets.length + "명",
        body: text,
        scheduled_at: b.at || null,
        ok: !!r.ok,
        detail: smsDetail(r),
      });
      if (!r.ok) {
        let detail = "";
        try {
          const failed = (r.data?.failedMessageList || []);
          if (failed.length) detail = failed[0].statusMessage || failed[0].statusCode || "";
        } catch (e) {}
        return NextResponse.json({ ok: false, detail, raw: JSON.stringify(r.data || r.error || "").slice(0, 300) });
      }
      await logSentEvents(client, targets.map((t) => t.id));
      return NextResponse.json({ ok: true, count: r.count, scheduled: scheduledDate ? b.at : null });
    }

    // 구독자 촌수/승인 수정 (기본)
    const { data: before } = await client
      .from("subscribers")
      .select("approved,phone,name")
      .eq("id", b.id)
      .single();
    const patch = {};
    if (b.chon) patch.chon = parseInt(b.chon, 10);
    if (typeof b.approved === "boolean") patch.approved = b.approved;
    // ★ 구독자 표시 정보 수정 (이름·직업·한줄소개) — 사이트 인맥 칸에 그대로 노출되는 값
    if (typeof b.name === "string") patch.name = b.name.trim().slice(0, 20);
    if (typeof b.job === "string") patch.job = b.job.trim().slice(0, 10);
    if (typeof b.intro === "string") patch.intro = b.intro.trim().slice(0, 20);
    if (typeof b.icon === "string") patch.icon = b.icon.trim().slice(0, 4);
    // ★ v52: 생일(MM-DD)·카테고리 수동 지정
    if (typeof b.birthday === "string") {
      let d = b.birthday.replace(/\D/g, "");
      if (d.length === 8) d = d.slice(4);
      if (d.length === 3) d = "0" + d;
      if (d.length === 4) {
        const m = parseInt(d.slice(0, 2), 10), day = parseInt(d.slice(2), 10);
        if (m >= 1 && m <= 12 && day >= 1 && day <= 31) patch.birthday = d.slice(0, 2) + "-" + d.slice(2);
      } else if (d.length === 0) patch.birthday = null;
    }
    if (typeof b.cat === "string") patch.cat = b.cat.trim() || null;
    let { error } = await client.from("subscribers").update(patch).eq("id", b.id);
    if (error && ("birthday" in patch || "cat" in patch)) { // 새 컬럼 SQL 미실행 디비 폴백
      const { birthday, cat, ...rest } = patch;
      if (Object.keys(rest).length) ({ error } = await client.from("subscribers").update(rest).eq("id", b.id));
    }
    if (error) return NextResponse.json({ error: "db" }, { status: 500 });
    // ★ v39: 방금 기록된 행을 다시 읽어 그대로 반환 (프론트가 대조 검증)
    const { data: after } = await client.from("subscribers").select("*").eq("id", b.id).single();

    // 대기 → 승인으로 바뀐 순간, 환영 문자 자동 발송
    let sms = null;
    let refBonus = false;
    if (before && !isApproved(before.approved) && patch.approved === true) {
      // ★ v62: 추천 링크로 온 구독자면 → 추천 확정 + 추천인/사장님에게 자동 알림
      try {
        if (after && after.referrer_id) {
          const { data: exist } = await client.from("referrals").select("id").eq("referee_id", b.id).limit(1);
          if (!exist || !exist.length) {
            const { error: rerr } = await client.from("referrals").insert({ referrer_id: after.referrer_id, referee_id: b.id });
            if (!rerr) {
              refBonus = true;
              const { data: refr } = await client.from("subscribers").select("name,phone").eq("id", after.referrer_id).single();
              if (refr) {
                const rdg = String(refr.phone || "").replace(/\D/g, "");
                // 추천인에게: 쿠폰 예고
                if (rdg.length >= 10) await sendSMS(rdg, `${refr.name}님, 추천해주신 ${before.name}님의 등록이 완료됐어요! 감사의 의미로 BHC 치킨 기프티콘을 곧 보내드릴게요 🍗\n- 전성훈 드림`);
                // 사장님(발신번호)에게: 지급 대상 알림
                const owner = String(process.env.SOLAPI_SENDER || "").replace(/\D/g, "");
                if (owner.length >= 10) await sendSMS(owner, `🎁 [추천 성공] ${refr.name}님이 ${before.name}님 추천 → 치킨 쿠폰 지급 대상! 어드민 → 🎁 추천 현황에서 확인`);
              }
            }
          }
        }
      } catch (e) {}
      const dg = String(before.phone || "").replace(/\D/g, "");
      // ★ v57: 환영 문자 멘트를 어드민 설정에서 읽음 (단체문자 카드에서 수정 가능)
      let wt = mergeConfig(null).welcomeSms;
      try {
        const cRow = await readLatestConfig(client);
        const merged = mergeConfig(cRow?.data);
        if (merged.welcomeSms && merged.welcomeSms.trim()) wt = merged.welcomeSms;
      } catch (e) {}
      let wmsg = wt.replace(/\[이름\]/g, before.name || "구독자");
      if (!wmsg.includes("sunghoon-nine.vercel.app")) wmsg += "\n\n사이트방문:\n" + SITE;
      wmsg += "\n\n구독 취소:\n" + SITE + "/bye?p=" + dg + "&t=" + unsubToken(dg);
      sms = await sendSMS(dg, wmsg);
      if (!sms.skipped) {
        await logSms(client, { kind: "welcome", to_count: 1, targets: (before.name || "") + " …" + dg.slice(-4), body: "환영 문자 (등록 완료 안내)", ok: !!sms.ok, detail: smsDetail(sms) });
        if (sms.ok) await logSentEvents(client, [b.id]);
      }
    }
    return NextResponse.json({ ok: true, smsSent: sms ? !sms.skipped : false, refBonus, row: after ? { id: after.id, chon: parseInt(after.chon, 10) || 4, approved: isApproved(after.approved), name: after.name || "", job: after.job || "", intro: after.intro || "" } : null });
  } catch (e) {
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
