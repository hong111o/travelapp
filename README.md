# 行程本 · Trip Book

自己嘅旅行行程 app。一個行程 = 一個 JSON 檔，app 負責畫出嚟 —— 所以同一套版面用得一世，唔使每次旅行重寫一次 HTML。

由一份手寫嘅 Málaga 行程 HTML 改造而成：版面、配色、地圖、天氣、匯率、倒數全部保留，但資料同顯示分開咗。

---

## 有咩功能

| | |
|---|---|
| 🗂️ **行程書架** | 所有行程一覽，未出發 / 進行中 / 已完成自動標示 |
| ✏️ **表格編輯** | 喺 app 入面直接填，唔使掂 code |
| ⬆️ **匯入檔案** | 上載 `.json` 就即刻睇到成個行程 |
| ⬇️ **匯出檔案** | 每個行程都可以 export 做 `.json`，用嚟備份或者過機 |
| ⧉ **複製 / 🗑 刪除** | 上年嘅行程複製嚟改，快過重頭填 |
| 🗺️ **每日地圖** | 有經緯度嘅點自動出編號 pin + 虛線路線 |
| 🌤️ **即時天氣日落** | 跟行程嘅座標自動拎 |
| 💱 **匯率換算** | 跟行程設定嘅貨幣對 |
| ⏱️ **出發倒數** | 跟行程設定嘅出發時間 |

---

## 點用

### 上網用（GitHub Pages）

