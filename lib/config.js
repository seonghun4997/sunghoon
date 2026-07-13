// 사이트 콘텐츠 기본값 — 어드민에서 수정하면 site_config(디비)가 우선 적용됨

// 빌드 버전 — 배포가 실제로 반영됐는지 확인용 (사이트 하단·어드민·/api/health에 표시됨)
// ⚠️ 코드를 수정해서 새로 배포할 때마다 이 숫자를 올려주세요
export const BUILD = "v64";

// ★ v52: 인맥 카테고리 6종 (3×2 그리드) — 어떤 직업도 누락되지 않게 마지막은 만능(기타)
export const NET_CATS = [
  { id: "biz",    icon: "💼", name: "비즈니스·마케팅", kw: ["마케", "커머스", "이커머스", "대표", "세일즈", "영업", "사업", "브랜드", "쇼핑", "MD", "유통", "무역", "창업"] },
  { id: "fin",    icon: "💰", name: "금융·법률",       kw: ["세무", "회계", "변호", "법무", "노무", "투자", "금융", "은행", "보험", "자산", "재무", "펀드", "감정평가"] },
  { id: "med",    icon: "🩺", name: "의료·건강",       kw: ["의사", "한의", "약사", "간호", "요양", "병원", "헬스", "트레이너", "치료", "재활", "수의", "영양"] },
  { id: "it",     icon: "💻", name: "IT·크리에이티브", kw: ["개발", "디자", "크리에이터", "작가", "유튜", "PD", "엔지니어", "데이터", "AI", "프로그래", "영상", "사진", "콘텐츠", "기획"] },
  { id: "estate", icon: "🏠", name: "부동산·건설",     kw: ["부동산", "건물", "분양", "중개", "시공", "건설", "인테리어", "임대", "건축", "토목"] },
  { id: "etc",    icon: "🌟", name: "기타 전문가",     kw: [] },
];

// 직업+소개 텍스트로 자동 분류 (수동 지정값이 있으면 그게 우선)
export function autoCat(job, desc) {
  const t = String(job || "") + " " + String(desc || "");
  for (const c of NET_CATS) {
    if (c.kw.some((k) => t.includes(k))) return c.id;
  }
  return "etc";
}

// 공식 주소 — 이 주소의 어드민에서만 저장이 허용됨 (중복 배포 사고 방지)
export const CANONICAL_HOST = "sunghoon-nine.vercel.app";

export const SECTION_LABELS = {
  encounter: "인카운터 (야생의 전성훈)",
  hero: "상태창 (프로필)",
  info: "기본 정보",
  stat: "스텟",
  biz: "사업",
  notes: "패치노트",
  posts: "글",
  network: "네트워킹",
  subscribe: "구독",
  catch: "포획 & 커피챗",
};

