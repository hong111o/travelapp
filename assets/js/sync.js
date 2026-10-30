/* Travel Marvel · keeping devices in step through a private GitHub Gist
 *
 * There is no server. Your trips are kept in one secret Gist in your own
 * GitHub account, written and read with a token you paste once on each
 * device. GitHub's "secret" gists are unlisted rather than private —
 * anyone holding the link could open one — so with a passphrase set the
 * file is encrypted here before it leaves the device (AES-GCM, key from
 * PBKDF2), and GitHub only ever stores ciphertext.
 *
 * Merging is per trip: whichever side changed it last wins, using the
 * touchedAt stamp Store puts on every trip a write changes. A delete is
 * remembered (with its time) so the copy still on another device does
 * not bring the trip back — unless that copy was changed after the
 * delete, in which case the change wins and the trip returns.
 *
 * Journal photos and cover photos stay on each device: they are far too
 * big for a Gist, and they are the most private thing in the app.
 */
(function (global) {
  'use strict';

  var API = 'https://api.github.com';
  var FILE = 'travel-marvel.json';
  var K = {
    token: 'tripbook.sync.token',
    pass: 'tripbook.sync.pass',
    gist: 'tripbook.sync.gist',
    at: 'tripbook.sync.at'
  };

  function pref(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k) || '';
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch (e) { /* storage blocked */ }
    return '';
  }

  var state = { state: 'off', message: '', at: pref(K.at) };
  var listeners = [];

  function setState(s, message) {
    state = { state: s, message: message || '', at: pref(K.at) };
    listeners.forEach(function (fn) { try { fn(state); } catch (e) { /* ignore */ } });
  }

  function enabled() { return !!pref(K.token); }

  /* --- GitHub ----------------------------------------------------------- */

  function gh(method, path, body) {
    return fetch(API + path, {
      method: method,
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + pref(K.token),
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (r.status === 401) throw new Error('GitHub token 唔啱或者過咗期，喺「同步」度重新貼過');
      if (r.status === 403) throw new Error('GitHub 拒絕咗 —— token 要有 gist 權限');
      if (r.status === 404) { var e = new Error('not found'); e.status = 404; throw e; }
      if (!r.ok) throw new Error('GitHub 出錯（' + r.status + '）');
      return r.status === 204 ? null : r.json();
    });
  }

  /* Read our file out of a gist response. A file over 1 MB comes back
     truncated, with the full text one request away. */
  function fileText(gist) {
    var f = gist && gist.files && gist.files[FILE];
    if (!f) return Promise.resolve(null);
    if (!f.truncated) return Promise.resolve(f.content);
    return fetch(f.raw_url).then(function (r) {
      if (!r.ok) throw new Error('讀唔到同步檔案');
      return r.text();
    });
  }

  /* The gist this device uses: the remembered one, else the one another
     device already made (found by its file name), else a new one. */
  function findGist() {
    var id = pref(K.gist);
    var tryId = id ? gh('GET', '/gists/' + id).catch(function (e) {
      if (e.status === 404) { pref(K.gist, null); return null; }
      throw e;
    }) : Promise.resolve(null);

    return tryId.then(function (g) {
      if (g) return g;
      return gh('GET', '/gists?per_page=100').then(function (list) {
        var hit = (list || []).filter(function (x) { return x.files && x.files[FILE]; })[0];
        if (!hit) return null;
        pref(K.gist, hit.id);
        return gh('GET', '/gists/' + hit.id);
      });
    });
  }

  /* --- encryption ----------------------------------------------------- */

  var enc = new TextEncoder(), dec = new TextDecoder();

  function b64(buf) {
    var s = '', bytes = new Uint8Array(buf);
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function unb64(str) {
    var s = atob(str), out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function keyFrom(pass, salt) {
    return crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: 210000, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
  }

  function seal(doc) {
    var pass = pref(K.pass);
    var plain = JSON.stringify(doc);
    if (!pass) return Promise.resolve(JSON.stringify({ app: 'travel-marvel', v: 1, enc: false, doc: doc }, null, 1));
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return keyFrom(pass, salt).then(function (key) {
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(plain));
    }).then(function (ct) {
      return JSON.stringify({ app: 'travel-marvel', v: 1, enc: true,
        salt: b64(salt), iv: b64(iv), data: b64(ct) });
    });
  }

  function open(text) {
    if (!text) return Promise.resolve(null);
    var wrap;
    try { wrap = JSON.parse(text); } catch (e) { return Promise.reject(new Error('同步檔案壞咗')); }
    if (!wrap || wrap.app !== 'travel-marvel') return Promise.reject(new Error('同步檔案唔係 Travel Marvel 嘅'));
    if (!wrap.enc) return Promise.resolve(wrap.doc || null);
    var pass = pref(K.pass);
    if (!pass) return Promise.reject(new Error('雲端資料有加密 —— 喺「同步」度填返同一個加密密碼'));
    return keyFrom(pass, unb64(wrap.salt)).then(function (key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(wrap.iv) }, key, unb64(wrap.data));
    }).then(function (pt) {
      return JSON.parse(dec.decode(pt));
    }, function () {
      throw new Error('加密密碼唔啱 —— 要同第一部機用嗰個一樣');
    });
  }

  /* --- merging ---------------------------------------------------------- */

  function stampOf(t) { return (t && (t.touchedAt || t.updatedAt)) || ''; }

  /* Pure: local trips + local tombstones + the remote document in, the
     merged trips and tombstones out, with whether each side changed. */
  function merge(localTrips, localDeleted, remote) {
    var R = (remote && remote.trips) || {};
    var RD = (remote && remote.deleted) || {};
    var L = {};
    localTrips.forEach(function (t) { if (t && t.id) L[t.id] = t; });

    var ids = {};
    Object.keys(L).concat(Object.keys(R), Object.keys(localDeleted), Object.keys(RD))
      .forEach(function (id) { ids[id] = true; });

    var trips = {}, deleted = {};
    Object.keys(ids).forEach(function (id) {
      var l = L[id], r = R[id];
      var gone = [localDeleted[id] || '', RD[id] || ''].sort().pop();
      var keep = !l ? r : !r ? l : (stampOf(r) > stampOf(l) ? r : l);
      if (keep && (!gone || stampOf(keep) > gone)) trips[id] = keep;
      else if (gone) deleted[id] = gone;
    });

    var json = function (o) { return JSON.stringify(o); };
    var localChanged = Object.keys(trips).length !== Object.keys(L).length ||
      Object.keys(trips).some(function (id) { return !L[id] || json(L[id]) !== json(trips[id]); });
    var remoteChanged = !remote ||
      Object.keys(trips).length !== Object.keys(R).length ||
      Object.keys(trips).some(function (id) { return !R[id] || json(R[id]) !== json(trips[id]); }) ||
      json(deleted) !== json(RD);

    return { trips: trips, deleted: deleted, localChanged: localChanged, remoteChanged: remoteChanged };
  }

  function mergePassport(local, remote) {
    var lt = (local && local.touchedAt) || '', rt = (remote && remote.touchedAt) || '';
    if (!remote) return { value: local, localChanged: false, remoteChanged: !!lt };
    if (!local || rt > lt) return { value: remote, localChanged: true, remoteChanged: false };
    return { value: local, localChanged: false, remoteChanged: lt > rt };
  }

  /* --- one round ---------------------------------------------------------- */

  var running = null, again = false;

  function now() {
    if (!enabled()) return Promise.resolve(null);
    if (running) { again = true; return running; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setState('offline', '冇網，上返網會自動同步');
      return Promise.resolve(null);
    }
    setState('syncing');

    running = findGist().then(function (gist) {
      return (gist ? fileText(gist).then(open) : Promise.resolve(null)).then(function (remote) {
        var m = merge(Store.rawAll(), Store.readDeleted(), remote);
        var order = Object.keys(m.trips).map(function (id) { return m.trips[id]; });

        if (m.localChanged) Store.replaceAll(order);
        Store.writeDeleted(m.deleted);

        /* The passport travels as one piece, newest wins, like a trip. */
        var pp = mergePassport(global.Passport ? Passport.raw() : null, remote && remote.passport);
        if (pp.localChanged) Passport.replace(pp.value);

        var pulled = m.localChanged || pp.localChanged;
        if (!m.remoteChanged && !pp.remoteChanged && gist) return { pulled: pulled, pushed: false };
        var doc = { trips: m.trips, deleted: m.deleted, passport: pp.value, at: new Date().toISOString() };
        return seal(doc).then(function (content) {
          var files = {}; files[FILE] = { content: content };
          return gist
            ? gh('PATCH', '/gists/' + gist.id, { files: files })
            : gh('POST', '/gists', { description: 'Travel Marvel 同步（請勿手動修改）', public: false, files: files })
                .then(function (g) { pref(K.gist, g.id); return g; });
        }).then(function () { return { pulled: pulled, pushed: true }; });
      });
    }).then(function (result) {
      pref(K.at, new Date().toISOString());
      setState('ok');
      if (result && result.pulled && typeof global.Sync.onPulled === 'function') global.Sync.onPulled();
      return result;
    }, function (err) {
      setState('error', err && err.message ? err.message : '同步唔到');
      throw err;
    }).then(function (r) {
      running = null;
      if (again) { again = false; return now(); }
      return r;
    }, function (err) {
      running = null;
      again = false;
      throw err;
    });
    return running;
  }

  /* Changes are pushed a few seconds after the last one, so ticking
     through a day's stops is one upload, not ten. */
  var timer = null;
  function soon() {
    if (!enabled()) return;
    clearTimeout(timer);
    timer = setTimeout(function () { now().catch(function () { /* shown in the status */ }); }, 4000);
  }

  function connect(token, passphrase) {
    token = String(token || '').trim();
    if (!/^(gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}$/.test(token)) {
      return Promise.reject(new Error('呢個唔似 GitHub token（應該係 ghp_… 或者 github_pat_… 開頭）'));
    }
    var prevToken = pref(K.token), prevPass = pref(K.pass);
    pref(K.token, token);
    pref(K.pass, passphrase ? String(passphrase) : null);
    return now().catch(function (err) {
      /* A first connection that fails leaves nothing half set up. */
      pref(K.token, prevToken || null);
      pref(K.pass, prevPass || null);
      setState(prevToken ? 'error' : 'off', err.message);
      throw err;
    });
  }

  function disconnect() {
    [K.token, K.pass, K.gist, K.at].forEach(function (k) { pref(k, null); });
    setState('off');
  }

  /* Listeners go on whether or not sync is set up yet, and check when
     they fire, so connecting later needs no reload. */
  function init() {
    window.addEventListener('online', function () { if (enabled()) now().catch(function () {}); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && enabled()) now().catch(function () {});
    });
    if (!enabled()) { setState('off'); return; }
    setState('ok');
    Store.onWrite = soon;
    now().catch(function () { /* shown in the status */ });
  }

  global.Sync = {
    init: init, enabled: enabled, now: now, soon: soon,
    connect: function (token, pass) {
      return connect(token, pass).then(function (r) { Store.onWrite = soon; return r; });
    },
    disconnect: function () { Store.onWrite = null; disconnect(); },
    status: function () { return state; },
    onStatus: function (fn) { listeners.push(fn); },
    gistUrl: function () { var id = pref(K.gist); return id ? 'https://gist.github.com/' + id : ''; },
    encrypted: function () { return !!pref(K.pass); },
    merge: merge, mergePassport: mergePassport,
    onPulled: null
  };
})(window);
