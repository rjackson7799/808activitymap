import type { Locale } from "@/lib/locales";

export interface BusinessStrings {
  link: string;
  eyebrow: string;
  title: string;
  intro: string;
  benefitsHeading: string;
  benefits: Array<{ title: string; body: string }>;
  processHeading: string;
  processIntro: string;
  steps: string[];
  trustNote: string;
  formHeading: string;
  formIntro: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  preferredLanguage: string;
  languageEnglish: string;
  languageJapanese: string;
  message: string;
  messageHint: string;
  consent: string;
  privacy: string;
  submit: string;
  submitting: string;
  success: string;
  error: string;
  rateLimited: string;
}

const en: BusinessStrings = {
  link: "For businesses",
  eyebrow: "For Hawaiʻi businesses",
  title: "Help visitors find accurate information about your business.",
  intro: "We work directly with local businesses to publish current details, approved photos, and multilingual information visitors can trust.",
  benefitsHeading: "What participation includes",
  benefits: [
    { title: "First-party accuracy", body: "Your business details are reviewed with you before publication and clearly dated." },
    { title: "Visitor-ready languages", body: "Approved information can be prepared for English and Japanese visitors without publishing unreviewed translations." },
    { title: "Clear, fair presentation", body: "Payment never changes the accuracy standard, and we do not sell ranking placement." },
  ],
  processHeading: "How Phase 0 works",
  processIntro: "There is no self-service account or claim portal yet. Our team handles onboarding directly.",
  steps: ["Tell us about your business.", "We confirm the details, permissions, and photo rights with you.", "A publisher reviews the completed profile before it can go live."],
  trustNote: "Submitting this form expresses interest only. It does not create an account, claim a listing, authorize publication, or start a paid service.",
  formHeading: "Start a conversation",
  formIntro: "Share a few details and our local team will follow up. Required fields are marked below.",
  businessName: "Business name",
  contactName: "Your name",
  email: "Email",
  phone: "Phone (optional)",
  website: "Business website (optional)",
  preferredLanguage: "Preferred language",
  languageEnglish: "English",
  languageJapanese: "Japanese / 日本語",
  message: "What would you like help with?",
  messageHint: "For example: a new profile, an existing listing, translated information, or a menu update.",
  consent: "I agree that the team may use these details to respond to this inquiry.",
  privacy: "We use this information only to review and respond to your business inquiry. Do not include passwords, payment information, or private agreements.",
  submit: "Send inquiry",
  submitting: "Sending…",
  success: "Thank you. Your inquiry was received. Reference: {reference}",
  error: "We couldn’t send your inquiry. Please try again.",
  rateLimited: "Too many inquiries were sent from this connection. Please try again later.",
};

const ja: BusinessStrings = {
  link: "事業者の方へ",
  eyebrow: "ハワイの事業者の方へ",
  title: "旅行者に、正確な店舗・事業情報を届けませんか。",
  intro: "地域の事業者と直接確認し、最新情報、使用許可済みの写真、多言語情報を安心して見られる形で掲載します。",
  benefitsHeading: "掲載に含まれること",
  benefits: [
    { title: "一次情報を確認", body: "公開前に事業者の方と内容を確認し、確認日も分かりやすく表示します。" },
    { title: "旅行者向けの多言語情報", body: "未確認の翻訳を公開せず、承認済みの情報を英語・日本語の旅行者向けに整えます。" },
    { title: "公平で分かりやすい表示", body: "正確性の基準は支払いの有無で変わらず、掲載順位の販売も行いません。" },
  ],
  processHeading: "フェーズ0の流れ",
  processIntro: "現在、セルフサービスのアカウントや掲載申請ポータルはありません。担当チームが直接ご案内します。",
  steps: ["事業についてお知らせください。", "内容、掲載許可、写真の使用権を一緒に確認します。", "完成したプロフィールを公開担当者が確認してから掲載します。"],
  trustNote: "このフォームはお問い合わせ受付のみです。アカウント作成、掲載情報の所有申請、公開許可、有料サービスの開始にはなりません。",
  formHeading: "お問い合わせ",
  formIntro: "必要事項をご入力ください。地域担当チームよりご連絡します。必須項目を入力してください。",
  businessName: "事業者・店舗名",
  contactName: "ご担当者名",
  email: "メールアドレス",
  phone: "電話番号（任意）",
  website: "公式ウェブサイト（任意）",
  preferredLanguage: "ご希望の言語",
  languageEnglish: "英語 / English",
  languageJapanese: "日本語",
  message: "ご相談内容",
  messageHint: "例：新規掲載、既存情報、翻訳、メニュー更新について",
  consent: "このお問い合わせへの返信に、入力した情報を使用することに同意します。",
  privacy: "入力情報は、お問い合わせの確認と返信のためにのみ使用します。パスワード、支払い情報、非公開の契約書は入力しないでください。",
  submit: "問い合わせを送信",
  submitting: "送信中…",
  success: "お問い合わせを受け付けました。受付番号：{reference}",
  error: "送信できませんでした。もう一度お試しください。",
  rateLimited: "この接続からの送信回数が上限に達しました。時間をおいてもう一度お試しください。",
};

export function businessUi(locale: Locale): BusinessStrings {
  return locale === "ja" ? ja : en;
}
