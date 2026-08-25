/* data-provider.js — 資料層唯一出入口。
 *
 * ⛔ 全站只有本檔可以碰 localStorage / fetch。牆（app.js）與後台（admin）
 *    一律透過 ABW.provider 存取，違者 scripts/smoke.js 會擋。
 *
 * 兩種實作同介面：
 *   LocalProvider — demo 用，資料只存在使用者自己的瀏覽器。
 *   ApiProvider   — 真後端用，端點契約見 docs/api-contract.md。
 * 切換後端只改本檔最後一行。
 *
 * 介面（全部回傳 Promise）：
 *   init()                          -> void
 *   ensureSeeds(seeds)              -> { added, removed }  // demo 專用，對帳式，見下方說明
 *   getAlias()                      -> { name, hue }
 *   listApproved()                  -> Message[]
 *   listPending()                   -> Message[]      // 後台限定
 *   createMessage(draft)            -> Message        // 一律以 pending 建立
 *   setStatus(id, status)           -> Message        // 後台限定
 *   react(id, reactionId)           -> Message
 *   getKeywords()                   -> KeywordSet
 *   setKeywords(set)                -> KeywordSet     // 後台限定
 */
(function (global) {
  'use strict';

  var ABW = global.ABW = global.ABW || {};
  var S = ABW.schema;

  var STORE_KEY = 'abw.v1';
  /* 16 × 16 = 256 種組合。原本 8 × 8 只有 64 種，60 則種子會大量撞名。 */
  var ALIAS_ADJ = ['安靜的', '晴天的', '海邊的', '深夜的', '溫吞的', '早起的', '走遠的', '躲雨的',
                   '慢慢的', '靠窗的', '轉學的', '愛睡的', '半路的', '收傘的', '沉默的', '遲到的'];
  var ALIAS_NOUN = ['貓', '燈', '船', '風', '石頭', '橘子', '毛衣', '窗',
                    '書包', '影子', '腳踏車', '海', '鉛筆', '鑰匙', '傘', '月台'];

  /* 種子的代號由留言內容決定，不隨機——重建、換裝置都是同一個名字。
   * ⛔ 這不是「假裝有真人」：資料層仍記著 source='sample'，而且只要還有
   *    任何一則虛構種子，G17 就不准部署（裁定 2026-08-24）。
   *    保護從「畫面上的標籤」移到「機器擋上線」，比標籤牢靠。 */
  function seedAlias(body, taken) {
    var h = 0;
    for (var i = 0; i < body.length; i++) h = (h * 31 + body.charCodeAt(i)) >>> 0;
    var a = h % ALIAS_ADJ.length;
    var n = (h >>> 8) % ALIAS_NOUN.length;
    /* 撞名就往下換名詞再換形容詞。同名會讓人以為是同一個人寫的兩則，
     * 而這 60 則刻意是 60 個不同的人。 */
    for (var k = 0; k < ALIAS_ADJ.length * ALIAS_NOUN.length; k++) {
      var name = ALIAS_ADJ[a] + ALIAS_NOUN[n];
      if (!taken || !taken[name]) { if (taken) taken[name] = true; break; }
      n = (n + 1) % ALIAS_NOUN.length;
      if (n === (h >>> 8) % ALIAS_NOUN.length) a = (a + 1) % ALIAS_ADJ.length;
    }
    return { name: ALIAS_ADJ[a] + ALIAS_NOUN[n], hue: (h >>> 16) % 360 };
  }

  function newId() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'm-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
  }

  function nowIso() { return new Date().toISOString(); }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ------------------------------------------------------------------ *
   * LocalProvider
   * ------------------------------------------------------------------ */
  var LocalProvider = (function () {
    function blank() {
      return {
        alias: null,
        messages: [],
        keywords: null
      };
    }

    function read() {
      var raw = global.localStorage.getItem(STORE_KEY);
      if (!raw) return blank();
      try {
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return blank();
        return parsed;
      } catch (e) {
        /* fail-loud：壞資料不要靜默吞掉，讓開發期就看得見 */
        console.error('[ABW] localStorage 內容毀損，已重置本機資料', e);
        return blank();
      }
    }

    function write(db) {
      global.localStorage.setItem(STORE_KEY, JSON.stringify(db));
      return db;
    }

    function find(db, id) {
      for (var i = 0; i < db.messages.length; i++) {
        if (db.messages[i].id === id) return db.messages[i];
      }
      throw new Error('[ABW] 找不到留言 ' + id);
    }

    return {
      name: 'LocalProvider',
      persistent: false,

      init: function () {
        var db = read();
        if (!db.keywords) db.keywords = ABW.defaultKeywords();
        write(db);
        return Promise.resolve();
      },

      /* 種子留言（劇中台詞／虛構示例）在 demo 端以 approved 建立。
       *
       * 這裡做的是**對帳**不是附加：content.seeds 改了之後，舊的種子要跟著消失。
       * 只加不刪的話，回訪者的裝置上會同時留著新舊兩版種子——換素材時一定會踩到。
       * 訪客自己的留言（source=visitor）絕對不動。
       * 真後端由管理者從後台匯入，故 ApiProvider 為 no-op。 */
      ensureSeeds: function (seeds) {
        var db = read();
        var wanted = {};
        (seeds || []).forEach(function (s) { wanted[s.body] = true; });

        var before = db.messages.length;
        db.messages = db.messages.filter(function (m) {
          if (m.source === S.SOURCE.VISITOR) return true;
          return wanted[m.body] === true;
        });
        var removed = before - db.messages.length;

        var existing = {};
        db.messages.forEach(function (m) {
          if (m.source !== S.SOURCE.VISITOR) existing[m.body] = true;
        });
        var added = 0;
        var takenNames = {};
        db.messages.forEach(function (m) { if (m.alias && m.alias.name) takenNames[m.alias.name] = true; });
        (seeds || []).forEach(function (seed, i) {
          if (existing[seed.body]) return;
          if (!seed.attribution) {
            throw new Error('[ABW] 種子留言缺 attribution：' + seed.body.slice(0, 20));
          }
          db.messages.push(S.makeMessage({
            id: 'seed-' + i,
            body: seed.body,
            alias: seedAlias(seed.body, takenNames),
            status: S.STATUS.APPROVED,
            source: seed.source,
            attribution: seed.attribution,
            createdAt: nowIso()
          }));
          added++;
        });
        if (added || removed) write(db);
        return Promise.resolve({ added: added, removed: removed });
      },

      getAlias: function () {
        var db = read();
        if (!db.alias) {
          db.alias = { name: pick(ALIAS_ADJ) + pick(ALIAS_NOUN), hue: Math.floor(Math.random() * 360) };
          write(db);
        }
        return Promise.resolve(db.alias);
      },

      listApproved: function () {
        var db = read();
        return Promise.resolve(db.messages.filter(function (m) {
          return m.status === S.STATUS.APPROVED;
        }));
      },

      listPending: function () {
        var db = read();
        return Promise.resolve(db.messages.filter(function (m) {
          return m.status === S.STATUS.PENDING;
        }));
      },

      createMessage: function (draft) {
        var db = read();
        var msg = S.makeMessage({
          id: newId(),
          body: draft.body,
          alias: draft.alias,
          status: S.STATUS.PENDING,
          flags: draft.flags || [],
          source: draft.source || S.SOURCE.VISITOR,
          attribution: draft.attribution || '',
          createdAt: nowIso()
        });
        db.messages.push(msg);
        write(db);
        return Promise.resolve(msg);
      },

      setStatus: function (id, status) {
        var db = read();
        var msg = find(db, id);
        msg.status = status;
        write(db);
        return Promise.resolve(msg);
      },

      react: function (id, reactionId) {
        if (!S.isReactionId(reactionId)) {
          return Promise.reject(new Error('[ABW] 未定義的回應類型 ' + reactionId));
        }
        var db = read();
        var msg = find(db, id);
        msg.reactions[reactionId] = (msg.reactions[reactionId] || 0) + 1;
        write(db);
        return Promise.resolve(msg);
      },

      getKeywords: function () {
        var db = read();
        return Promise.resolve(db.keywords || ABW.defaultKeywords());
      },

      setKeywords: function (set) {
        var db = read();
        db.keywords = set;
        write(db);
        return Promise.resolve(set);
      }

    };
  })();

  /* ------------------------------------------------------------------ *
   * ApiProvider — 端點與回應形狀見 docs/api-contract.md
   * ------------------------------------------------------------------ */
  var ApiProvider = (function () {
    var BASE = '/api';

    function req(method, path, body) {
      var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
      if (body !== undefined) opts.body = JSON.stringify(body);
      return fetch(BASE + path, opts).then(function (res) {
        if (!res.ok) throw new Error('[ABW] ' + method + ' ' + path + ' -> ' + res.status);
        return res.status === 204 ? null : res.json();
      });
    }

    return {
      name: 'ApiProvider',
      persistent: true,

      init: function () { return Promise.resolve(); },
      /* 真後端的種子留言由管理者從後台匯入，前端不得自行灌資料 */
      ensureSeeds: function () { return Promise.resolve({ added: 0, removed: 0 }); },
      getAlias: function () {
        /* 代號永遠是本機的：即使接了後端也不上傳，維持不可識別 */
        return LocalProvider.getAlias();
      },
      listApproved: function () { return req('GET', '/messages?status=approved'); },
      listPending:  function () { return req('GET', '/messages?status=pending'); },
      createMessage: function (draft) { return req('POST', '/messages', draft); },
      setStatus: function (id, status) { return req('PATCH', '/messages/' + id, { status: status }); },
      react: function (id, reactionId) {
        if (!S.isReactionId(reactionId)) {
          return Promise.reject(new Error('[ABW] 未定義的回應類型 ' + reactionId));
        }
        return req('POST', '/messages/' + id + '/reactions', { reaction: reactionId });
      },
      getKeywords: function () { return req('GET', '/keywords'); },
      setKeywords: function (set) { return req('PUT', '/keywords', set); }
    };
  })();

  ABW.LocalProvider = LocalProvider;
  ABW.ApiProvider = ApiProvider;

  /* ==== 切換後端只改這一行 ==== */
  ABW.provider = LocalProvider;
})(window);