> 免費 plan 嘅 GitHub Pages **要 public repo**。詳情同私隱考慮見下面
> 「[⚠️ 私隱：唔好 commit 個人行程](#-私隱唔好-commit-個人行程)」。

1. Settings → General → 拉到底 → Danger Zone → `Change visibility` 改做 **Public**
2. Settings → Pages → Source 揀 `Deploy from a branch`
3. Branch 揀你個 default branch（睇 Settings → General → Default branch 確認），folder 揀 `/ (root)`
4. 等一兩分鐘，開 `https://<你嘅 github 名>.github.io/travelapp/`
5. 手機 Safari／Chrome 開完，撳「加入主畫面 / Add to Home Screen」，就同 app 一樣

開完之後，撳「⬆️ 匯入檔案」上載你自己嘅行程 `.json`。行程會存喺部機，唔會上傳。

### 落地用

直接 double-click `index.html` 都開到（bundled 行程用 `<script>` 載入，唔靠 `fetch`，所以 `file://` 一樣得）。淨係地圖同天氣要上網。

---

## 加一個新行程

**方法一 —— 喺 app 入面填（建議）**

撳「＋ 新行程」，跟住六個 tab 填：

- **基本** — 標題、日期、城市座標（天氣用）、貨幣（匯率用）、出發時間（倒數用）
- **每日行程** — 一日一格，每個「點」就係行程上一行
- **資料卡** — 首頁上面嗰啲卡（航班、酒店、關鍵時間…）
- **要訂 / 連結** — checklist + 實用連結
- **美食** — 每餐速查 + 餐廳清單
- **JSON** — 直接睇／改原始資料

**方法二 —— 匯入 `.json`**

撳「⬆️ 匯入檔案」揀檔案。格式同 export 出嚟嘅一模一樣，所以最易嘅做法係：export 一個現有行程 → 改內容 → 再 import。

**方法三 —— 放入 repo（⚠️ 淨係放唔怕人睇嘅行程）**

放個 `.json` 落 `data/trips/`，然後：

```bash
node tools/bundle-trips.js
```

呢個 script 會將 `data/trips/*.json` 打包做 `data/builtin.js`，任何人第一次開 app 都會自動見到。

> ⚠️ 加咗新 `.json` 記得行呢句，唔係 app 唔會見到。
>
> ⚠️ **repo 一 public，`data/trips/` 入面所有嘢就係公開嘅。**
> 有酒店、訂位、出發日期呢啲資料嘅行程，唔好放呢度 —— 用方法一或者二。

---

## 資料格式

所有欄位都可以留空 —— 冇填嘅部分就唔會顯示。最簡單一個行程得兩行：

```json
{ "title": "週末小旅行", "days": [{ "title": "第一日", "stops": [{ "time": "10:00", "title": "出發" }] }] }
```

完整結構（睇 `data/trips/demo-lisboa.json` 做實例）：

```jsonc
{
  "title": "Lisboa",
  "kicker": "大西洋 · 葡萄牙",        // hero 上面細字
  "subtitle": "",                    // hero 斜體副題
  "startDate": "2027-04-10",
  "endDate": "2027-04-11",

  "place":     { "name": "里斯本", "lat": 38.7223, "lng": -9.1393 },  // 冇座標就冇天氣卡
  "currency":  { "base": "EUR", "quote": "GBP" },                     // 兩個都要填先有換算器
  "departure": { "datetime": "2027-04-10T07:30", "utcOffset": "+01:00", "note": "…" },

  "infoCards": [                     // 首頁嘅資料卡
    { "icon": "🚇", "title": "交通小抄", "mapQuery": "",
      "rows": [{ "k": "機場入城", "v": "地鐵紅線 ~20 分鐘", "sub": "轉綠線去 Baixa" }] }
  ],

  "todos": [                         // 黃色 checklist；level = now / soon / day
    { "level": "now", "text": "**Castelo de São Jorge** — 網上訂飛唔使排隊" }
  ],

  "links": [{ "icon": "🚨", "label": "緊急電話 112", "url": "tel:112" }],

  "days": [{
    "id": "d1",
    "date": "2027-04-10",
    "title": "舊城 · 觀景台",
    "theme": "Baixa 落車 → Alfama 上山 → 日落觀景台",
    "drawRoute": true,               // false = 出 pin 但唔連線（例如彈性日）
    "mapNote": "",
    "stops": [{
      "time": "~13:00",
      "title": "午餐 **Time Out Market**",
      "star": true,                  // 加個 ★
      "desc": "幾十間攤檔一次過試齊…",
      "backup": "Mercado de Campo de Ourique",
      "pin": "週末好逼，早少少去",
      "mapQuery": "Time Out Market Lisboa",   // 出「🧭 導航」掣
      "mapLabel": "Time Out Market",          // 地圖圖例用嘅短名；留空就用 title
      "lat": 38.7071, "lng": -9.1459          // 冇座標 = 唔出現喺地圖
    }]
  }],

  "food": {
    "quick":  [{ "when": "D2 早餐", "name": "Pastéis de Belém", "star": true, "note": "原祖蛋撻" }],
    "picks":  [{ "icon": "🥧", "title": "蛋撻 · **Manteigaria**", "desc": "…", "mapQuery": "…" }],
    "legend": ""
  },

  "notes": ""
}
```

### 小提示

- **粗體** —— 任何描述入面用 `**兩個星**` 包住就會變粗體。原始 HTML 唔會被執行（防注入）。
- **搵座標** —— Google Maps 長按個位置，會彈經緯度出嚟，copy 過去 `lat` / `lng`。
- **`mapQuery`** —— 唔使好準，Google Maps 搜到就得。
- **`utcOffset`** —— 出發地嘅 UTC 偏移（英國夏令 `+01:00`、香港 `+08:00`）。留空 = 用你部機時區。

---

## ⚠️ 私隱：唔好 commit 個人行程

**任何靜態 host 都係公開派檔案** —— GitHub Pages、Netlify、Cloudflare 全部一樣。
課金買 GitHub Pro 都唔解決：佢容許 private repo 開 Pages，但個**網站本身一樣係公開**
（要 Enterprise 先限制得到邊個睇到）。

所以呢個 app 特登咁樣分開：

| | 放喺邊 | 公唔公開 |
|---|---|---|
| **App 本身**（HTML / CSS / JS） | repo | 公開 —— 冇所謂，冇個人資料 |
| **示範行程** | `data/trips/demo-lisboa.json` | 公開 —— 全部係公開地標 |
| **你嘅真實行程** | 瀏覽器 localStorage | **私人 —— 永遠唔會上傳** |

行程存喺瀏覽器嘅 **localStorage**：唔使 server、唔使登入、飛機上冇網都睇到。

代價係 —— **只係得嗰部機嗰個瀏覽器**。清除瀏覽器資料就會冇咗，換機亦唔會跟。所以：

- 填完一個重要行程，撳「⬇️ 匯出」留個 `.json` 底
- 放 iCloud / Google Drive / email 俾自己都得 —— **就係唔好 commit 入 public repo**
- 換咗手機／清咗資料，開 app 撳「⬆️ 匯入檔案」上載返個 `.json` 就搞掂

### 點解要咁小心

一份行程入面通常有：住邊間酒店、幾號去到幾號唔喺屋企、班機時間、訂位取消期限。
公開咗即係話俾人知你幾時屋企冇人。`.json` 留喺自己部機／自己個雲端，就冇呢個問題。

---

## 檔案結構

```
index.html                  app 外殼（三個 view：書架 / 行程 / 編輯）
manifest.webmanifest        加入主畫面用
assets/
  css/app.css               全部樣式（design tokens 由原本份 Málaga HTML 抽出嚟）
  icon.svg
  js/
    util.js                 escape、日期、object path、toast、下載
    schema.js               資料格式：blank / normalize / 驗證
    store.js                localStorage CRUD + 匯入匯出
    widgets.js              天氣、日落、匯率、倒數、Leaflet 地圖
    render.js               行程 → HTML
    editor.js               表格編輯器（path 綁定 + 可增刪重排）
    app.js                  hash router + 書架
data/
  trips/demo-lisboa.json    示範行程（公開地標，冇私人資料）
  builtin.js                由上面打包出嚟（**generated，唔好手改**）
tools/
  bundle-trips.js           打包 script
```

冇 build step、冇 npm dependency、冇 framework。改完直接 refresh 就睇到。

外部資源（都係免費、免 API key）：Leaflet + OpenStreetMap（地圖）、Open-Meteo（天氣日落）、
Fawaz Ahmed currency-api 同 open.er-api.com（匯率）、Google Fonts。
