# 808eVentures — Front-End Design Spec

Source of truth: `808 Investor Prototype.dc.html` (interactive prototype). This document describes what that prototype implies for a production build: tokens, screens, state, data shape, and i18n.

The prototype is a React-style component with all styling inline. Nothing in it depends on a framework beyond React; the CSS values below can be lifted verbatim into Tailwind config, CSS variables, or styled-components.

---

## 1. Design tokens

### Color

| Token | Value | Use |
| --- | --- | --- |
| `ink` | `#1E232B` | Primary text, primary buttons, day markers |
| `ink-2` | `#3B4149` | Body paragraph text |
| `ink-3` | `#5B646F` | Secondary metadata |
| `sand-bg` | `#EEE7D9` | Page background (outside app chrome) |
| `sand-surface` | `#FBF8F1` | App content background (explore list, detail page, planner) |
| `sand-input` | `#F3EFE6` | Input fills, inactive tab fills, chips |
| `stone` | `#8A8170` | Placeholder text, muted labels |
| `stone-light` | `#A79E8C` | Small caps stat labels |
| `stone-lighter` | `#B7AF9E` | Empty-state text, inactive tab bar icons |
| `teal` | `#0E8FA8` | Primary accent — links, secondary CTA borders, active checks |
| `teal-dark` | `#0B6E86` | Link hover, gradient end |
| `teal-light` | `#1CA5C0` | Gradient start (map, location card) |
| `clay` | `#C4692A` | Kama'āina tips, deals, badges, map pins |
| `clay-text` | `#5B4636` | Tip body copy |
| `green` | `#4E9A1C` | "Open now" hours status |
| `green-pulse` | `#6FBE2C` | Active-pin pulse ring |
| `gold` | `#D9B673` | "Why this matters" overlay label |
| `white` | `#FFFFFF` | Cards, topbar |

Borders: `1px solid rgba(30,35,43,.08)` (light) / `rgba(30,35,43,.12)` (medium) / `rgba(30,35,43,.16)` (dashed empty states).

Shadows:
- Card: `0 2px 10px -4px rgba(20,40,60,.12)`
- Floating input (mobile): `0 6px 16px -8px rgba(0,0,0,.25)`
- Device frame: `0 40px 90px -30px rgba(20,40,60,.45)`
- Dropdown: `0 18px 40px -12px rgba(20,40,60,.28)`
- Modal: `0 40px 90px -20px rgba(0,0,0,.5)`
- Slide-out drawer: `-20px 0 60px -20px rgba(20,40,60,.4)`

Page background gradient: `radial-gradient(1200px 600px at 20% -5%, #F7F1E4, #EAE1CF)`

### Type

Three font families, loaded from Google Fonts:

- **Marcellus** — display/serif. Headings, business names on detail pages, numerals in stat cards, review quotes. Latin only.
- **Plus Jakarta Sans** — UI sans. All labels, buttons, body copy, metadata. Weights 400–800.
- **Noto Sans JP / Noto Sans KR** — substituted for *both* roles when language is `ja` / `ko` (Marcellus has no CJK coverage).

```
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Marcellus&family=Noto+Sans+JP:wght@400;500;700;800&family=Noto+Sans+KR:wght@400;500;700;800&display=swap" rel="stylesheet">
```

Font resolution logic (important — this is the whole i18n type story):

```js
const displayFont = lang === 'ja' ? "'Noto Sans JP'"
                  : lang === 'ko' ? "'Noto Sans KR'"
                  : "'Marcellus'";
const bodyFont    = lang === 'ja' ? "'Noto Sans JP'"
                  : lang === 'ko' ? "'Noto Sans KR'"
                  : "'Plus Jakarta Sans'";
```

Scale as used (font-weight / size / family):

| Role | Desktop | Mobile |
| --- | --- | --- |
| Detail page H1 | `400 32px` display | `400 24px` display |
| Section H2 | `400 21px` display | `400 18px` display |
| Screen title | `400 26px` display | `400 22px` display |
| Card business name | `700 16px` sans | `700 16px` sans |
| Body paragraph | `400 14px/1.65` sans | `400 13.5px/1.6` sans |
| Card metadata | `600 12px` sans | `600 12px` sans |
| Button label | `600–700 12–13.5px` sans | `700 12–13.5px` sans |
| Small caps label | `500 9.5px`, `letter-spacing:.08em` | — |
| Tab bar label | — | `700 9.5px` sans |

Radii: 8–14px for controls and cards, 18px for content cards, 20–22px for modals and the device viewport, 42/52px for the phone frame, 50% for circular markers.

---

## 2. Screens

### 2.1 Presenter bar (prototype only — do not build)
The dark bar above the device frame (device toggle, restart, play demo) is scaffolding for investor presentations. Not part of the product.

### 2.2 Desktop — Explore
Two-pane layout inside a `1440×900` frame.

