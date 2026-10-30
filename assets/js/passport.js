/* Travel Marvel · the passport
 *
 * Every journey you have made, on one page: a map with the routes, the
 * flags of the countries, and the numbers — how many journeys, how far,
 * how long on the move.
 *
 * Two kinds of journey:
 *   - entered by hand, for anything before this app (or outside it);
 *   - worked out from your trips, once their dates have passed: the
 *     flights written in the trip (their airport codes), or, for a trip
 *     with none, a round trip from your home city to its destination.
 *     These are not stored — they are read from the trips every time, so
 *     editing a trip's flights updates the passport. Removing one hides
 *     it; editing one turns it into a hand-entered journey that replaces it.
 *
 * Places come from data/places.js (every airport with an IATA code) and
 * the map from data/world.js. Both are loaded only when the passport is
 * opened, so the rest of the app pays nothing for them.
 */
(function (global) {
  'use strict';

  var esc = U.esc;
  var KEY = 'tripbook.passport';

  /* --- what is stored -------------------------------------------------- */

  function blank() {
    return { name: '', home: null, journeys: [], hidden: {}, touchedAt: '' };
  }

  function raw() {
    try {
      var p = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!p || typeof p !== 'object') return blank();
      var b = blank();
      Object.keys(b).forEach(function (k) { if (p[k] == null) p[k] = b[k]; });
      if (!Array.isArray(p.journeys)) p.journeys = [];
      return p;
    } catch (e) { return blank(); }
  }

  function write(p, fromSync) {
    if (!fromSync) p.touchedAt = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify(p)); }
    catch (e) { U.toast('儲存唔到護照（瀏覽器空間滿咗）', true); return false; }
    if (!fromSync && global.Sync && Sync.enabled()) Sync.soon();
    return true;
  }

  /* --- places ------------------------------------------------------------- */

  var loading = null;
  var byCode = null, list = null, cities = null, towns = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('載入唔到 ' + src)); };
      document.head.appendChild(s);
    });
  }

  /* Map and places arrive together, on first use. Served from the app's
     own cache after the first time, so the passport works offline. */
  function load() {
    if (loading) return loading;
    loading = Promise.all([
      global.TM_PLACES ? null : loadScript('data/places.js'),
      global.TM_WORLD ? null : loadScript('data/world.js'),
      global.TM_CITIES ? null : loadScript('data/cities.js')
    ]).then(function () {
      if (byCode) return;
      /* Towns and cities, biggest first: the list a city is picked from,
         and the list that says which city an airport serves. */
      towns = [];
      String(global.TM_CITIES || '').split('\n').forEach(function (line, i) {
        var f = line.split('|');
        if (f.length < 4) return;
        var nm = cleanCity(f[0]);
        towns.push({ name: nm, cc: f[1], lat: Number(f[2]), lng: Number(f[3]), rank: i, key: fold(nm) });
      });
      byCode = {}; list = []; cities = {};
      String(global.TM_PLACES || '').split('\n').forEach(function (line) {
        var f = line.split('|');
        if (f.length < 6) return;
        var p = { code: f[0], name: f[1], city: f[2], cc: f[3], lat: Number(f[4]), lng: Number(f[5]) };
        p.key = fold(p.city + ' ' + p.name + ' ' + p.code);
        byCode[p.code] = p;
        list.push(p);
        /* A city is represented by its busiest-sounding airport: one
           called "International" beats a heliport of the same city. */
        var ck = fold(p.city) + '|' + p.cc;
        var cur = cities[ck];
        if (!cur || (/international/i.test(p.name) && !/international/i.test(cur.name))) cities[ck] = p;
      });
    });
    loading.catch(function () { loading = null; });
    return loading;
  }

  function fold(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  /* People type Chinese place names; the data is in English. */
  var ALIAS = {
    '香港': 'Hong Kong', '澳門': 'Macau', '台北': 'Taipei', '臺北': 'Taipei', '高雄': 'Kaohsiung', '台中': 'Taichung',
    '東京': 'Tokyo', '大阪': 'Osaka', '名古屋': 'Nagoya', '福岡': 'Fukuoka', '札幌': 'Sapporo', '沖繩': 'Okinawa', '那霸': 'Naha',
    '首爾': 'Seoul', '釜山': 'Busan', '濟州': 'Jeju', '曼谷': 'Bangkok', '清邁': 'Chiang Mai', '布吉': 'Phuket',
    '新加坡': 'Singapore', '吉隆坡': 'Kuala Lumpur', '峇里': 'Denpasar', '胡志明': 'Ho Chi Minh', '河內': 'Hanoi', '峴港': 'Da Nang',
    '馬尼拉': 'Manila', '宿霧': 'Cebu', '北京': 'Beijing', '上海': 'Shanghai', '廣州': 'Guangzhou', '深圳': 'Shenzhen',
    '成都': 'Chengdu', '重慶': 'Chongqing', '西安': "Xi'an", '杭州': 'Hangzhou', '廈門': 'Xiamen',
    '倫敦': 'London', '曼徹斯特': 'Manchester', '愛丁堡': 'Edinburgh', '都柏林': 'Dublin', '巴黎': 'Paris', '尼斯': 'Nice',
    '里昂': 'Lyon', '波爾多': 'Bordeaux', '羅馬': 'Rome', '米蘭': 'Milan', '威尼斯': 'Venice', '佛羅倫斯': 'Florence', '拿坡里': 'Naples',
    '巴塞隆拿': 'Barcelona', '馬德里': 'Madrid', '馬拉加': 'Malaga', '塞維利亞': 'Sevilla', '格拉納達': 'Granada', '瓦倫西亞': 'Valencia',
    '里斯本': 'Lisbon', '波爾圖': 'Porto', '阿姆斯特丹': 'Amsterdam', '布魯塞爾': 'Brussels', '柏林': 'Berlin', '慕尼黑': 'Munich',
    '法蘭克福': 'Frankfurt', '蘇黎世': 'Zurich', '日內瓦': 'Geneva', '維也納': 'Vienna', '布拉格': 'Prague', '布達佩斯': 'Budapest',
    '華沙': 'Warsaw', '克拉科夫': 'Krakow', '雅典': 'Athens', '伊斯坦堡': 'Istanbul', '哥本哈根': 'Copenhagen', '斯德哥爾摩': 'Stockholm',
    '奧斯陸': 'Oslo', '赫爾辛基': 'Helsinki', '雷克雅未克': 'Reykjavik', '杜拜': 'Dubai', '多哈': 'Doha', '開羅': 'Cairo',
    '紐約': 'New York', '洛杉磯': 'Los Angeles', '三藩市': 'San Francisco', '西雅圖': 'Seattle', '芝加哥': 'Chicago',
    '溫哥華': 'Vancouver', '多倫多': 'Toronto', '悉尼': 'Sydney', '墨爾本': 'Melbourne', '布里斯本': 'Brisbane',
    '奧克蘭': 'Auckland', '昆士頓': 'Queenstown',
    '京都': 'Kyoto', '奈良': 'Nara', '神戶': 'Kobe', '橫濱': 'Yokohama', '廣島': 'Hiroshima', '金澤': 'Kanazawa',
    '仙台': 'Sendai', '函館': 'Hakodate', '長崎': 'Nagasaki', '熊本': 'Kumamoto', '鹿兒島': 'Kagoshima', '小樽': 'Otaru',
    '大邱': 'Daegu', '慶州': 'Gyeongju', '台南': 'Tainan', '臺南': 'Tainan', '花蓮': 'Hualien', '新竹': 'Hsinchu',
    '桂林': 'Guilin', '蘇州': 'Suzhou', '南京': 'Nanjing', '青島': 'Qingdao', '昆明': 'Kunming', '麗江': 'Lijiang',
    '珠海': 'Zhuhai', '武漢': 'Wuhan', '長沙': 'Changsha', '天津': 'Tianjin', '大連': 'Dalian', '哈爾濱': 'Harbin',
    '馬六甲': 'Malacca', '檳城': 'Penang', '蘭卡威': 'Langkawi', '亞庇': 'Kota Kinabalu', '芭堤雅': 'Pattaya', '蘇梅': 'Koh Samui',
    '暹粒': 'Siem Reap', '金邊': 'Phnom Penh', '仰光': 'Yangon', '加德滿都': 'Kathmandu', '德里': 'Delhi', '孟買': 'Mumbai',
    '布魯日': 'Bruges', '塞維爾': 'Sevilla', '科隆': 'Cologne', '紐倫堡': 'Nuremberg', '琉森': 'Lucerne', '因特拉肯': 'Interlaken',
    '薩爾斯堡': 'Salzburg', '海德堡': 'Heidelberg', '比薩': 'Pisa', '維羅納': 'Verona', '博洛尼亞': 'Bologna', '都靈': 'Turin',
    '尼斯': 'Nice', '馬賽': 'Marseille', '史特拉斯堡': 'Strasbourg', '牛津': 'Oxford', '劍橋': 'Cambridge', '巴斯': 'Bath',
    '約克': 'York', '利物浦': 'Liverpool', '布萊頓': 'Brighton', '格拉斯哥': 'Glasgow', '卑爾根': 'Bergen', '哥德堡': 'Gothenburg',
    '鹿特丹': 'Rotterdam', '安特衛普': 'Antwerp', '根特': 'Ghent', '盧森堡': 'Luxembourg', '布拉提斯拉瓦': 'Bratislava',
    '杜布羅夫尼克': 'Dubrovnik', '馬拉喀什': 'Marrakech', '開普敦': 'Cape Town', '溫哥華島': 'Victoria',
    '拉斯維加斯': 'Las Vegas', '夏威夷': 'Honolulu', '檀香山': 'Honolulu', '波士頓': 'Boston', '華盛頓': 'Washington',
    '坎昆': 'Cancun', '墨西哥城': 'Mexico City', '利馬': 'Lima', '庫斯科': 'Cusco', '布宜諾斯艾利斯': 'Buenos Aires'
  };

  /* The city a point belongs to, as a traveller would name it: the
     biggest town within 70 km. So Narita reads Tokyo, New Chitose reads
     Sapporo, Gatwick reads London — an airport and a city entered for the
     same trip come out the same. A place that is a big city in its own
     right (Oakland beside San Francisco) keeps its own name. */
  var metroCache = {};
  function metroOf(lat, lng, own) {
    if (!towns || lat == null || lng == null) return '';
    var k = lat.toFixed(2) + ',' + lng.toFixed(2) + '|' + (own || '');
    if (metroCache[k] != null) return metroCache[k];
    var best = null, ownTown = null;
    var lim = 70000, ownName = fold(cleanCity(own));
    for (var i = 0; i < towns.length; i++) {
      var t = towns[i];
      if (Math.abs(t.lat - lat) > 0.7 || Math.abs(t.lng - lng) > 1.1) continue;
      var m = U.metresBetween(t, { lat: lat, lng: lng });
      if (m > lim) continue;
      if (!best) best = t;                       /* towns are biggest first */
      if (ownName && t.key === ownName && m < 30000) { ownTown = t; break; }
    }
    /* Ranked in the top 1,500 (roughly 400,000 people and up): a city in
       its own right, named as itself. */
    var name = ownTown && ownTown.rank < 1500 ? ownTown.name : best ? best.name : cleanCity(own);
    metroCache[k] = name;
    return name;
  }

  /* The data's city names are sometimes two towns at once —
     "Chitose / Tomakomai", "Bordeaux/Merignac". The first is the one
     anyone would say. */
  function cleanCity(c) {
    return String(c || '').split('/')[0].replace(/\s+/g, ' ').trim()
      /* Japanese municipalities carry their official suffix: Nara-shi. */
      .replace(/-(shi|ku|machi)$/i, '');
  }

  function toPlace(p, kind) {
    if (kind === 'town') return { label: p.name, code: '', city: p.name, cc: p.cc, lat: p.lat, lng: p.lng };
    var city = metroOf(p.lat, p.lng, p.city) || cleanCity(p.city);
    return { label: kind === 'city' ? city : p.code + ' · ' + city, code: kind === 'city' ? '' : p.code,
      city: city, cc: p.cc, lat: p.lat, lng: p.lng };
  }

  /* What a stored place is called now: an airport by the city it serves
     (journeys saved before that rule existed included), anything else by
     its own name, cleaned. */
  function cityName(p) {
    if (!p) return '';
    if (p.code && byCode && byCode[p.code]) {
      var a = byCode[p.code];
      return metroOf(a.lat, a.lng, a.city) || cleanCity(a.city);
    }
    return cleanCity(p.city || p.label);
  }

  /* Suggestions for what has been typed: an exact airport code first,
     then cities, then airports by name. Assumes load() has resolved. */
  /* English names the GeoNames data spells the local way. */
  var EXONYM = {
    'bruges': 'brugge', 'seville': 'sevilla', 'cologne': 'koln', 'nuremberg': 'nurnberg', 'lucerne': 'luzern',
    'gothenburg': 'goteborg', 'antwerp': 'antwerpen', 'ghent': 'gent', 'marrakech': 'marrakesh',
    'penang': 'george town', 'the hague': 'den haag', 'florence': 'florence', 'saigon': 'ho chi minh city',
    'bombay': 'mumbai', 'peking': 'beijing', 'canton': 'guangzhou', 'leghorn': 'livorno', 'genoa': 'genoa'
  };

  /* Suggestions for what has been typed: an exact airport code first,
     then towns and cities (biggest first), then airports by name or city.
     Assumes load() has resolved. */
  function search(q, limit) {
    q = String(q || '').trim();
    if (!q || !list) return [];
    limit = limit || 8;
    var out = [], seen = {};
    function add(p, kind, typedName) {
      var k = kind === 'airport' ? 'a' + p.code : 'c' + fold(kind === 'town' ? p.name : p.city) + p.cc;
      if (seen[k] || out.length >= limit) return;
      seen[k] = true;
      var place = toPlace(p, kind);
      /* Typed "Bruges", found Brugge: show the name that was typed. */
      if (typedName && kind === 'town') { place.label = typedName; place.city = typedName; }
      out.push({ kind: kind, place: place,
        sub: kind === 'airport' ? p.name : countryName(p.cc) });
    }
    var up = q.toUpperCase();
    if (/^[A-Z]{3}$/.test(up) && byCode[up]) add(byCode[up], 'airport');

    var term = fold(ALIAS[q] || q);
    var exo = EXONYM[term];
    if (exo && exo !== term) {
      for (var e = 0; e < towns.length; e++) {
        if (towns[e].key === exo) { var said = ALIAS[q] || q;
          add(towns[e], 'town', said.charAt(0).toUpperCase() + said.slice(1)); break; }
      }
    }
    /* "Porto" is Porto before Porto Alegre, however much bigger that is. */
    for (var x = 0; x < towns.length && out.length < Math.min(limit, 5); x++) {
      if (towns[x].key === term) add(towns[x], 'town');
    }
    for (var t = 0; t < towns.length && out.length < Math.min(limit, 5); t++) {
      if (towns[t].key.indexOf(term) === 0) add(towns[t], 'town');
    }
    for (var i = 0; i < list.length && out.length < limit; i++) {
      if (fold(list[i].city).indexOf(term) === 0) add(list[i], 'airport');
    }
    for (var j = 0; j < list.length && out.length < limit; j++) {
      if (list[j].key.indexOf(term) >= 0) add(list[j], 'airport');
    }
    return out;
  }

  /* Anywhere the lists do not have — a village, an island — from
     OpenStreetMap, online only. Names come back in English to match. */
  function searchOnline(q) {
    var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&accept-language=en&q=' +
      encodeURIComponent(q);
    return fetch(url, { headers: { 'Accept': 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('搵唔到（' + r.status + '）');
      return r.json();
    }).then(function (rows) {
      return (rows || []).map(function (r) {
        var a = r.address || {};
        var name = r.name || String(r.display_name || '').split(',')[0];
        var cc = String(a.country_code || '').toUpperCase();
        return { kind: 'online', sub: [a.state || a.region || a.county, a.country].filter(Boolean).join(', '),
          place: { label: name, code: '', city: name, cc: cc, lat: Number(r.lat), lng: Number(r.lon) } };
      }).filter(function (h) { return h.place.label && isFinite(h.place.lat) && isFinite(h.place.lng); });
    });
  }

  /* The country a coordinate is in, near enough: the country of the
     closest airport. Used for trip destinations, which carry a point
     but not a country. */
  function nearest(lat, lng) {
    if (!list || lat == null || lng == null) return null;
    var best = null, bd = Infinity;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var d = (p.lat - lat) * (p.lat - lat) + (p.lng - lng) * (p.lng - lng);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  var regionNames = null;
  function countryName(cc) {
    try {
      if (!regionNames && Intl.DisplayNames) regionNames = new Intl.DisplayNames(['zh-HK', 'zh-TW', 'en'], { type: 'region' });
      return regionNames ? regionNames.of(cc) : cc;
    } catch (e) { return cc; }
  }

  function flag(cc) {
    if (!/^[A-Z]{2}$/.test(cc || '')) return '';
    return String.fromCodePoint(0x1F1E6 + cc.charCodeAt(0) - 65, 0x1F1E6 + cc.charCodeAt(1) - 65);
  }

  /* --- journeys -------------------------------------------------------- */

  var MODES = {
    flight: { icon: '✈️', label: '飛機', kmh: 780, extra: 40 },
    train:  { icon: '🚆', label: '火車', kmh: 120, extra: 10 },
    bus:    { icon: '🚌', label: '巴士', kmh: 65,  extra: 10 },
    ferry:  { icon: '⛴️', label: '船',   kmh: 30,  extra: 20 },
    car:    { icon: '🚗', label: '自駕', kmh: 75,  extra: 0 }
  };

  function km(j) {
    var m = U.metresBetween(j.from, j.to);
    return m == null ? 0 : m / 1000;
  }

  /* Minutes on the move: what you entered, else an honest estimate from
     the distance and the kind of transport. */
  function minutes(j) {
    if (j.minutes != null && j.minutes > 0) return j.minutes;
    var m = MODES[j.mode] || MODES.flight;
    return Math.round(km(j) / m.kmh * 60 + m.extra);
  }

  function todayISO() { return U.todayISO(); }

  /* "去程 · 五 18/9", "18/9", "2027-09-18" — a flight's date as written
     in a trip, read in the year of the trip. */
  function flightDate(when, trip) {
    var s = String(when || '');
    var iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[0];
    var dm = s.match(/(\d{1,2})\/(\d{1,2})/);
    var start = U.parseISODate(trip.startDate);
    if (!dm || !start) return '';
    var d = Number(dm[1]), mo = Number(dm[2]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    var y = start.getFullYear() + (mo < start.getMonth() + 1 ? 1 : 0);
    return y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
  }

  function codesIn(text) {
    var out = [];
    String(text || '').replace(/\b[A-Z]{3}\b/g, function (c) {
      if (byCode && byCode[c] && out[out.length - 1] !== c) out.push(c);
      return c;
    });
    return out;
  }

  /* Journeys a trip implies, once they have happened. */
  function fromTrip(trip, home) {
    var today = todayISO();
    if (!trip.startDate || trip.startDate > today) return [];
    var legs = [];

    trip.flights.forEach(function (f, i) {
      var text = [f.route, f.when, f.note].join(' ');
      var codes = codesIn(text);
      if (codes.length < 2) return;
      var date = flightDate(f.when, trip) ||
        (i === 0 ? trip.startDate : (i === trip.flights.length - 1 ? trip.endDate : trip.startDate));
      if (!date || date > today) return;
      /* A flight number: two-character airline code and up to four digits,
         not followed by a colon — "D3 09:15" is a day and a time. */
      var fn = text.match(/\b([A-Z][A-Z0-9]|[A-Z0-9][A-Z])\s?(\d{1,4})(?![\d:])\b/);
      legs.push({
        key: 'trip:' + trip.id + ':f' + i, auto: true, tripId: trip.id, tripTitle: trip.title,
        from: toPlace(byCode[codes[0]], 'airport'), to: toPlace(byCode[codes[codes.length - 1]], 'airport'),
        date: date, mode: 'flight', airline: fn ? fn[1] : '', flightNo: fn ? fn[1] + fn[2] : '',
        minutes: null, note: ''
      });
    });
    if (legs.length) return legs;

    /* No flights written: home to the destination and back, if both are
       known. The kind of transport is a guess from the distance and says so. */
    var p = trip.place || {};
    if (!home || p.lat == null || p.lng == null) return [];
    var near = nearest(p.lat, p.lng);
    /* Named after the nearest airport's city, in English like every other
       place in the passport; the trip's own name (often Chinese) only when
       no airport is close enough to speak for it. */
    var name = metroOf(p.lat, p.lng, '') || (p.name || trip.title);
    var dest = { label: name, code: '', city: name, cc: near ? near.cc : '', lat: p.lat, lng: p.lng };
    var dist = U.metresBetween(home, dest) / 1000;
    if (dist < 30) return [];
    var mode = dist > 600 ? 'flight' : 'train';
    var out = [{ key: 'trip:' + trip.id + ':out', auto: true, guessed: true, tripId: trip.id, tripTitle: trip.title,
      from: home, to: dest, date: trip.startDate, mode: mode, airline: '', flightNo: '', minutes: null, note: '' }];
    if (trip.endDate && trip.endDate <= today) {
      out.push({ key: 'trip:' + trip.id + ':back', auto: true, guessed: true, tripId: trip.id, tripTitle: trip.title,
        from: dest, to: home, date: trip.endDate, mode: mode, airline: '', flightNo: '', minutes: null, note: '' });
    }
    return out;
  }

  /* Everything, newest first: hand-entered journeys, plus what the trips
     imply minus those hidden or replaced by an edit. */
  function all() {
    var p = raw();
    var replaced = {};
    p.journeys.forEach(function (j) { if (j.autoKey) replaced[j.autoKey] = true; });
    var auto = [];
    if (byCode) {
      Store.all().forEach(function (t) {
        fromTrip(t, p.home).forEach(function (j) {
          if (!p.hidden[j.key] && !replaced[j.key]) auto.push(j);
        });
      });
    }
    return p.journeys.concat(auto).sort(function (a, b) {
      return String(b.date).localeCompare(String(a.date));
    });
  }

  /* Legs into trips. A trip runs from leaving somewhere until you are
     back there: HKG → Singapore → Malacca → Singapore → HKG is one trip of
     four legs, and a return flight is one trip of two, not two trips.
     A leg continues the trip when it leaves from where the last one
     arrived (within 80 km, so Gatwick counts as Heathrow) and within 60
     days; legs worked out from one Travel Marvel trip always belong
     together. A leg that never comes back is a trip of its own. */
  function sameCity(a, b) {
    var m = U.metresBetween(a, b);
    return m != null && m < 80000;
  }

  function daysBetween(a, b) {
    var x = U.parseISODate(a), y = U.parseISODate(b);
    return x && y ? Math.round((y - x) / 86400000) : 9999;
  }

  function groupTrips(legs) {
    var asc = legs.slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    var trips = [], cur = null;
    asc.forEach(function (l) {
      var joins = cur && cur.open && (
        (l.tripId && cur.tripId === l.tripId) ||
        (sameCity(l.from, cur.legs[cur.legs.length - 1].to) &&
         daysBetween(cur.legs[cur.legs.length - 1].date, l.date) <= 60 &&
         (!l.tripId || !cur.tripId || l.tripId === cur.tripId)));
      if (joins) cur.legs.push(l);
      else {
        cur = { legs: [l], open: true, tripId: l.tripId || '' };
        trips.push(cur);
      }
      if (sameCity(l.to, cur.legs[0].from)) cur.open = false;
    });
    trips.forEach(function (t) {
      t.start = t.legs[0].date;
      t.end = t.legs[t.legs.length - 1].date;
      t.origin = t.legs[0].from;
      /* Where it went: every stop that is not the place it started. */
      var seen = {};
      t.places = [];
      t.legs.forEach(function (l) {
        var k = fold(cityName(l.to)) + l.to.cc;
        if (sameCity(l.to, t.origin) || seen[k]) return;
        seen[k] = true;
        t.places.push(l.to);
      });
    });
    return trips.reverse();
  }

  function years(js) {
    var y = {};
    js.forEach(function (j) { if (j.date) y[j.date.slice(0, 4)] = true; });
    return Object.keys(y).sort().reverse();
  }

  /* Days away, counted as the trip headers count them (first to last
     day, both included). Trips that overlap share their days rather
     than counting them twice. */
  function travelDays(trips) {
    var spans = trips.map(function (t) {
      var a = U.parseISODate(t.start), b = U.parseISODate(t.end);
      return a && b ? [a.getTime(), b.getTime()] : null;
    }).filter(Boolean).sort(function (x, y) { return x[0] - y[0]; });
    var total = 0, cur = null;
    spans.forEach(function (sp) {
      if (cur && sp[0] <= cur[1] + 86400000 / 2) { cur[1] = Math.max(cur[1], sp[1]); return; }
      if (cur) total += Math.round((cur[1] - cur[0]) / 86400000) + 1;
      cur = sp.slice();
    });
    if (cur) total += Math.round((cur[1] - cur[0]) / 86400000) + 1;
    return total;
  }

  function stats(js) {
    var trips = groupTrips(js);
    var s = { n: trips.length, days: travelDays(trips), legs: js.length, km: 0, min: 0, countries: [], airports: {}, cities: {},
      modes: {}, first: '' };
    var cc = {};
    js.slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); }).forEach(function (j) {
      s.km += km(j);
      s.min += minutes(j);
      [j.from, j.to].forEach(function (p) {
        if (p.cc && !cc[p.cc]) { cc[p.cc] = true; s.countries.push(p.cc); }
        if (p.code) s.airports[p.code] = true;
        var cn = cityName(p);
        if (cn) s.cities[fold(cn) + p.cc] = true;
      });
      s.modes[j.mode] = (s.modes[j.mode] || 0) + 1;
      if (!s.first || j.date < s.first) s.first = j.date;
    });
    s.airports = Object.keys(s.airports).length;
    s.cities = Object.keys(s.cities).length;
    return s;
  }

  /* --- changing it ------------------------------------------------------- */

  function saveJourney(j) {
    var p = raw();
    if (!j.uid) j.uid = U.uid('jr');
    var at = -1;
    p.journeys.forEach(function (x, i) { if (x.uid === j.uid) at = i; });
    var clean = {
      uid: j.uid, from: j.from, to: j.to, date: j.date, mode: MODES[j.mode] ? j.mode : 'flight',
      airline: String(j.airline || '').toUpperCase().slice(0, 3), flightNo: String(j.flightNo || '').toUpperCase(),
      minutes: j.minutes > 0 ? Math.round(j.minutes) : null, note: String(j.note || ''),
      autoKey: j.autoKey || ''
    };
    if (at >= 0) p.journeys[at] = clean; else p.journeys.push(clean);
    return write(p) ? clean : null;
  }

  function remove(j) {
    var p = raw();
    if (j.auto) p.hidden[j.key] = new Date().toISOString();
    else p.journeys = p.journeys.filter(function (x) { return x.uid !== j.uid; });
    return write(p);
  }

  /* Your passport photo: cropped to a passport's 3:4 from the centre and
     kept small (360 × 480 JPEG, a few tens of KB), so it sits in the
     passport record itself and travels with sync — encrypted, like the
     rest — rather than needing a store of its own. */
  function makePhoto(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var W = 360, H = 480, sw = img.naturalWidth, sh = img.naturalHeight;
        var scale = Math.max(W / sw, H / sh);
        var cw = W / scale, ch = H / scale;
        var c = document.createElement('canvas');
        c.width = W; c.height = H;
        c.getContext('2d').drawImage(img, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, W, H);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('讀唔到呢張相')); };
      img.src = url;
    });
  }

  function setPhoto(dataUrl) {
    var p = raw();
    if (dataUrl) p.photo = dataUrl; else delete p.photo;
    return write(p);
  }

  function setHolder(name, home) {
    var p = raw();
    p.name = String(name || '').trim();
    p.home = home || null;
    return write(p);
  }

  /* --- drawing ---------------------------------------------------------------- */

  /* Must match tools/build-passport-data.js. */
  function X(lng) { return (lng + 180) / 360 * 1000; }
  function Y(lat) { return (global.TM_WORLD.north - lat) / 360 * 1000; }

  function arc(a, b, mode) {
    var x1 = X(a.lng), y1 = Y(a.lat), x2 = X(b.lng), y2 = Y(b.lat);
    /* The short way round: a route across the Pacific leaves one edge of
       the map and comes back on the other, so it is drawn twice, shifted
       a whole map-width, and the frame clips the halves. */
    if (x2 - x1 > 500) x2 -= 1000; else if (x1 - x2 > 500) x2 += 1000;
    var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy) || 1;
    var bend = Math.min(len * (mode === 'flight' ? 0.28 : 0.12), 110);
    /* Bow towards the pole, as a great circle does on this projection. */
    var nx = -dy / len, ny = dx / len;
    if (ny > 0) { nx = -nx; ny = -ny; }
    var cx = (x1 + x2) / 2 + nx * bend, cy = (y1 + y2) / 2 + ny * bend;
    var d = 'M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + 'Q' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1);
    var cls = 'pp-arc' + (mode === 'flight' ? '' : ' ground');
    var out = '<path class="' + cls + '" d="' + d + '"/>';
    if (x2 < 0 || x2 > 1000) {
      var shift = x2 < 0 ? 1000 : -1000;
      out += '<path class="' + cls + '" transform="translate(' + shift + ' 0)" d="' + d + '"/>';
    }
    return out;
  }

  function mapSVG(js, visited, home) {
    var W = global.TM_WORLD, h = W.h;
    var land = Object.keys(W.countries).map(function (cc) {
      return '<path d="' + W.countries[cc] + '" class="' + (visited[cc] ? 'pp-land on' : 'pp-land') + '">' +
        '<title>' + esc(countryName(cc)) + '</title></path>';
    }).join('');

    var routes = {}, arcs = '', dots = {};
    js.forEach(function (j) {
      var k = [j.from.lat, j.from.lng, j.to.lat, j.to.lng, j.mode].join(',');
      if (!routes[k]) { routes[k] = true; arcs += arc(j.from, j.to, j.mode); }
      [j.from, j.to].forEach(function (p) { dots[p.lat + ',' + p.lng] = p; });
    });
    var pts = Object.keys(dots).map(function (k) {
      var p = dots[k];
      var isHome = home && Math.abs(home.lat - p.lat) < 0.05 && Math.abs(home.lng - p.lng) < 0.05;
      return '<circle class="pp-pt' + (isHome ? ' home' : '') + '" cx="' + X(p.lng).toFixed(1) + '" cy="' + Y(p.lat).toFixed(1) +
        '" r="' + (isHome ? 4.6 : 3.2) + '"><title>' + esc(p.label || p.city) + '</title></circle>';
    }).join('');

    return '<svg class="pp-map" viewBox="0 0 1000 ' + h + '" role="img" aria-label="去過嘅地方同路線">' +
      '<defs>' +
        '<pattern id="pp-dot" width="5.5" height="5.5" patternUnits="userSpaceOnUse">' +
          '<circle cx="2.75" cy="2.75" r="1.35" class="pp-dotfill"/></pattern>' +
        '<pattern id="pp-dot-on" width="5.5" height="5.5" patternUnits="userSpaceOnUse">' +
          '<circle cx="2.75" cy="2.75" r="1.9" class="pp-dotfill on"/></pattern>' +
      '</defs>' +
      '<g class="pp-world">' + land + '</g><g class="pp-routes">' + arcs + '</g><g>' + pts + '</g></svg>';
  }

  var MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  function mrzDate(iso) {
    var d = U.parseISODate(iso);
    return d ? ('0' + d.getDate()).slice(-2) + MON[d.getMonth()] + String(d.getFullYear()).slice(-2) : '';
  }
  function mrzLine(s) {
    s = s.toUpperCase().replace(/[^A-Z0-9<@.]/g, '<');
    while (s.length < 44) s += '<';
    return s.slice(0, 44);
  }

  /* The machine-readable lines at the foot of a real passport, in the
     same spirit: the year, your name, when you began, where you issue
     from. Names that are not in Latin letters read as TRAVELLER, as a
     real MRZ would need them transliterated. */
  function mrz(p, year, s) {
    var name = String(p.name || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/[^A-Z]+/g, '<').replace(/^<|<$/g, '') || 'TRAVELLER';
    var homeCode = p.home ? (p.home.code || fold(p.home.city).slice(0, 3)).toUpperCase() : 'XXX';
    /* Filled out to 44 characters in the middle, so the end of each
       line is always printed whatever the length of the name. */
    function line(head, tail) {
      head = head.slice(0, 44 - tail.length - 1);
      return mrzLine(head + new Array(Math.max(1, 45 - head.length - tail.length)).join('<') + tail);
    }
    return [
      line((year || 'ALL') + '<<' + name.slice(0, 18) + '<<MEMBER' + (s.first ? mrzDate(s.first) : ''), '@TRAVELMARVEL'),
      line('ISSUED' + mrzDate(todayISO()) + '<<' + homeCode.slice(0, 3), 'TRAVELMARVEL<<')
    ];
  }

  function hm(min) {
    var h = Math.floor(min / 60), m = min % 60;
    return '<b>' + h.toLocaleString('en') + '</b><small>h</small> <b>' + m + '</b><small>m</small>';
  }

  function numKM(n) { return Math.round(n).toLocaleString('en'); }

  /* One layout for every place, whichever way it was entered: the city
     in English on top, then the airport code (if any) and the country in
     Chinese. Fixed columns, so the arrows line up down the list. */
  function placeHTML(p) {
    var city = cityName(p);
    var sub = [p.code, countryName(p.cc)].filter(Boolean).join(' · ');
    return '<span class="pj-place"><b>' + esc(city) + '</b><small>' + esc(sub) + '</small></span>';
  }

  /* The whole row is the edit button: on a phone the column a ✏️ took
     was the room the city names needed. */
  function journeyRow(j) {
    var m = MODES[j.mode] || MODES.flight;
    var label = '改：' + cityName(j.from) + ' 去 ' + cityName(j.to) + '，' + (j.date || '');
    return '<li><button class="pj" data-act="pj-edit" data-key="' + esc(j.auto ? j.key : j.uid) + '" aria-label="' + esc(label) + '">' +
      '<span class="pj-mode" aria-hidden="true">' + m.icon + '</span>' +
      placeHTML(j.from) + '<span class="pj-arrow" aria-hidden="true">→</span>' + placeHTML(j.to) +
      '<span class="pj-meta">' + esc(String(j.date || '').slice(5).replace('-', '/')) +
        '<small>' + numKM(km(j)) + ' km</small>' +
        (j.flightNo ? '<small>' + esc(j.flightNo) + '</small>' : '') +
        (j.auto ? '<small class="pj-auto">' + (j.guessed ? '行程估計' : '由行程') + '</small>' : '') + '</span>' +
      '</button></li>';
  }

  /* Trips open by tap; which ones are open is kept for the session, so
     a repaint after an edit leaves them as they were. */
  var openTrips = {};
  function tripKey(t) {
    var j = t.legs[0];
    return t.start + '|' + (j.auto ? j.key : j.uid);
  }
  function setTripOpen(key, on) {
    if (on) openTrips[key] = true; else delete openTrips[key];
  }

  /* Collapsed, a trip is one line: flags, where, when. A long trip names
     its first two places and counts the rest in a pill, rather than
     trailing off in "…"; opened, it lists every stop in order. */
  function tripHTML(t) {
    var names = t.places.map(cityName);
    if (!names.length) names = [cityName(t.legs[0].to)];
    var shown = names.slice(0, names.length > 3 ? 2 : 3);
    var more = names.length - shown.length;
    var flags = [];
    t.places.forEach(function (p) { var f = flag(p.cc); if (f && flags.indexOf(f) < 0) flags.push(f); });
    var days = daysBetween(t.start, t.end) + 1;
    var when = t.start === t.end ? t.start : t.start + ' – ' + (t.end.slice(0, 4) === t.start.slice(0, 4) ? t.end.slice(5) : t.end);
    var dist = t.legs.reduce(function (a, j) { return a + km(j); }, 0);
    var stops = [cityName(t.origin)].concat(names);
    if (!t.open) stops.push(cityName(t.origin));
    var key = tripKey(t);
    return '<li><details class="pt" data-trip="' + esc(key) + '"' + (openTrips[key] ? ' open' : '') + '>' +
      '<summary class="pt-head">' +
        '<span class="pt-flags" aria-hidden="true">' + flags.slice(0, 4).join('') + '</span>' +
        '<span class="pt-title">' + esc(shown.join(' · ')) +
          (more ? ' <span class="pt-more" aria-label="仲有 ' + more + ' 個地方">+' + more + '</span>' : '') + '</span>' +
        '<span class="pt-chev" aria-hidden="true"></span>' +
        '<span class="pt-when">' + esc(when) + (days > 1 ? ' · ' + days + ' 日' : '') + ' · ' + t.legs.length + ' 段 · ' +
          Math.round(dist).toLocaleString('en') + ' km</span>' +
      '</summary>' +
      (stops.length > 3 ? '<p class="pt-stops">' + stops.map(function (n) { return '<span>' + esc(n) + '</span>'; })
        .join('<i aria-hidden="true">›</i>') + '</p>' : '') +
      '<ul class="pj-list">' + t.legs.map(journeyRow).join('') + '</ul></details></li>';
  }

  /* The whole page. `year` is '' for all time. */
  function viewHTML(year) {
    var p = raw();
    var everything = all();
    /* Years in which a trip began: a trip over New Year is filed under
       the year it left, so the next year must not get an empty tab. */
    var ys = years(groupTrips(everything).map(function (t) { return { date: t.start }; }));
    /* Trips are grouped across all time first, then filtered by the year
       they started — so a trip over New Year stays one trip. */
    var trips = groupTrips(everything);
    if (year) trips = trips.filter(function (t) { return String(t.start).slice(0, 4) === year; });
    var js = [];
    trips.forEach(function (t) { js = js.concat(t.legs); });
    var s = stats(js);
    var visited = {};
    s.countries.forEach(function (c) { visited[c] = true; });
    var homeCode = p.home ? (p.home.code || p.home.city) : '';
    var lines = mrz(p, year, s);

    var tabs = '<nav class="pp-tabs" aria-label="揀年份">' +
      '<button class="pp-tab' + (!year ? ' on' : '') + '" data-act="pp-year" data-year="">全部</button>' +
      ys.map(function (y) {
        return '<button class="pp-tab' + (y === year ? ' on' : '') + '" data-act="pp-year" data-year="' + y + '">' + y + '</button>';
      }).join('') + '</nav>';

    var strip = '<div class="pp-strip" aria-hidden="true">' +
      new Array(4).join('✈ ✈ ✈ ') + (homeCode ? '<b>◉ ' + esc(homeCode) + '</b> ' : '') +
      new Array(6).join('✈ ✈ ') + (homeCode ? '<b>◉ ' + esc(homeCode) + '</b> ' : '') + '✈ ✈ ✈</div>';

    var flags = s.countries.length
      ? '<div class="pp-flags">' + s.countries.map(function (c) {
          return '<span class="pp-flag" title="' + esc(countryName(c)) + '" aria-label="' + esc(countryName(c)) + '">' + flag(c) + '</span>';
        }).join('') + '</div>'
      : '';

    var modes = Object.keys(MODES).filter(function (k) { return s.modes[k]; }).map(function (k) {
      return '<span>' + MODES[k].icon + ' ' + s.modes[k] + '</span>';
    }).join('');

    var book = '<section class="pp-book" aria-label="旅行護照">' + strip +
      '<div class="pp-mapwrap">' + mapSVG(js, visited, p.home) + flags + '</div>' +
      '<div class="pp-perf" aria-hidden="true"></div>' +
      '<div class="pp-page">' +
        '<div class="pp-title"><div><h2>' + (year ? year + ' ' : 'MY ') + 'TRAVEL MARVEL PASSPORT</h2>' +
          '<div class="pp-sub">🛂 PASSPORT · 護照 · PASAPORTE</div></div>' +
          '<button class="pp-photo' + (p.photo ? '' : ' empty') + '" data-act="pp-photo" aria-label="' +
            (p.photo ? '換護照相' : '加護照相') + '">' +
            (p.photo ? '<img src="' + esc(p.photo) + '" alt="">' : '<span aria-hidden="true">📷</span><small>加相</small>') +
          '</button></div>' +
        '<div class="pp-main">' +
          '<div class="pp-big"><b>' + s.n + '</b><span>趟旅程</span></div>' +
          '<dl class="pp-meta">' +
            '<div><dt>持有人</dt><dd>' + esc(p.name || '未填名') + '</dd></div>' +
            '<div><dt>發出地</dt><dd>' + esc(homeCode || '未設定') + '</dd></div>' +
            '<div><dt>發出日期</dt><dd>' + esc(todayISO()) + '</dd></div>' +
            '<div><dt>第一趟旅程</dt><dd>' + esc(s.first || '—') + '</dd></div>' +
          '</dl>' +
        '</div>' +
        '<div class="pp-stats">' +
          '<div><dt>距離</dt><dd><b>' + numKM(s.km) + '</b><small>km</small></dd></div>' +
          '<div><dt>交通時間</dt><dd>' + hm(s.min) + '</dd></div>' +
          '<div><dt>國家</dt><dd><b>' + s.countries.length + '</b></dd></div>' +
          '<div><dt>城市</dt><dd><b>' + s.cities + '</b></dd></div>' +
          '<div><dt>機場</dt><dd><b>' + s.airports + '</b></dd></div>' +
          '<div><dt>旅行日數</dt><dd><b>' + s.days.toLocaleString('en') + '</b><small>日</small></dd></div>' +
        '</div>' +
        (modes ? '<div class="pp-modes">' + modes + '</div>' : '') +
      '</div>' +
      '<div class="pp-mrz" aria-label="機讀區">' + esc(lines[0]) + '<br>' + esc(lines[1]) + '</div>' +
    '</section>';

    var actions = '<div class="pp-actions">' +
      '<button class="btn btn-primary" data-act="pj-add">＋ 加一段旅程</button>' +
      '<button class="btn" data-act="pp-holder">🛂 護照資料</button>' +
      '</div>';

    var hint = !p.home
      ? '<p class="tinynote pp-hint">設定你住邊個城市（「🛂 護照資料」），冇寫機票嘅行程都會自動當係由屋企出發。</p>'
      : '';

    var byYear = {};
    trips.forEach(function (t) { var y = String(t.start).slice(0, 4) || '—'; (byYear[y] = byYear[y] || []).push(t); });
    var listHTML = trips.length
      ? Object.keys(byYear).sort().reverse().map(function (y) {
          var legs = byYear[y].reduce(function (n, t) { return n + t.legs.length; }, 0);
          return '<h3 class="pp-yh">' + esc(y) + '<small>' + byYear[y].length + ' 趟 · ' + legs + ' 段</small></h3>' +
            '<ul class="pt-list">' + byYear[y].map(tripHTML).join('') + '</ul>';
        }).join('')
      : '<div class="card empty"><h2>護照仲係新嘅</h2><p class="tinynote">' +
          '撳「＋ 加一段旅程」記低以前去過嘅地方。之後喺 Travel Marvel 計劃嘅行程，' +
          '日子過咗就會自動蓋印。</p></div>';

    return '<div class="wrap pp">' + tabs + book + actions + hint +
      '<section class="pp-journeys" aria-label="旅程">' + listHTML + '</section></div>';
  }

  /* --- the forms ------------------------------------------------------------ */

  function placeField(id, label, place) {
    return '<div class="f pf"><label for="' + id + '">' + label + '</label>' +
      '<input id="' + id + '" type="text" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false"' +
        ' aria-controls="' + id + '-list" placeholder="城市或者機場代碼，例如 HKG、倫敦"' +
        ' value="' + esc(place ? place.label : '') + '"' +
        (place ? " data-place='" + esc(JSON.stringify(place)) + "'" : '') + '>' +
      '<ul class="pf-list" id="' + id + '-list" role="listbox" hidden></ul></div>';
  }

  function journeySheetHTML(j) {
    var isNew = !j;
    j = j || { mode: 'flight' };
    var dur = j.minutes ? { h: Math.floor(j.minutes / 60), m: j.minutes % 60 } : { h: '', m: '' };
    return '<div class="sheet" id="pj-sheet" aria-labelledby="pj-sheet-h"><div class="sheet-in">' +
      '<div class="sheet-head"><h2 id="pj-sheet-h">' + (isNew ? '＋ 加一段旅程' : '✏️ 改旅程') + '</h2>' +
        '<button class="iconbtn" data-pj="close" aria-label="閂">✕</button></div>' +
      (j.auto ? '<p class="tinynote" style="margin-top:0">呢段係由「' + esc(j.tripTitle || '行程') +
        '」自動計出嚟' + (j.guessed ? '（交通工具係估嘅）' : '') + '。改咗之後會變成你自己記低嘅版本。</p>' : '') +
      '<div class="f"><label>交通</label><div class="kindrow">' +
        Object.keys(MODES).map(function (k) {
          return '<button class="kindb' + (j.mode === k ? ' on' : '') + '" data-mode="' + k + '">' +
            MODES[k].icon + ' ' + MODES[k].label + '</button>';
        }).join('') + '</div></div>' +
      placeField('pj-from', '由', j.from) +
      placeField('pj-to', '去', j.to) +
      '<div class="frow">' +
        '<div class="f"><label for="pj-date">出發日期</label><input id="pj-date" type="date" value="' + esc(j.date || '') + '"></div>' +
        (isNew ? '<div class="f"><label for="pj-back">回程日期 <span class="opt">（來回先填）</span></label>' +
          '<input id="pj-back" type="date"></div>' : '') +
      '</div>' +
      '<div class="frow pj-air">' +
        '<div class="f"><label for="pj-fn">航班 <span class="opt">（可留空）</span></label>' +
          '<input id="pj-fn" type="text" autocomplete="off" placeholder="例如 CX251" value="' + esc(j.flightNo || '') + '"></div>' +
        '<div class="f"><label for="pj-h">用咗幾耐 <span class="opt">（唔填就估）</span></label>' +
          '<div class="pj-dur"><input id="pj-h" type="text" inputmode="numeric" value="' + esc(String(dur.h)) + '" aria-label="小時"><span>時</span>' +
          '<input id="pj-m" type="text" inputmode="numeric" value="' + esc(String(dur.m)) + '" aria-label="分鐘"><span>分</span></div></div>' +
      '</div>' +
      '<div class="jsonerr" id="pj-err" hidden></div>' +
      '<div class="sheet-foot">' +
        (isNew ? '' : '<button class="btn btn-danger" data-pj="delete">刪除</button>') +
        '<button class="btn" data-pj="close">取消</button>' +
        '<button class="btn btn-primary" data-pj="save">儲存</button></div>' +
      '</div></div>';
  }

  function holderSheetHTML() {
    var p = raw();
    return '<div class="sheet" id="ph-sheet" aria-labelledby="ph-sheet-h"><div class="sheet-in">' +
      '<div class="sheet-head"><h2 id="ph-sheet-h">🛂 護照資料</h2>' +
        '<button class="iconbtn" data-ph="close" aria-label="閂">✕</button></div>' +
      '<div class="f"><label for="ph-name">持有人名 <span class="opt">（英文名會印喺護照底部嗰兩行）</span></label>' +
        '<input id="ph-name" type="text" autocomplete="name" value="' + esc(p.name || '') + '"></div>' +
      placeField('ph-home', '住喺邊', p.home) +
      '<div class="f"><label>護照相</label><div class="ph-photo">' +
        (p.photo ? '<img src="' + esc(p.photo) + '" alt="而家嘅護照相">' : '') +
        '<button class="btn btn-sm" data-ph="photo">' + (p.photo ? '換相' : '📷 揀相') + '</button>' +
        (p.photo ? '<button class="btn btn-sm btn-danger" data-ph="nophoto">移除</button>' : '') +
      '</div></div>' +
      '<p class="tinynote">冇寫機票嘅行程，會當係由呢度出發再返嚟。</p>' +
      '<div class="jsonerr" id="ph-err" hidden></div>' +
      '<div class="sheet-foot"><button class="btn" data-ph="close">取消</button>' +
        '<button class="btn btn-primary" data-ph="save">儲存</button></div>' +
      '</div></div>';
  }

  /* The place fields suggest as you type; picking one stores the whole
     place on the input, which is what the form reads back. The last row
     always offers to look further, online, for somewhere the lists do
     not have. */
  function wirePlaceField(input) {
    var listEl = document.getElementById(input.id + '-list');
    var hits = [], active = -1, busy = false, note = '';
    function close() { listEl.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; }
    function rows() {
      var q = input.value.trim();
      var more = q.length >= 2 ? [{ kind: 'more', q: q }] : [];
      return hits.concat(more);
    }
    function choose(i) {
      var h = rows()[i];
      if (!h) return;
      if (h.kind === 'more') { lookOnline(h.q); return; }
      input.value = h.place.label;
      input.setAttribute('data-place', JSON.stringify(h.place));
      close();
    }
    function lookOnline(q) {
      if (busy) return;
      if (navigator.onLine === false) { note = '冇網，連返網先可以喺網上搵'; paint(); return; }
      busy = true; note = '喺網上地圖搵緊「' + q + '」…'; paint();
      searchOnline(q).then(function (found) {
        busy = false;
        hits = found;
        note = found.length ? '' : '網上地圖都搵唔到「' + q + '」，試下英文名或者附近嘅城市';
        active = found.length ? 0 : -1;
        paint();
        input.focus();
      }, function () {
        busy = false; note = '網上搵唔到，遲啲再試'; paint();
      });
    }
    function paint() {
      var all = rows();
      listEl.innerHTML = all.map(function (h, i) {
        if (h.kind === 'more') {
          return '<li role="option" class="pf-more" id="' + input.id + '-o' + i + '" data-i="' + i + '"' +
            (i === active ? ' aria-selected="true"' : '') + '>' +
            '<span class="pf-f">🌐</span><span class="pf-t"><b>喺網上地圖搵「' + esc(h.q) + '」</b>' +
            '<small>' + esc(note || '細鎮、島、景點都搵得到') + '</small></span></li>';
        }
        return '<li role="option" id="' + input.id + '-o' + i + '" data-i="' + i + '"' +
          (i === active ? ' aria-selected="true" class="on"' : '') + '>' +
          '<span class="pf-f">' + flag(h.place.cc) + '</span><span class="pf-t"><b>' + esc(h.place.label) +
          '</b><small>' + esc(h.sub || '') + '</small></span></li>';
      }).join('');
      listEl.hidden = !all.length;
      input.setAttribute('aria-expanded', all.length ? 'true' : 'false');
    }
    input.addEventListener('input', function () {
      input.removeAttribute('data-place');
      hits = search(input.value);
      note = '';
      active = -1;
      paint();
    });
    input.addEventListener('keydown', function (e) {
      if (listEl.hidden) return;
      var n = rows().length;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(n - 1, active + 1); paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); paint(); }
      else if (e.key === 'Enter') { e.preventDefault(); choose(active >= 0 ? active : 0); }
      else if (e.key === 'Escape') { e.stopPropagation(); close(); }
    });
    listEl.addEventListener('mousedown', function (e) {
      var li = e.target.closest('li');
      if (li) { e.preventDefault(); choose(Number(li.getAttribute('data-i'))); }
    });
    input.addEventListener('blur', function () { setTimeout(function () { if (!busy) close(); }, 150); });
  }

  function placeOf(id) {
    var el = document.getElementById(id);
    try { return JSON.parse(el.getAttribute('data-place') || 'null'); } catch (e) { return null; }
  }

  global.Passport = {
    load: load, search: search, all: all, stats: stats, years: years, km: km, minutes: minutes,
    fromTrip: fromTrip, flightDate: flightDate, viewHTML: viewHTML, groupTrips: groupTrips, setTripOpen: setTripOpen, cleanCity: cleanCity, cityName: cityName, searchOnline: searchOnline,
    journeySheetHTML: journeySheetHTML, holderSheetHTML: holderSheetHTML,
    wirePlaceField: wirePlaceField, placeOf: placeOf,
    saveJourney: saveJourney, remove: remove, setHolder: setHolder, setPhoto: setPhoto, makePhoto: makePhoto,
    raw: raw, replace: function (p) { return write(p, true); }, MODES: MODES
  };
})(window);