export const DEFAULT_CONFIG = {
  order: ["encounter", "hero", "info", "stat", "biz", "notes", "posts", "network", "subscribe", "catch"],
  hidden: [],
  hp: { v: 13, cap: "툭 치면 과로사 직전" },
  mp: { v: 100, cap: "아이디어 — 무한 리젠" },
  texts: {
    dialog: "앗! 야생의 전성훈(이)가 나타났다!!",
    titleChip: "",  // 칭호 기능 제거됨 (v31)
    name: "전성훈",
    subtitle: "레벨업 중인 창업가",
    tagline: "혼자 사업 8개 굴리는 중",
    level: "LV.25",
    bizTitle: "운영중인 사업 8개",
    bizDesc: "솔직히 관리 잘 안 되는 것도 많습니다.",
    bizNote: "🔒 지금 보고 계신 화면은 공개(구독 전) 기준입니다",
    netDesc: "해당 칸은 구독자간 네트워킹 목적으로 만들어졌습니다. 이름은 전원 비공개처리하여 개인정보를 보호합니다.",
    subTitle: "📡 구독하고 소식 받기",
    subDesc: "새 사업 소식과 네트워킹 업데이트를 문자로 보내드립니다. 신청 후 구독자로 등록됩니다.",
    ctaLine: "야생에서 뛰어다니고 있는",
    ctaVerbBefore: "만나셨나요?",
    ctaVerbAfter: "잡으셨네요",
    ctaWelcome: "네트워킹 소개 / 비즈니스 협업 언제든 환영합니다",
    ctaMeeting: "혼자 이것저것 다 하다 보니 바쁜 편이라\n사무실로 오시는 커피챗을 먼저 제안해주시면 감사하겠습니다",
    ctaLocation: "📍 사무실 — 혜화역 도보 5분",
    catchHint: "야생의 전성훈은 도망가지 않습니다.",
    caughtLine: "신난다! 전성훈(이)를 잡았다!!",
    lockBizTitle: "사업 상세는 구독자부터",
    lockBizDesc: "매출·구조 등 자세한 이야기는 구독자에게만 공개합니다. 구독하면 소식으로 받아보실 수 있어요.",
    lockNetTitle: "소개는 구독자부터",
    lockNetDesc: "네트워킹 소개 요청은 구독 후 가능합니다. 구독하면 소개 요청 방법을 안내드립니다.",
    lockBtn: "📡 구독하고 열기",
    netEmpty: "빈 슬롯 — 현재 모집중",
    // ★ v42 등급별 공개
    bizGateDesc: "운영 사업 목록은 구독자부터 공개됩니다.",
    netGateDesc: "네트워킹 목록은 구독자부터 공개됩니다.",
    gateSubBtn: "📡 구독하고 열기",
    gateUnlockBtn: "🔓 이미 구독자예요 — 번호로 열기",
    unlockTitle: "구독자 인증",
    unlockDesc: "구독 신청하실 때 등록한 전화번호를 입력해주세요. 등록된 번호면 잠긴 칸이 열립니다.",
    unlockFail: "등록된 구독자 번호가 아니에요. 신청하셨다면 등록 완료 문자를 받은 뒤 다시 시도해주세요.",
    lockBiz3Title: "사업 상세는 가까운 사이부터",
    lockBiz3Desc: "각 사업의 구체적인 내용은 사적으로 3회 이상 만난 분들에게 공개됩니다. 만나서 이야기 나눠요!",
    lockNet3Title: "소개 신청은 가까운 사이부터",
    lockNet3Desc: "네트워킹 소개 신청은 사적으로 3회 이상 만난 분들부터 가능합니다. 먼저 커피챗을 제안해주세요!",
    introReqTitle: "소개받기 신청",
    introReqDesc: "어떤 분을, 어떤 목적으로 만나고 싶은지 문자로 보내주시면 확인 후 연결해드립니다.",
    introPhone: "010-3953-4997",
    coffeeBtn: "☕ 커피챗 제안하기",
    coffeeSms: "[커피챗 제안]\n이름:\n하는 일:\n가능한 요일·시간대:\n나누고 싶은 이야기:",
    postsTitle: "글",
    postsDesc: "",
    net4Empty: "구독하면 이 자리에 등록됩니다",
    // ★ v51: 사이트에 보여줄 인맥 2단계 라벨 (내부 촌수 분류는 어드민 전용)
    tierCloseName: "가까운 사이",
    tierCloseRule: "사적으로 3회 이상 만난 사람",
    tierSubName: "구독자",
    tierSubRule: "구독 신청한 사람",
  },
  info: [
    { k: "출생", v: "2002년생 (25)" },
    { k: "MBTI", v: "INTP" },
    { k: "학력", v: "국민대학교 휴학중" },
    { k: "취미", v: "맛집탐방 · 서울근교 드라이브 · 인테리어 · 일본여행 · 외국어공부" },
    { k: "거점", v: "서울 성북동" },
    { k: "연락처", v: "010-3953-4997\n전화보다는 문자를 선호합니다." },
  ],
  stats: [
    { name: "사업아이디어", v: 10 },
    { name: "실행력", v: 9 },
    { name: "마케팅", v: 8 },
    { name: "제조", v: 6 },
    { name: "개발", v: 6 },
    { name: "인사", v: 4 },
    { name: "영업", v: 2 },
    { name: "조직화", v: 2 },
  ],
  biz: [
    { icon: "💪", name: "헬스케어 브랜드", tag: "이커머스 · 3개 · 2024년~", stage: "고도화",
      desc: "· 10대 청소년 브랜드\n· 동양 특허 원료 기반 건기식 브랜드\n· 쿠팡·스마트스토어 전용 건기식 브랜드" },
    { icon: "💄", name: "뷰티 브랜드", tag: "이커머스 · 1개 · 2025년~", stage: "고도화",
      desc: "서양 특허 원료 기반 건기식/뷰티 브랜드" },
    { icon: "📞", name: "분양 DB 납품 실행사", tag: "마케팅 · 1개 · 26.05~", stage: "초기",
      desc: "오피스텔 분양 시 현장 고객을 모으고, DB를 분양상담사에게 납품" },
    { icon: "🏠", name: "부동산 매물 홍보 플랫폼", tag: "플랫폼 · 1개 · 26.06~", stage: "초기",
      desc: "독특한 매물만 홍보해주는 플랫폼" },
    { icon: "📚", name: "교육 플랫폼", tag: "이커머스 · 1개 · 26.06~", stage: "초기",
      desc: "이커머스 전자책 판매 플랫폼" },
    { icon: "🔮", name: "AI 사주 플랫폼", tag: "플랫폼 · 1개 · 26.07~", stage: "초기",
      desc: "소개팅과 사주를 결합한 신개념 AI 기반 사주 플랫폼" },
  ],
  // ★ v57: 승인 시 자동 발송되는 환영 문자 — [이름] 치환, 사이트/구독취소 링크는 자동 첨부
  welcomeSms: "[이름]님, 전성훈 상태창 사이트 구독 승인이 완료됐습니다!\n지금 사이트를 방문하시면 저의 사업 근황과 네트워킹을 구경할 수 있어요.",
  // ★ v54: 후속 문자 템플릿 — [이름]/[횟수] 자동 치환. 어드민에서 수정·추가 가능
  smsTemplates: [
    { name: "첫 만남 후", text: "[이름]님, 오늘 만나뵙게 되어 정말 즐거웠습니다! 제가 아직 사회 경험이 부족해서 혹시 실수했거나 기분 상하게 해드린 부분이 있었다면 너그러이 양해 부탁드립니다 🙏 다음에 또 좋은 자리에서 뵙고 싶어요." },
    { name: "재만남 후", text: "[이름]님, 오늘도 귀한 시간 내주셔서 감사합니다! 벌써 [횟수] 만남인데, 뵐 때마다 배우는 게 많습니다. 다음에 또 편하게 뵈어요 😊" },
    { name: "커피챗 후", text: "[이름]님, 오늘 커피챗 정말 유익했습니다! 나눠주신 이야기 잘 새겨듣겠습니다. 제가 도움드릴 일 있으면 언제든 편하게 연락주세요." },
    { name: "빈 양식", text: "[이름]님, " },
  ],
  // 자유 글 — 어드민에서 작성, 사이트에 접었다 펴는 카드로 표시
  posts: [],
  // 인맥 — 촌수별 기준 멘트와 고정 표시 인물 (승인 구독자는 촌수에 맞춰 자동 추가됨)
  network: [
    { chon: 1, rule: "사적으로 9회 이상 만난 사람", people: [
      { icon: "🛒", job: "커머스 마케터", desc: "연매출 1,200억 커머스" },
      { icon: "🛒", job: "커머스 마케터", desc: "연매출 1,000억 커머스" },
    ] },
    { chon: 2, rule: "사적으로 6회 이상 만난 사람", people: [] },
    { chon: 3, rule: "사적으로 3회 이상 만났거나, 1촌과 연결된 사람", people: [
      { icon: "🍜", job: "F&B 대표", desc: "엑싯 2회" },
      { icon: "🧾", job: "세무사", desc: "세무대 출신" },
      { icon: "⚖️", job: "변호사", desc: "서울대 출신" },
    ] },
    { chon: 4, rule: "사적으로 1~3회 만났거나, 구독 신청한 사람", people: [] },
  ],
};