- **Topbar** (h ≈ 68px, white, bottom hairline): back chevron (detail screen only) → logo (42px tall) → search field (max 480px, `sand-input` fill, magnifier icon, placeholder only in the prototype) → "Near me · Waikīkī" pill → language selector → "Make Itinerary" dark button with a clay count badge.
- **Left rail** (420px, `sand-surface`, scrolls): screen title + subtitle, then a vertical stack (`gap:14px`) of business cards.
- **Business card**: horizontal, 118px photo on the left with an ETA chip bottom-left (`rgba(20,30,40,.72)`), then name / `⭐ rating · category · price` / hours status in green / a **Kama'āina Knows** tip block (2px clay left border, tiny clay caps label). Below, full-width secondary "＋ Add to itinerary" button (white fill, 1.5px teal border, teal label). The whole card body is a click target for the detail page; the card is `draggable` for the itinerary drawer.
- **Map** (fills remaining width): stylized Oahu landmass over a teal gradient ocean, `HONOLULU` label in Marcellus. Pins are teardrops (`border-radius:50% 50% 50% 4px` + `rotate(-45deg)`, clay fill, white 2.5px stroke) anchored at percentage coordinates with `translate(-50%,-100%)`. Each pin has a white name tooltip beneath it and opens the detail page on click. The pin for the currently open business emits a pulsing green ring.
- **Route line**: when 2+ itinerary stops exist, a dashed clay polyline (`stroke-dasharray:1.6 1.4`) connects their pin coordinates in itinerary order. In production this should be a real routing path, not a straight polyline.

> Production note: the map is a hand-drawn SVG in the prototype. Replace with a real tile map (Mapbox / MapLibre / Google) and keep the pin, tooltip, pulse, and route styling.

### 2.3 Desktop — Business detail
Scrolling `sand-surface` page.

1. Breadcrumb (`Explore › Food & Drink`, localized).
2. Photo mosaic: CSS grid `1.7fr 1fr 1fr` × `190px 190px`, 8px gap, 18px outer radius. Hero spans both rows; two secondaries fill the right.
3. Two-column body (`gap:28px`): main column + 300px sidebar.
   - Main: H1 name, `category · price` subline, three white stat cards (Rating in display font, Hours in green, Price), "About {name}" with two paragraphs, the Kama'āina tip (3px clay left border), "Hours & Location" as a teal gradient card with a 📍 glyph, "Reviews from Locals" as a white card holding one display-font quote plus attribution.
   - Sidebar: **deal coupon** (dashed clay border, solid clay header strip "🎟️ Deal from this business", white body with the offer in display font) and an action card — dark full-width "＋ Add to itinerary", then two half-width outline buttons (Directions / Call).

Three businesses are fully built: Ono Seafood, Helena's Hawaiian Food, Diamond Head Market & Grill.

### 2.4 Desktop — Itinerary drawer
Right slide-out, 400px, `sand-surface`, `transition: right .3s cubic-bezier(.4,0,.2,1)`, with a `rgba(20,25,32,.4)` scrim that closes it.

- Header: 🗺️ + "My Itinerary" + "N stops · 3 days" + close button.
- **"Why this matters" overlay**: dark gradient card (`#1E232B → #2A3038`), gold caps label, display-font body, dismissible. Fires once, automatically, on the very first stop added. Investor-facing only — omit or repurpose in production.
- Day tabs: Day 1 / Day 2 / Day 3 pill row; active tab is `ink` fill, white label.
- Day sections: each is a drop target (`onDragOver` + `onDrop`). Empty state = 2px dashed border with "Drop stops here 🌴". Entries are white rows: numbered dark circle, name + category, ✕ remove.

Adding via a card button appends to the currently active day; dragging a card onto a day appends to *that* day. Duplicates within one day are ignored.

### 2.5 Mobile (390×844)
Three tabs, bottom tab bar (Explore / Itinerary) with a clay count badge on Itinerary.

- **Explore**: floating search row + compact language button, screen title, vertical card stack. Cards are vertical: 130px photo, name, metadata, tip line, full-width add button.
- **Detail**: 250px hero photo with a circular back button and language button overlaid, then title block, About, deal coupon, review card. Sticky bottom bar with the dark "＋ Add to itinerary" button.
- **Itinerary**: title, "N stops · 3 days", then all three days stacked with numbered day badges and removable entry rows (no drag on mobile — button-add only).

All hit targets ≥ 36px; sticky CTA row is 44px+.

### 2.6 Deal modal
Centered 340px card over a `rgba(20,25,32,.5)` scrim. Clay header (🎟️, business name, category), body with the offer, dashed divider, "Show this screen to redeem · valid today", then a redemption code chip `808·ALOHA·{CODE}` in `sand-input`, and a dark "Mark as redeemed" button. Codes are derived from the business id in the prototype; production should issue real, single-use codes server-side and record redemption.

---

## 3. State model

