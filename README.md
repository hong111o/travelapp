# 行程本 · Trip Book

自己嘅旅行行程 app。一個行程 = 一個 JSON 檔，app 負責畫出嚟 —— 所以同一套版面用得一世，唔使每次旅行重寫一次 HTML。

由一份手寫嘅 Málaga 行程 HTML 改造而成：版面、配色、地圖、天氣、匯率、倒數全部保留，但資料同顯示分開咗。

---

## 有咩功能

| | |
|---|---|
| 📍 **今日 · 而家同下一站** | 行程進行中，首頁會話你而家應該喺邊、下一站幾時 |
| ✅ **打卡** | 去咗嘅景點／餐廳撳一下，日程頁同總清單一齊更新 |
| 📷 **相片 · 筆記** | 每個點加相同寫低當日感想，變成旅行日記 |
| ✈️ **真離線** | 冇網都開到 app、睇到行程；地圖可以預先下載 |
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
      // uid 由 app 自動生成，用嚟記打卡；自己寫新行程唔使填
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

  // 打卡記錄同筆記：app 自動維護，唔使自己寫
  "progress": { "s-abc123-xy": "2027-04-10T12:05:00.000Z" },
  "journal":  { "s-abc123-xy": { "note": "排咗 40 分鐘，但係值得", "at": "…" } },

  "notes": ""
}
```

### 小提示

- **粗體** —— 任何描述入面用 `**兩個星**` 包住就會變粗體。原始 HTML 唔會被執行（防注入）。
- **搵座標** —— Google Maps 長按個位置，會彈經緯度出嚟，copy 過去 `lat` / `lng`。
- **`mapQuery`** —— 唔使好準，Google Maps 搜到就得。
- **`utcOffset`** —— 出發地嘅 UTC 偏移（英國夏令 `+01:00`、香港 `+08:00`）。留空 = 用你部機時區。

---

## 📍 今日 · 而家同下一站

行程當日打開 app，首頁最上面會出一張深色卡：

- **而家** — 你而家應該喺邊個點
- **下一站** — 下一個點，仲有幾耐（`3 個鐘 20 分後`）
- 撳「睇今日行程 ›」入去，當日嗰頁會**標住而家嗰站**、下一站，過咗嘅點會淡色，
  而且自動捲到你而家嗰行

時間係由每個點嘅「時間」欄拆出嚟（`09:55`、`~13:00`、`~9:15` 都認得）。
冇時間嘅點（例如「硬 timing」「選項」）唔會當成「而家」，但照樣顯示。

用**你部機嘅時間**計 —— 手機去到當地會自動轉時區，啱晒。

---

## ✅ 打卡

去完一個地方，撳右邊個圈就標做「去咗」。計劃臨時改都唔怕 —— 呢個記錄嘅係
**你實際去過咩**，唔係原本計劃。

兩個地方睇得到，而且同步：

- **每日行程頁** — 去咗嘅會劃走同埋淡色
- **打卡清單**（首頁嗰張 `打卡清單` 卡）— 全程所有景點同餐廳一頁過，
  有進度條、`全部 / 未去 / 去咗` 篩選

餐廳清單入面嗰啲「有得揀」嘅店都撳得，所以「今次試咗邊間」都記得返。

### 改行程唔會搞亂打卡記錄

每個行程點有個隱藏嘅 `uid`。打卡記錄係跟住 `uid` 走，唔係跟位置，
所以你**中間插入一個新點、或者調轉次序，之前嘅打卡都唔會跳錯地方**。
刪咗個點，佢嘅記錄就自然消失。

記錄存喺行程入面（`progress` 欄），所以 export `.json` 會一齊帶走，
匯入返去打卡狀態都仲喺度。

想由頭嚟過：打卡清單最底有「清空所有打卡記錄」（只係清記錄，行程唔會改）。

---

## 📷 相片同筆記

打卡記錄咗「去過」，呢個記錄「點樣」。每個景點／餐廳下面都有兩個掣：

- **✏️ 加筆記** — 寫低當日感想（「排咗 40 分鐘，但係值得」）
- **📷 加相** — 揀一張或者幾張相，即刻出縮圖；撳縮圖睇大圖，可以喺度刪

筆記會喺打卡清單嗰頁一齊顯示，所以成個行程翻返去睇就係一本旅行日記。

### 相擺喺邊

| | 擺喺邊 | export 帶唔帶走 |
|---|---|---|
| 打卡記錄 · 筆記 | 行程入面 | ✅ 帶走 |
| **相片** | 瀏覽器 IndexedDB | ❌ **唔帶走** |

相片太大喇 —— 一張手機相 4–12MB，放入 `.json` 會即刻爆咗個檔案同 localStorage。
所以相片淨係留喺部機。

加相嗰陣會**自動縮到最長邊 1600px（JPEG）**，唔縮嘅話幾十張相就食晒部機空間。
實測 3000×2000 嘅相會變成 1600×1067。

> ⚠️ 相片唔會跟 export 走，清咗瀏覽器資料就會冇。真係好緊要嘅相，
> 記得都存一份落相簿。
>
> 刪除成個行程嘅時候，佢啲相會一齊清走（唔係咁就會永遠霸住部機空間）。

---

## ✈️ 離線

`Leaflet` 同標題字體 `Fraunces` 已經放咗入 repo，唔再靠 CDN。
加上 service worker，**冇網一樣開到 app、睇到成個行程**。

| 冇網嘅時候 | 點 |
|---|---|
| App 本身 · 行程 · 每日安排 | ✅ 照用 |
| 地圖 | ✅ **預先下載咗**先睇到（見下） |
| 天氣 · 日落 · 匯率 | ❌ 顯示「需上網更新」 |

離線嗰陣頂部會出一條黑色提示條。

### 下載離線地圖

行程頁面下面有張「📥 離線地圖」卡，**出發前喺 wifi 撳一次**就得。

另外，你平時 online 睇過嘅地圖會自動 cache，所以就算冇撳個掣，
出發前掃一次每日地圖都有同樣效果。

> 🙏 每個行程最多下載 **250 塊 tile**，而且逐塊慢慢攞。
> OpenStreetMap 嘅 tile 係免費俾人用，佢哋嘅使用政策當超過 250 塊叫 bulk download。
> 呢個 app 特登唔越界。所以地圖係「夠你睇」，唔係成個城市離線。

### ⚙️ 改完 app 之後記得 bump 版本

Service worker 係 **cache-first** —— 開得快、離線得，代價係你改完 code
push 上去，已經裝咗嘅 app 未必即刻攞到新版。

改完之後，喺 `sw.js` 最頂改一改個版本號：

```js
const VERSION = 'v2';   // v1 -> v2
```

改咗呢個字，`sw.js` 本身就唔同咗，瀏覽器會重新安裝 service worker、
掉咗舊 cache、再攞一次所有檔案。唔改嘅話，用家下次開會攞到新版，
但今次開嗰次仲係舊版。

> 淨係改 `data/trips/` 入面嘅行程？記得行 `node tools/bundle-trips.js`，
> 之後一樣 bump version。

### 字體嘅取捨

`Fraunces`（英文標題字）細細個 ~77KB，四個 weight 全部放咗入 repo。
`Noto Sans HK` 冇放 —— 中文字體每個 weight 都幾 MB。Online 就照用 Google Fonts，
離線就跌返落系統中文字體（iOS PingFang HK / Android Noto），一樣靚。

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
sw.js                       service worker（離線 cache）
assets/
  css/app.css               全部樣式（design tokens 由原本份 Málaga HTML 抽出嚟）
  icon.svg
  fonts/                    Fraunces（vendored，離線用）
  vendor/leaflet/           Leaflet 1.9.4（vendored，離線用）
  js/
    util.js                 escape、日期、object path、toast、下載
    schema.js               資料格式：blank / normalize / 驗證
    store.js                localStorage CRUD + 匯入匯出
    widgets.js              天氣、日落、匯率、倒數、Leaflet 地圖
    offline.js              service worker 註冊、離線狀態、地圖 tile 預載
    photos.js               相片 IndexedDB 儲存（自動縮圖）
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

外部資源（都係免費、免 API key）：OpenStreetMap（地圖 tile）、Open-Meteo（天氣日落）、
Fawaz Ahmed currency-api 同 open.er-api.com（匯率）、Google Fonts（淨係中文字體，離線有 fallback）。
Leaflet 同 Fraunces 已經 vendored 入 repo。

Leaflet 用 BSD-2-Clause，Fraunces 用 SIL OFL 1.1 —— licence 檔案喺
`assets/vendor/leaflet/LICENSE` 同 `assets/fonts/FRAUNCES-LICENSE`。