// 옛날 기본 문구가 디비에 저장돼 있으면 새 기본 문구로 자동 교체 (직접 수정한 문구는 그대로 유지)
const LEGACY_TEXTS = {
  netDesc: [
    "촌수는 사적으로 만난 횟수 기준의 분류일 뿐, 실제 친분의 깊이와는 무관합니다. 이름은 전원 비공개입니다.",
    "해당 칸은 구독자간 네트워킹 목적으로 만들어졌으며, 촌수는 만난 횟수 기준의 분류일 뿐, 실제 친분의 깊이와는 무관합니다. 이름은 전원 비공개입니다.",
    "해당 칸은 구독자간 네트워킹 목적으로 만들어졌습니다. 촌수는 만난 횟수 기준의 분류일 뿐, 실제 친분의 깊이와는 무관합니다. 이름은 전원 비공개처리하여 개인정보를 보호합니다.",
  ],
  ctaMeeting: [
    "혼자 이것저것 다 하다 보니 바쁜 편이라\n내방 미팅을 먼저 제안해주시면 감사하겠습니다",
  ],
  subDesc: [
    "새 사업 소식과 인맥 업데이트를 문자로 보내드립니다. 신청 후 승인되면 4촌에 등록됩니다.",
    "새 사업 소식과 인맥 업데이트를 문자로 보내드립니다. 신청하면 바로 4촌으로 등록됩니다.",
    "새 사업 소식과 인맥 업데이트를 문자로 보내드립니다. 신청 후 4촌으로 등록됩니다.",
    "새 사업 소식과 인맥 업데이트를 문자로 보내드립니다. 신청 후 구독자로 등록됩니다.",
  ],
  net4Empty: [
    "승인된 구독자가 표시되는 자리입니다",
    "구독하면 바로 이 자리에 등록됩니다",
  ],
  unlockFail: [
    "승인된 구독자 번호가 아니에요. 아직 대기중이거나, 구독 전이라면 먼저 구독을 신청해주세요.",
    "구독된 번호가 아니에요. 아직 구독 전이라면 먼저 구독해주세요 — 신청 즉시 열립니다.",
  ],
  ctaWelcome: ["인맥 소개 / 비즈니스 협업 언제든 환영합니다"],
  subtitle: ["은둔형 연쇄창업가"],
  // ★ v51: 촌수 노출 제거 — 옛 기본 문구들
  bizNote: ["🔒 지금 보고 계신 화면은 4촌(공개) 기준입니다"],
  subTitle: ["📡 구독하면 4촌으로 등록됩니다"],
  lockBizTitle: ["사업 상세는 4촌부터"],
  lockBizDesc: ["매출·구조 등 자세한 이야기는 구독자(4촌)에게만 공개합니다. 구독하면 소식으로 받아보실 수 있어요."],
  lockNetTitle: ["소개는 4촌부터"],
  lockNetDesc: ["인맥 소개 요청은 구독(4촌 등록) 후 가능합니다. 구독하면 소개 요청 방법을 안내드립니다.", "인맥 소개 요청은 구독 후 가능합니다. 구독하면 소개 요청 방법을 안내드립니다."],
  lockBtn: ["📡 구독하고 4촌 되기"],
  bizGateDesc: ["운영 사업 목록은 구독자(4촌)부터 공개됩니다."],
  netGateDesc: ["인맥도는 구독자(4촌)부터 공개됩니다.", "인맥도는 구독자부터 공개됩니다."],
  gateSubBtn: ["📡 구독하고 4촌 되기"],
  unlockDesc: ["구독 신청하실 때 등록한 전화번호를 입력해주세요. 승인된 번호면 내 촌수 등급에 맞게 열립니다."],
  lockBiz3Title: ["사업 상세는 3촌부터"],
  lockBiz3Desc: ["각 사업의 구체적인 내용은 3촌(사적으로 3회 이상 만난 사이)부터 공개됩니다. 만나서 이야기 나눠요!"],
  lockNet3Title: ["소개 신청은 3촌부터"],
  lockNet3Desc: ["인맥 소개 신청은 3촌(사적으로 3회 이상 만난 사이)부터 가능합니다. 먼저 커피챗을 제안해주세요!", "인맥 소개 신청은 3촌(사적으로 3회 이상 만난 사이)부터 가능합니다. 먼저 미팅을 제안해주세요!", "인맥 소개 신청은 사적으로 3회 이상 만난 분들부터 가능합니다. 먼저 커피챗을 제안해주세요!"],
};

