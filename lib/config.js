// 사이트 콘텐츠 기본값 — 어드민에서 수정하면 site_config(디비)가 우선 적용됨
export const SECTION_LABELS = {
  encounter: "인카운터 (야생의 전성훈)",
  hero: "상태창 (프로필)",
  info: "기본 정보",
  stat: "스텟",
  biz: "사업",
  notes: "패치노트",
  network: "인맥",
  subscribe: "구독",
  catch: "포획 & 미팅",
};

export const DEFAULT_CONFIG = {
  order: ["encounter", "hero", "info", "stat", "biz", "notes", "network", "subscribe", "catch"],
  hidden: [],
  hp: { v: 13, cap: "툭 치면 과로사 직전" },
  mp: { v: 100, cap: "아이디어 — 무한 리젠" },
  texts: {
    dialog: "앗! 야생의 전성훈(이)가 나타났다!!",
    titleChip: "«성북동의 은둔자»",
    name: "전성훈",
    subtitle: "은둔형 연쇄창업가",
    tagline: "혼자 사업 8개 굴리는 중",
    level: "LV.25",
    bizTitle: "운영중인 사업 8개",
    bizDesc: "솔직히 관리 잘 안 되는 것도 많습니다. 구체적인 내용이 궁금하시면 구독하기 버튼을 눌러주세요.",
    bizNote: "🔒 지금 보고 계신 화면은 4촌(공개) 기준입니다",
    netDesc: "촌수는 사적으로 만난 횟수 기준의 분류일 뿐, 실제 친분의 깊이와는 무관합니다. 이름은 전원 비공개입니다.",
    subTitle: "📡 구독하면 4촌으로 등록됩니다",
    subDesc: "새 사업 소식과 인맥 업데이트를 문자로 보내드립니다. 신청 후 승인되면 4촌에 등록됩니다.",
    ctaLine: "야생에서 뛰어다니고 있는",
    ctaVerbBefore: "만나셨나요?",
    ctaVerbAfter: "잡으셨네요",
    ctaWelcome: "인맥 소개 / 비즈니스 협업 언제든 환영합니다",
    ctaMeeting: "혼자 이것저것 다 하다 보니 바쁜 편이라\n내방 미팅을 먼저 제안해주시면 감사하겠습니다",
    ctaLocation: "📍 사무실 — 혜화역 도보 5분",
    catchHint: "야생의 전성훈은 도망가지 않습니다.",
    caughtLine: "신난다! 전성훈(이)를 잡았다!!",
    lockBizTitle: "사업 상세는 4촌부터",
    lockBizDesc: "매출·구조 등 자세한 이야기는 구독자(4촌)에게만 공개합니다. 구독하면 소식으로 받아보실 수 있어요.",
    lockNetTitle: "소개는 4촌부터",
    lockNetDesc: "인맥 소개 요청은 구독(4촌 등록) 후 가능합니다. 구독하면 소개 요청 방법을 안내드립니다.",
    lockBtn: "📡 구독하고 4촌 되기",
  },
  info: [
    { k: "출생", v: "2002년생 (25)" },
    { k: "MBTI", v: "INTP" },
    { k: "학력", v: "국민대학교 휴학중" },
    { k: "취미", v: "맛집탐방 · 서울근교 드라이브 · 인테리어 · 일본여행 · 외국어공부" },
    { k: "거점", v: "서울 성북동" },
    { k: "연락처", v: "010-3953-4997\n유선전화는 따로 안 받고 있습니다" },
  ],
  stats: [
    { name: "사업아이디어", v: 10 },
    { name: "실행력", v: 9 },
    { name: "마케팅", v: 8 },
    { name: "제조", v: 6 },
    { name: "개발", v: 6 },
    { name: "인사", v: 4 },
    { name: "영업", v: 2 },
  ],
  biz: [
    { icon: "💪", name: "헬스케어 브랜드", tag: "이커머스 · 3개 · 2024년~", stage: "고도화" },
    { icon: "💄", name: "뷰티 브랜드", tag: "이커머스 · 1개 · 2025년~", stage: "성장" },
    { icon: "📞", name: "분양 DB 납품 실행사", tag: "마케팅 · 1개 · 26.05~", stage: "초기" },
    { icon: "🏠", name: "부동산 매물 홍보 플랫폼", tag: "플랫폼 · 1개 · 26.06~", stage: "초기" },
    { icon: "📚", name: "교육 플랫폼", tag: "이커머스 · 1개 · 26.06~", stage: "초기" },
    { icon: "🔮", name: "AI 사주 플랫폼", tag: "플랫폼 · 1개 · 26.07~", stage: "초기" },
  ],
};

// 저장된 설정과 기본값 병합 (누락 키가 있어도 안 깨지게)
export function mergeConfig(saved) {
  if (!saved || typeof saved !== "object") return DEFAULT_CONFIG;
  return {
    order:
      Array.isArray(saved.order) && saved.order.length > 0
        ? [...saved.order.filter((k) => DEFAULT_CONFIG.order.includes(k)),
           ...DEFAULT_CONFIG.order.filter((k) => !saved.order.includes(k))]
        : DEFAULT_CONFIG.order,
    hidden: Array.isArray(saved.hidden) ? saved.hidden : [],
    texts: { ...DEFAULT_CONFIG.texts, ...(saved.texts || {}) },
    hp: { ...DEFAULT_CONFIG.hp, ...(saved.hp || {}) },
    mp: { ...DEFAULT_CONFIG.mp, ...(saved.mp || {}) },
    info: Array.isArray(saved.info) ? saved.info : DEFAULT_CONFIG.info,
    stats: Array.isArray(saved.stats) ? saved.stats : DEFAULT_CONFIG.stats,
    biz: Array.isArray(saved.biz) ? saved.biz : DEFAULT_CONFIG.biz,
  };
}

// 줄바꿈(\n) 텍스트 렌더 헬퍼용 분리
export function lines(t) {
  return String(t || "").split("\n");
}
