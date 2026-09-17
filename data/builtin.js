/* GENERATED FILE — do not edit by hand.
 * Source: data/trips/*.json
 * Rebuild: node tools/bundle-trips.js
 */
window.BUILTIN_TRIPS = [
  {
    "schema": 1,
    "id": "demo-lisboa",
    "title": "Lisboa",
    "kicker": "示範行程 · DEMO",
    "subtitle": "呢個係示範，刪咗佢都得",
    "startDate": "2027-04-10",
    "endDate": "2027-04-11",
    "place": {
      "name": "里斯本",
      "lat": 38.7223,
      "lng": -9.1393
    },
    "currency": {
      "base": "EUR",
      "quote": "GBP"
    },
    "departure": {
      "datetime": "2027-04-10T07:30",
      "utcOffset": "+01:00",
      "note": "2027 年 4 月 10 日 · 07:30 起飛"
    },
    "infoCards": [
      {
        "icon": "ℹ️",
        "title": "呢個係示範行程",
        "mapQuery": "",
        "rows": [
          {
            "k": "用嚟做咩",
            "v": "睇下每個欄位出嚟係點",
            "sub": "所有景點都係公開地標，冇任何私人資料"
          },
          {
            "k": "想開始用",
            "v": "撳「＋ 新行程」",
            "sub": "或者匯入你自己 export 咗嘅 .json"
          },
          {
            "k": "唔想要",
            "v": "撳「🗑 刪除」就得",
            "sub": "刪咗唔會再出現"
          }
        ]
      },
      {
        "icon": "🚇",
        "title": "交通小抄",
        "mapQuery": "",
        "rows": [
          {
            "k": "機場入城",
            "v": "地鐵紅線 ~20 分鐘",
            "sub": "轉綠線去 Baixa"
          },
          {
            "k": "28 號電車",
            "v": "經 Alfama 舊城",
            "sub": "好逼，早晨去人少啲"
          },
          {
            "k": "去 Belém",
            "v": "15E 電車 ~25 分鐘",
            "sub": "河邊一路行都得"
          }
        ]
      }
    ],
    "todos": [
      {
        "level": "now",
        "text": "**Castelo de São Jorge** — 網上訂飛唔使排隊。"
      },
      {
        "level": "soon",
        "text": "**Time Out Market** 週末好逼，可以早少少去。"
      },
      {
        "level": "day",
        "text": "電車飛 · 觀景台 · **Pastéis de Belém**（現場排隊就得）。"
      }
    ],
    "links": [
      {
        "icon": "🚨",
        "label": "緊急電話 112",
        "url": "tel:112"
      },
      {
        "icon": "🌤️",
        "label": "里斯本天氣",
        "url": "https://www.google.com/search?q=Lisbon+weather"
      }
    ],
    "days": [
      {
        "id": "d1",
        "date": "2027-04-10",
        "title": "舊城 · 觀景台",
        "theme": "Baixa 落車 → Alfama 上山 → 日落觀景台",
        "drawRoute": true,
        "mapNote": "全日基本上行得晒，不過上山斜，著返對好行嘅鞋。",
        "stops": [
          {
            "time": "~10:00",
            "title": "**Praça do Comércio** 商業廣場",
            "star": false,
            "desc": "面向 Tejo 河嘅大廣場，由呢度開始行入舊城最順。",
            "note": "",
            "backup": "",
            "pin": "",
            "mapQuery": "Praça do Comércio, Lisboa",
            "mapLabel": "商業廣場",
            "lat": 38.7075,
            "lng": -9.1364
          },
          {
            "time": "~11:00",
            "title": "**Elevador de Santa Justa** 升降機",
            "star": false,
            "desc": "1902 年嘅鐵鑄升降機。想慳錢又唔想排隊，可以行上 Carmo 廣場嗰邊由上面望落去。",
            "note": "",
            "backup": "",
            "pin": "上面觀景台要另外買飛",
            "mapQuery": "Elevador de Santa Justa, Lisboa",
            "mapLabel": "Santa Justa",
            "lat": 38.7123,
            "lng": -9.1393
          },
          {
            "time": "~13:00",
            "title": "午餐 **Time Out Market**",
            "star": true,
            "desc": "幾十間攤檔一次過試齊，由平民 bifana 到名廚小食都有。",
            "note": "",
            "backup": "Mercado de Campo de Ourique（本地人多啲）",
            "pin": "",
            "mapQuery": "Time Out Market Lisboa",
            "mapLabel": "Time Out Market",
            "lat": 38.7071,
            "lng": -9.1459
          },
          {
            "time": "~15:00",
            "title": "**Castelo de São Jorge** 聖喬治城堡",
            "star": true,
            "desc": "山頂摩爾城堡，成個里斯本同紅屋頂一覽無遺。行 ~1.5 個鐘。",
            "note": "",
            "backup": "",
            "pin": "網上訂飛慳排隊時間",
            "mapQuery": "Castelo de São Jorge, Lisboa",
            "mapLabel": "城堡",
            "lat": 38.7139,
            "lng": -9.1335
          },
          {
            "time": "~18:30",
            "title": "日落 **Miradouro da Senhora do Monte**",
            "star": true,
            "desc": "全市最高嗰個觀景台，遊客少啲。買支酒上去坐草地睇日落。",
            "note": "",
            "backup": "Miradouro da Graça（行落少少，有得坐有得飲）",
            "pin": "",
            "mapQuery": "Miradouro da Senhora do Monte, Lisboa",
            "mapLabel": "Senhora do Monte",
            "lat": 38.7167,
            "lng": -9.131
          }
        ]
      },
      {
        "id": "d2",
        "date": "2027-04-11",
        "title": "Belém · 河邊",
        "theme": "大航海時代建築 → 蛋撻 → LX Factory",
        "drawRoute": true,
        "mapNote": "Belém 喺市中心以西，15E 電車或者沿河行過去。",
        "stops": [
          {
            "time": "~10:00",
            "title": "**Mosteiro dos Jerónimos** 熱羅尼莫斯修道院",
            "star": true,
            "desc": "曼努埃爾式建築代表作，UNESCO 世遺。迴廊最正。",
            "note": "",
            "backup": "",
            "pin": "早上開門就去，中午之後人山人海",
            "mapQuery": "Mosteiro dos Jerónimos, Lisboa",
            "mapLabel": "修道院",
            "lat": 38.6979,
            "lng": -9.2065
          },
          {
            "time": "~11:30",
            "title": "蛋撻 **Pastéis de Belém**",
            "star": true,
            "desc": "1837 年開，原祖蛋撻。**堂食排隊快過外賣嗰條隊**，入到去有好多間房。灑肉桂粉同糖粉。",
            "note": "",
            "backup": "Manteigaria（市中心，都好好食）",
            "pin": "",
            "mapQuery": "Pastéis de Belém, Lisboa",
            "mapLabel": "蛋撻",
            "lat": 38.6975,
            "lng": -9.2032
          },
          {
            "time": "~13:00",
            "title": "**Torre de Belém** 貝倫塔",
            "star": false,
            "desc": "河口上嘅防禦塔，大航海時代出發點。入面窄，淨係喺外面影相都得。",
            "note": "",
            "backup": "",
            "pin": "",
            "mapQuery": "Torre de Belém, Lisboa",
            "mapLabel": "貝倫塔",
            "lat": 38.6916,
            "lng": -9.216
          },
          {
            "time": "~16:00",
            "title": "**LX Factory** 舊廠房區",
            "star": false,
            "desc": "印刷廠改造嘅文青區，書店、咖啡、小店。返市中心順路。",
            "note": "",
            "backup": "",
            "pin": "星期日有市集",
            "mapQuery": "LX Factory, Lisboa",
            "mapLabel": "LX Factory",
            "lat": 38.7027,
            "lng": -9.1786
          }
        ]
      }
    ],
    "food": {
      "quick": [
        {
          "when": "D1 午餐",
          "name": "Time Out Market",
          "star": true,
          "note": "幾十間攤檔｜備：Mercado de Campo de Ourique"
        },
        {
          "when": "D1 晚餐",
          "name": "Alfama fado 餐廳",
          "star": false,
          "note": "邊食邊聽 fado，記得訂位"
        },
        {
          "when": "D2 早餐",
          "name": "Pastéis de Belém",
          "star": true,
          "note": "原祖蛋撻｜備：Manteigaria"
        },
        {
          "when": "D2 午餐",
          "name": "LX Factory",
          "star": false,
          "note": "廠房區入面好多選擇"
        }
      ],
      "picks": [
        {
          "icon": "🥧",
          "title": "蛋撻 · **Manteigaria**",
          "desc": "市中心分店多，成日見到出爐。企喺吧枱食支咖啡配一個，最地道。",
          "mapQuery": "Manteigaria Lisboa"
        },
        {
          "icon": "🥪",
          "title": "豬扒包 · **Bifana**",
          "desc": "葡式豬扒包，蒜香醬汁。街邊小店最好食，通常 €3–4 一個。",
          "mapQuery": "bifana Lisboa"
        },
        {
          "icon": "🐟",
          "title": "烤沙甸魚 · **sardinha assada**",
          "desc": "6 月聖安東尼節周街都係，其餘時間海鮮餐廳有。配薯仔同沙律。",
          "mapQuery": "sardinha assada Lisboa"
        }
      ],
      "legend": "🌅 **日落觀景台**：D1 Senhora do Monte（買支酒上去坐草地）"
    },
    "notes": "呢個示範行程淨係用公開地標，冇任何酒店、訂位或者私人資料。用嚟睇格式就啱，想開始用就撳「＋ 新行程」，或者匯入你自己嘅 .json。"
  }
];