// 저장된 설정과 기본값 병합 (누락 키가 있어도 안 깨지게)
export function mergeConfig(saved) {
  if (!saved || typeof saved !== "object") return DEFAULT_CONFIG;
  const savedTexts = { ...(saved.texts || {}) };
  for (const [k, olds] of Object.entries(LEGACY_TEXTS)) {
    if (olds.includes(savedTexts[k])) delete savedTexts[k]; // 옛 기본값이면 버리고 새 기본값 사용
  }
  return {
    order:
      Array.isArray(saved.order) && saved.order.length > 0
        ? [...saved.order.filter((k) => DEFAULT_CONFIG.order.includes(k)),
           ...DEFAULT_CONFIG.order.filter((k) => !saved.order.includes(k))]
        : DEFAULT_CONFIG.order,
    hidden: Array.isArray(saved.hidden) ? saved.hidden : [],
    texts: { ...DEFAULT_CONFIG.texts, ...savedTexts },
    hp: { ...DEFAULT_CONFIG.hp, ...(saved.hp || {}) },
    mp: { ...DEFAULT_CONFIG.mp, ...(saved.mp || {}) },
    info: Array.isArray(saved.info) ? saved.info : DEFAULT_CONFIG.info,
    stats: Array.isArray(saved.stats) ? saved.stats : DEFAULT_CONFIG.stats,
    welcomeSms:
      typeof saved.welcomeSms === "string" && saved.welcomeSms.trim() &&
      saved.welcomeSms !== "[전성훈 상태창] [이름]님, 구독 등록이 완료됐습니다! 앞으로 사업·네트워킹 소식을 보내드릴게요." // 옛 기본값이면 새 기본값으로
        ? saved.welcomeSms
        : DEFAULT_CONFIG.welcomeSms,
    smsTemplates: Array.isArray(saved.smsTemplates)
      ? saved.smsTemplates.map((t) => ({ name: String(t?.name ?? ""), text: String(t?.text ?? "") })).filter((t) => t.name)
      : DEFAULT_CONFIG.smsTemplates,
    posts: Array.isArray(saved.posts)
      ? saved.posts.map((p) => ({
          title: String(p?.title ?? ""),
          date: String(p?.date ?? ""),
          body: String(p?.body ?? ""),
        }))
      : [],
    biz: Array.isArray(saved.biz)
      ? saved.biz.map((b) => {
          const d = DEFAULT_CONFIG.biz.find((x) => x.name === b?.name);
          return { ...b, desc: typeof b?.desc === "string" ? b.desc : (d?.desc || "") };
        })
      : DEFAULT_CONFIG.biz,
    // 인맥: 촌수(1~4)별로 병합 — 저장본이 깨져 있어도 기본값으로 자동 복구
    network: DEFAULT_CONFIG.network.map((d) => {
      const s = Array.isArray(saved.network)
        ? saved.network.find((g) => g && parseInt(g.chon, 10) === d.chon)
        : null;
      if (!s) return d;
      return {
        chon: d.chon,
        rule: typeof s.rule === "string" ? s.rule : d.rule,
        people: Array.isArray(s.people)
          ? s.people.map((p) => ({
              icon: String(p?.icon ?? "🙋"),
              job: String(p?.job ?? ""),
              desc: String(p?.desc ?? ""),
              cat: String(p?.cat ?? ""), // ★ v52: 수동 카테고리 (비면 자동분류)
            }))
          : d.people,
      };
    }),
  };
}

// 줄바꿈(\n) 텍스트 렌더 헬퍼용 분리
export function lines(t) {
  return String(t || "").split("\n");
}
