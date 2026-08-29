import type { Locale } from "@/lib/locales";

export interface TrustStrings {
  trustLink: string;
  reportLink: string;
  trustTitle: string;
  trustIntro: string;
  verifyTitle: string;
  verifyBody: string;
  correctionsTitle: string;
  correctionsBody: string;
  correctionsCta: string;
  slaTitle: string;
  slaBody: string;
  privacyTitle: string;
  privacyBody: string;
  reportTitle: string;
  reportIntro: (name: string) => string;
  reportNeedsListing: string;
  backToBrowse: string;
  fieldLabel: string;
  detailsLabel: string;
  detailsHint: string;
  nameLabel: string;
  emailLabel: string;
  contactHint: string;
  submit: string;
  submitting: string;
  successMessage: string;
  error: string;
  rateLimited: string;
  fields: Record<"name" | "address" | "phone" | "hours" | "menu" | "closure" | "other", string>;
}

const en: TrustStrings = {
  trustLink: "Trust & accuracy",
  reportLink: "Report a change",
  trustTitle: "How we keep information trustworthy",
  trustIntro: "We publish information only after review, show when key details were checked, and keep corrections separate from published facts until a person verifies them.",
  verifyTitle: "Local verification",
  verifyBody: "Our team reviews business details, hours, menus, and source evidence. A badge describes what was checked; it is not a paid ranking or endorsement.",
  correctionsTitle: "Corrections are reviewed",
  correctionsBody: "Anyone can flag an outdated or incorrect detail from a listing. Reports enter a staff queue and never change a public page automatically.",
  correctionsCta: "Find the listing to report",
  slaTitle: "Response target",
  slaBody: "We aim to review correction reports within 48 hours. Complex reports may take longer while we confirm them with reliable sources.",
  privacyTitle: "Privacy",
  privacyBody: "Contact information is optional and used only if we need clarification. It is not published with the report.",
  reportTitle: "Report a change",
  reportIntro: (name) => `Tell us what changed at ${name}. Your report is reviewed before any public information is updated.`,
  reportNeedsListing: "Open a listing and choose “Report a change” so we can attach your report to the right place.",
  backToBrowse: "Browse listings",
  fieldLabel: "What needs updating?",
  detailsLabel: "What should we know?",
  detailsHint: "Include the current information, the correction, and how you learned it (10–2,000 characters).",
  nameLabel: "Your name (optional)",
  emailLabel: "Email (optional)",
  contactHint: "We will use this only if the reviewer needs clarification.",
  submit: "Send report",
  submitting: "Sending…",
  successMessage: "Thank you. Your report is in our review queue. Reference: {reference}",
  error: "We couldn’t save the report. Please try again.",
  rateLimited: "Too many reports were sent recently. Please wait and try again.",
  fields: { name: "Name", address: "Address", phone: "Phone", hours: "Hours", menu: "Menu", closure: "Closure status", other: "Something else" },
};

const ja: TrustStrings = {
  trustLink: "信頼性と正確性",
  reportLink: "変更を報告",
  trustTitle: "正確な情報を保つために",
  trustIntro: "情報は確認後に公開し、主な項目の確認時期を表示します。修正報告は担当者が確認するまで公開情報と分けて管理します。",
  verifyTitle: "現地情報の確認",
  verifyBody: "店舗情報、営業時間、メニュー、根拠資料をチームが確認します。バッジは確認内容を示すもので、有料の順位付けや推薦ではありません。",
  correctionsTitle: "修正報告は担当者が確認します",
  correctionsBody: "店舗ページから、古い情報や誤りをどなたでも報告できます。報告は確認待ち一覧に入り、自動で公開ページを書き換えることはありません。",
  correctionsCta: "報告する店舗を探す",
  slaTitle: "確認の目安",
  slaBody: "修正報告は原則48時間以内の確認を目指します。情報源への確認が必要な場合は、さらに時間がかかることがあります。",
  privacyTitle: "プライバシー",
  privacyBody: "連絡先の入力は任意です。確認が必要な場合にのみ使用し、報告内容とともに公開しません。",
  reportTitle: "変更を報告",
  reportIntro: (name) => `${name}の変更点をお知らせください。公開情報を更新する前に担当者が確認します。`,
  reportNeedsListing: "店舗ページの「変更を報告」から送信すると、正しい店舗に報告を紐づけられます。",
  backToBrowse: "店舗を探す",
  fieldLabel: "更新が必要な項目",
  detailsLabel: "変更内容",
  detailsHint: "現在の表示、正しい情報、確認方法を10〜2,000文字で入力してください。",
  nameLabel: "お名前（任意）",
  emailLabel: "メールアドレス（任意）",
  contactHint: "担当者が確認を必要とする場合にのみ使用します。",
  submit: "報告を送信",
  submitting: "送信中…",
  successMessage: "ありがとうございます。確認待ち一覧に追加しました。受付番号：{reference}",
  error: "報告を保存できませんでした。もう一度お試しください。",
  rateLimited: "短時間に多くの報告が送信されました。時間をおいてお試しください。",
  fields: { name: "店舗名", address: "住所", phone: "電話番号", hours: "営業時間", menu: "メニュー", closure: "休業・閉店状況", other: "その他" },
};

const ko: TrustStrings = { ...en };
const STRINGS: Record<Locale, TrustStrings> = { en, ja, ko };
export const trustUi = (locale: Locale) => STRINGS[locale];
