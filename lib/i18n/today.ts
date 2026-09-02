import type { Locale } from "@/lib/locales";

export interface TodayStrings {
  link: string;
  eyebrow: string;
  pageTitle: string;
  pageDescription: string;
  issueLabel: (date: string) => string;
  shortlistTitle: string;
  shortlistIntro: string;
  emptyTitle: string;
  emptyBody: string;
}

const strings: Record<Locale, TodayStrings> = {
  en: {
    link: "This week",
    eyebrow: "This week in Waikīkī",
    pageTitle: "A local note for right now",
    pageDescription: "A short, staff-curated guide to places worth knowing this week.",
    issueLabel: (date) => `Week of ${date}`,
    shortlistTitle: "The shortlist",
    shortlistIntro: "Current, independently selected places from this week’s note.",
    emptyTitle: "The next local note is taking shape",
    emptyBody: "Our editors are preparing this week’s shortlist. Check back soon.",
  },
  ja: {
    link: "今週のおすすめ",
    eyebrow: "今週のワイキキ",
    pageTitle: "今、知っておきたいローカル情報",
    pageDescription: "編集チームが今週おすすめしたい場所を、短く厳選してご紹介します。",
    issueLabel: (date) => `${date}の週`,
    shortlistTitle: "今週のセレクション",
    shortlistIntro: "今週の記事から、最新情報を確認したおすすめの場所です。",
    emptyTitle: "次のローカル便りを準備中です",
    emptyBody: "編集チームが今週のおすすめを選んでいます。まもなく公開予定です。",
  },
  ko: {
    link: "이번 주 추천",
    eyebrow: "이번 주 와이키키",
    pageTitle: "지금 알아두면 좋은 로컬 이야기",
    pageDescription: "편집팀이 이번 주에 소개하고 싶은 장소를 짧게 엄선했습니다.",
    issueLabel: (date) => `${date} 주간`,
    shortlistTitle: "이번 주 목록",
    shortlistIntro: "이번 주 이야기에서 고른 최신 확인 장소입니다.",
    emptyTitle: "다음 로컬 이야기를 준비 중입니다",
    emptyBody: "편집팀이 이번 주 추천 장소를 고르고 있습니다. 곧 다시 확인해 주세요.",
  },
};

export function todayUi(locale: Locale): TodayStrings {
  return strings[locale];
}