```js
{
  lang: 'en' | 'ja' | 'ko',
  device: 'desktop' | 'mobile',     // prototype only
  screen: 'explore' | 'detail',     // desktop
  mobileTab: 'explore' | 'detail' | 'itin',
  activeBizId: string,
  itin: { d1: string[], d2: string[], d3: string[] },  // arrays of business ids, ordered
  activeDay: 'd1' | 'd2' | 'd3',
  plannerOpen: boolean,
  statVisible: boolean, statSeenEver: boolean,          // "why this matters" overlay
  dealOpen: string | null,                             // business id
  langOpen: boolean
}
```

Derived values: total stop count (drives the topbar badge and tab badge), route polyline points (map coordinates of all stops in order), entry numbering per day.

Persistence: the prototype holds everything in memory. Production needs the itinerary persisted per user (or per anonymous session) and language persisted in a cookie or `localStorage` so it survives reload.

---

## 4. Data shape

Every business is one record; every user-visible string is a `{ en, ja, ko }` map.

```js
{
  id: 'ono',
  coords: { lat, lng },            // prototype uses mx/my map percentages
  rating: 4.9,
  price: '$',
  photos: [url, url, ...],
  etaMinutes: 11,                  // computed from user location in production
  name:        { en, ja, ko },
  category:    { en, ja, ko },     // "Poke · Kapahulu"
  hoursText:   { en, ja, ko },     // "Open · closes 6pm" — should be derived from real hours
  about:       [{ en, ja, ko }, { en, ja, ko }],
  localTip:    { en, ja, ko },     // Kama'āina Knows
  deal:        { en, ja, ko },
  review:      { quote: { en, ja, ko }, author: { en, ja, ko } }
}
```

Notes for the build:
- `hoursText` is a rendered string in the prototype. Production should store structured opening hours and compute the open/closed status string per locale, including the green/neutral color state.
- `etaMinutes` is hard-coded. Production computes it from the user's position.
- `localTip` and `review` are editorial content, not user-generated. They need a CMS surface (this is the platform's differentiator — treat it as first-class content, not a nice-to-have field).
- Deals belong to the business portal; the front end only renders and redeems them.

---

## 5. Internationalization

Requirements the prototype demonstrates:

1. **Every** visible string switches, including nav, buttons, empty states, placeholders, breadcrumbs, review quotes, and business copy. There is no partial-translation fallback shown to users; the code falls back to `en` only if a locale key is missing.
2. **Font switches with locale** (see §1). Do not ship Marcellus for `ja`/`ko` — it renders as fallback glyphs.
3. **Layout must absorb longer strings.** Japanese and Korean labels run longer than the English equivalents in several places ("Make Itinerary" → "旅程を作成" / "일정 만들기"; "Results" → "検索結果に戻る"). Buttons and chips must size to content, never fixed width, and the topbar must wrap or scroll rather than clip.
4. **Language selector**: teal globe icon, current locale short code (`EN` / `日本語` / `한국어`), chevron. Menu rows show the native name over the English name, with a teal ✓ on the active row and a `sand-input` fill. Present in the desktop topbar, and on mobile as a compact 52×36 button in the search row and over the detail hero.
5. **Ordinal/counter formats differ per locale.** "N stops · 3 days" is composed from localized fragments; Korean uses `N개 장소 · 3일` and day labels become `1일차` rather than `Day 1`. Don't concatenate raw English words.
6. Store copy keyed by string id, grouped by section (`nav`, `explore`, `card`, `detail`, `itin`). The prototype's `STRINGS` object is a ready-made starting catalog — the Japanese and Korean copy in it is written, not machine-placeholder, and can be lifted directly.

---

## 6. Interaction and motion

| Behavior | Detail |
| --- | --- |
| Card → detail | Click anywhere on the card body or its map pin |
| Detail → back | Topbar chevron (desktop), circular overlay button (mobile) |
| Add to itinerary | Appends to active day, opens the drawer, increments both badges |
| Drag to plan | Desktop cards are draggable onto any day panel |
| Remove stop | ✕ on the entry row; remaining entries renumber |
| Deal | Opens modal; scrim and "Mark as redeemed" both close it |
| Language menu | Click outside or select to close |
| Drawer | 300ms `cubic-bezier(.4,0,.2,1)` slide; scrim fades 200ms |
| Overlay / banner entry | `floatin` keyframe — 300ms, 8px upward, fade in |
| Active pin | `pulsering` keyframe — 1.6s infinite, scale .6→1.8, fade out |

Two named keyframes, both trivial:

```css
@keyframes pulsering { 0% { transform: scale(.6); opacity:.55 } 100% { transform: scale(1.8); opacity:0 } }
@keyframes floatin  { 0% { opacity:0; transform: translateY(-8px) } 100% { opacity:1; transform: translateY(0) } }
```

---

## 7. Not in the prototype

Out of scope in this file, needed for the real site: authentication, search (the field is a placeholder), filters and categories, real map tiles and routing, opening-hours computation, photo CDN and responsive image sizes, deal issuance and redemption tracking, saved/favorites, the business portal, the admin dashboard, analytics events, accessibility passes (focus order, ARIA on the language menu and drawer, `prefers-reduced-motion`), and breakpoints between 390px and 1440px — the prototype pins those two widths only.
