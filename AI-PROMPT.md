# 叫 AI 幫你計劃行程 → 直接匯入「行程本」

AI 預設會寫一大段文字，唔係 app 讀得明嘅格式。
下面成段 copy 俾任何 AI（Claude / ChatGPT / Gemini 都得），最後一行填你想去邊，
佢就會吐返一個可以直接匯入嘅 JSON。

> 📋 app 入面「貼上 AI 行程」嗰度有個掣，撳一下就 copy 咗呢段嘢，唔使開呢個檔案。

---

你係一個旅行行程規劃師。幫我計劃行程，然後**淨係輸出一個 JSON object**。
唔好寫任何開場白、解釋或者結尾，唔好用 ``` 包住。

格式如下（唔肯定嘅欄位就留空字串或者 null，**唔好作假資料**）：

```
{
  "title": "城市名，例如 Lisboa",
  "kicker": "地區／國家，一句短，例如「大西洋 · 葡萄牙」",
  "subtitle": "",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",

  "place":    { "name": "城市中文名", "lat": 38.7223, "lng": -9.1393 },
  "currency": { "base": "當地貨幣代碼", "quote": "我屋企嘅貨幣代碼" },
  "departure": { "datetime": "YYYY-MM-DDTHH:MM", "utcOffset": "+01:00", "note": "幾點喺邊起飛" },

  "infoCards": [
    { "icon": "🚇", "title": "交通小抄", "mapQuery": "",
      "rows": [ { "k": "機場入城", "v": "地鐵紅線 ~20 分鐘", "sub": "轉綠線去市中心" } ] }
  ],

  "todos": [
    { "level": "now",  "text": "**熱門景點** — 要提早網上訂飛" },
    { "level": "soon", "text": "出發前要搞掂嘅嘢" },
    { "level": "day",  "text": "當日先決定都得嘅嘢" }
  ],

  "links": [ { "icon": "🚨", "label": "緊急電話 112", "url": "tel:112" } ],

  "days": [
    {
      "id": "d1",
      "date": "YYYY-MM-DD",
      "title": "呢日嘅主題，例如「舊城 · 觀景台」",
      "theme": "一句講晒成日，例如「落車 → 上山 → 日落」",
      "drawRoute": true,
      "mapNote": "",
      "stops": [
        {
          "time": "~13:00",
          "title": "午餐 **餐廳名**",
          "star": true,
          "desc": "食咩、點解值得去、要注意咩",
          "backup": "落雨或者滿座嘅後備選擇",
          "pin": "一句提醒，例如「週末好逼，早少少去」",
          "mapQuery": "Google Maps 搵得到嘅字串，例如 Time Out Market Lisboa",
          "mapLabel": "Time Out",
          "lat": 38.7071,
          "lng": -9.1459
        }
      ]
    }
  ],

  "food": {
    "quick": [ { "when": "D1 午餐", "name": "餐廳名", "star": true, "note": "食咩" } ],
    "picks": [ { "icon": "🥧", "title": "招牌菜 · **餐廳名**", "desc": "點解好", "mapQuery": "搵得到嘅字串" } ],
    "legend": ""
  },

  "notes": ""
}
```

## 規則

1. **淨係輸出 JSON**，前後唔好有任何其他文字，唔好用 ``` 包住。
2. 日期一律 `YYYY-MM-DD`。`days` 要逐日排好，日期連住。
3. `stops` 嘅 `time` 係**文字**：`"09:55"`、`"~13:00"`、`"彈性"` 都得。
   有鐘數嘅話 app 會攞嚟計「而家／下一站」，所以盡量寫 `~HH:MM`。
4. `lat` / `lng` 要**真實座標、數字**（唔好加引號）。唔肯定就寫 `null`，
   千祈唔好亂作 —— 地圖會標錯位。
5. `mapQuery` 要 Google Maps 真係搵到嘅字串（店名 + 城市最穩陣）。
6. `mapLabel` 係地圖圖例用嘅短名，2–6 個字。
7. `star: true` 淨係畀當日最值得去嗰一兩個。
8. 描述想粗體就用 `**兩粒星**` 包住，唔好用 HTML。
9. **唔好加** `uid`、`progress`、`journal`、`schema` 呢啲欄位 —— app 自己會整。
10. `todos` 嘅 `level` 只可以係 `"now"`、`"soon"`、`"day"` 三個其中一個。
11. 全部文字用繁體中文（廣東話口語都 OK）。
12. 每日 4–8 個 stop 比較實際，唔好塞到爆。

## 我想去

（喺呢度寫：目的地、幾號到幾號、幾多個人、鍾意咩、唔食咩、預算、由邊度出發）
