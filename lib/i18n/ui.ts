import type { Locale } from "@/lib/locales";

/**
 * UI chrome strings (CP4). First-party translated app copy — labels, buttons, section
 * headings — NOT user content. Per the fallback matrix these are "translated app strings"
 * that are always available in every served locale (never subject to the no-fallback
 * rules that govern listing content). KO present so Slice 2 needs no code change here.
 */
export interface UiStrings {
  browse: string;
  browseIntro: string;
  categoryIntro: (category: string, count: number) => string;
  viewDetails: string;
  skipToContent: string;
  home: string;
  languageLabel: string;
  open: string;
  closed: string;
  closesAt: (time: string) => string;
  opensAt: (time: string, day: string) => string;
  lastOrder: (time: string) => string;
  hoursUnknown: string;
  appointmentOnly: string;
  sellsOutEarly: string;
  today: string;
  tomorrow: string;
  weekdays: Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", string>;
  menu: string;
  menuComingSoon: (date: string) => string;
  ownerPick: string;
  hours: string;
  location: string;
  phone: string;
  directions: string;
  share: string;
  linkCopied: string;
  callThisPlace: string;
  aboutHeading: string;
  aboutTitle: (name: string) => string;
  localTipLabel: string;
  howWeKeepCurrent: string;
  verifiedByTeam: string;
  verifiedOn: (date: string) => string;
  stale: string;
  verifiedLocal: string;
  locallyOwned: string;
  temporarilyClosed: string;
  aiReady: string;
  allergenNote: string;
  otherLocaleNotAvailable: string;
}

const en: UiStrings = {
  browse: "Browse Waikīkī",
  browseIntro: "Locals-verified places, current details, and approved menus for choosing with confidence.",
  categoryIntro: (category, count) => `${count} verified ${category.toLowerCase()} ${count === 1 ? "place" : "places"} to explore.`,
  viewDetails: "View details",
  skipToContent: "Skip to content",
  home: "Home",
  languageLabel: "Language",
  open: "Open",
  closed: "Closed",
  closesAt: (t) => `closes ${t}`,
  opensAt: (t, day) => `opens ${day} ${t}`.trim(),
  lastOrder: (t) => `last order ${t}`,
  hoursUnknown: "Hours not yet confirmed",
  appointmentOnly: "By appointment",
  sellsOutEarly: "Often sells out early",
  today: "today",
  tomorrow: "tomorrow",
  weekdays: { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" },
  menu: "Menu",
  menuComingSoon: (date) => `Menu coming soon — profile verified ${date}`,
  ownerPick: "Owner’s pick",
  hours: "Hours",
  location: "Location",
  phone: "Phone",
  directions: "Directions",
  share: "Share",
  linkCopied: "Link copied",
  callThisPlace: "Call",
  aboutHeading: "About",
  aboutTitle: (name) => `About ${name}`,
  localTipLabel: "Kama‘āina knows",
  howWeKeepCurrent: "How we keep this current",
  verifiedByTeam: "Verified in person by our local team",
  verifiedOn: (date) => `verified ${date}`,
  stale: "due for a re-check",
  verifiedLocal: "Verified Local",
  locallyOwned: "Locally Owned",
  temporarilyClosed: "Temporarily closed",
  aiReady: "AI-ready — findable & citable",
  allergenNote: "Ask staff about allergens and preparation.",
  otherLocaleNotAvailable: "Not available in this language yet — showing the category instead.",
};

const ja: UiStrings = {
  browse: "ワイキキを見る",
  browseIntro: "地元で確認した店舗情報と承認済みメニューで、安心してお店を選べます。",
  categoryIntro: (category, count) => `${category}の確認済み店舗 ${count}件をご紹介します。`,
  viewDetails: "詳細を見る",
  skipToContent: "本文へ移動",
  home: "ホーム",
  languageLabel: "言語",
  open: "営業中",
  closed: "営業時間外",
  closesAt: (t) => `${t}まで`,
  opensAt: (t, day) => `${day}${t}から`,
  lastOrder: (t) => `ラストオーダー ${t}`,
  hoursUnknown: "営業時間は未確認です",
  appointmentOnly: "予約制",
  sellsOutEarly: "早く売り切れることがあります",
  today: "本日",
  tomorrow: "明日",
  weekdays: { mon: "月", tue: "火", wed: "水", thu: "木", fri: "金", sat: "土", sun: "日" },
  menu: "メニュー",
  menuComingSoon: (date) => `メニューは近日公開 — ${date}に店舗確認済み`,
  ownerPick: "店主のおすすめ",
  hours: "営業時間",
  location: "所在地",
  phone: "電話",
  directions: "地図・経路",
  share: "共有",
  linkCopied: "リンクをコピーしました",
  callThisPlace: "電話する",
  aboutHeading: "紹介",
  aboutTitle: (name) => `${name}について`,
  localTipLabel: "地元からのひとこと",
  howWeKeepCurrent: "情報の更新方法",
  verifiedByTeam: "地元チームが現地で確認しています",
  verifiedOn: (date) => `${date}に確認`,
  stale: "再確認予定",
  verifiedLocal: "地元確認済み",
  locallyOwned: "地元経営",
  temporarilyClosed: "臨時休業中",
  aiReady: "AI対応 — 見つけやすく引用しやすい",
  allergenNote: "アレルギーや調理法についてはスタッフにお尋ねください。",
  otherLocaleNotAvailable: "この言語ではまだご覧いただけません — カテゴリーを表示します。",
};

// KO mirrors EN copy until Slice 2 localizes it; never served pre-flip.
const ko: UiStrings = {
  ...en,
  home: "홈",
  browse: "와이키키 둘러보기",
  browseIntro: "현지에서 확인한 장소 정보와 승인된 메뉴로 안심하고 선택하세요.",
  categoryIntro: (category, count) => `확인된 ${category} 장소 ${count}곳을 둘러보세요.`,
  viewDetails: "자세히 보기",
  skipToContent: "본문으로 건너뛰기",
  languageLabel: "언어",
  localTipLabel: "현지인의 한마디",
  aboutTitle: (name) => `${name} 소개`,
};

const STRINGS: Record<Locale, UiStrings> = { en, ja, ko };

export function ui(locale: Locale): UiStrings {
  return STRINGS[locale];
}
