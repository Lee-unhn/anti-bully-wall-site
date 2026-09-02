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
 *   listRejected()                  -> Message[]      // 後台限定，退回不刪除
 *   createMessage(draft)            -> Message        // 狀態由自動審核決定
 *   listMineIds()                   -> string[]       // 本機送出過的留言 id，永不上傳
 *   getSeenReactions() / setSeenReactions(map)         // 同上，永不上傳
 *   rememberMine(id)                -> true
 *   setStatus(id, status)           -> Message        // 後台限定
 *   react(id, reactionId)           -> Message
 *   getViewMode() / setViewMode(mode) -> 'danmaku' | 'board' | null  // 本機偏好
 *   getKeywords()                   -> KeywordSet
 *   setKeywords(set)                -> KeywordSet     // 後台限定
 */
(function (global) {
  'use strict';

  var ABW = global.ABW = global.ABW || {};
  var S = ABW.schema;

  var STORE_KEY = 'abw.v1';
  /* 16 × 16 = 256 種組合。原本 8 × 8 只有 64 種，60 則種子會大量撞名。 */
  /* 代號每次進站重擲（裁定 2026-08-31，Lee），所以組合數要夠大，
   * 否則同一個人連開幾次就會撞到同一個名字，「隨機」看起來像壞掉。
   * 30 x 30 = 900 組。 */
  /* 這一次造訪用的代號。⛔ 只活在記憶體裡，重新整理就換一個。 */
  var sessionAlias = null;

  var ALIAS_ADJ = ['安靜的', '晴天的', '海邊的', '深夜的', '溫吞的', '早起的', '走遠的', '躲雨的',
                   '慢慢的', '靠窗的', '轉學的', '愛睡的', '半路的', '收傘的', '沉默的', '遲到的',
                   '看雲的', '繞路的', '折返的', '低頭的', '數星星的', '忘記帶傘的', '坐後排的',
                   '換座位的', '提早到的', '留到最後的', '不說話的', '愛下雨的', '揹書包的', '走樓梯的'];
  var ALIAS_NOUN = ['貓', '燈', '船', '風', '石頭', '橘子', '毛衣', '窗',
                    '書包', '影子', '腳踏車', '海', '鉛筆', '鑰匙', '傘', '月台',
                    '毛巾', '課本', '公車', '操場', '走廊', '樓梯', '便當', '水壺',
                    '橡皮擦', '外套', '球鞋', '路燈', '午後', '長椅'];

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

      /* ⛔ 代號**每次進站重擲**，不再存起來（裁定 2026-08-31，Lee：
       *    每次登入都要換一個排列組合）。存起來等於在這台裝置上建立一個
       *    穩定的化名，久了就是一個可以被認出來的身分——這個站承諾的是
       *    「沒有人知道你是誰」，包括不知道「又是上次那個人」。
       *
       * ⛔ 這也是為什麼「我說過的話」不能再用代號比對：代號一換就認不出
       *    自己以前說的話。改用 mineIds（本機留言 id 清單，永不上傳）。
       *    整支 session 內用同一個代號，所以同一次造訪送出的多則留言
       *    名字仍然一致。 */
      getAlias: function () {
        /* ⛔ 清掉舊版留在這台裝置上的固定代號。2026-08-31 之前它是存起來的，
         * 不清的話那個化名會一直躺在使用者的瀏覽器裡——這條裁定要的正是
         * 「裝置上不留下穩定的化名」，留著等於只做了一半。 */
        var db0 = read();
        if (db0.alias) { delete db0.alias; write(db0); }
        if (!sessionAlias) {
          sessionAlias = {
            name: pick(ALIAS_ADJ) + pick(ALIAS_NOUN),
            hue: Math.floor(Math.random() * 360)
          };
        }
        return Promise.resolve(sessionAlias);
      },

      /* ---- 「這台裝置送出過哪幾則」----
       * ⛔ 只存 id，而且**永不上傳**（見 docs/api-contract.md）。
       *    不要改成在留言上加一個裝置欄位：那會讓後台可以把同一個人的
       *    多則留言串起來，等於在匿名站裡建立作者身分。 */
      rememberMine: function (id) {
        var db = read();
        db.mineIds = db.mineIds || [];
        if (db.mineIds.indexOf(id) === -1) { db.mineIds.push(id); write(db); }
        return Promise.resolve(true);
      },
      listMineIds: function () {
        var db = read();
        return Promise.resolve((db.mineIds || []).slice());
      },

      /* ---- 「上次看到的溫暖次數」----
       * 用來算出「我不在的時候有人回應了我」。
       * ⛔ 只存在本機、永不上傳。伺服器一旦知道「這台裝置在追蹤哪幾則」，
       *    就等於知道那幾則是誰寫的——那正是這個站不做的事。
       * ⛔ 也因此比對用的資料來自「整面牆」那份既有的請求，不另外發
       *    「查這幾個 id」的查詢：那種查詢本身就是一條線索。 */
      getSeenReactions: function () {
        var db = read();
        return Promise.resolve(db.seenReactions || {});
      },
      setSeenReactions: function (map) {
        var db = read();
        db.seenReactions = map;
        write(db);
        return Promise.resolve(map);
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

      /* 退回的留言。⛔ 退回**不刪除**（裁定 2026-08-17）——後台要看得到、
       * 也要能還原。誤判會發生，而被誤判的那個人不會知道要來申訴。 */
      listRejected: function () {
        var db = read();
        return Promise.resolve(db.messages.filter(function (m) {
          return m.status === S.STATUS.REJECTED;
        }));
      },

      createMessage: function (draft) {
        var db = read();
        var msg = S.makeMessage({
          id: newId(),
          body: draft.body,
          alias: draft.alias,
          /* ⛔ 這裡曾經寫死 PENDING。2026-08-31 改為自動審核（triage.js）決定：
           * 判得準的直接 approved，判不準的才留 pending。寫死的話整面牆在
           * 沒有人值班時是死的——說完話只看得到「檢視中」，然後永遠停在那裡。
           * 前端這一關是體驗；真後端必須自己重跑 triage，不能信任這個欄位。 */
          status: draft.status || S.STATUS.PENDING,
          flags: draft.flags || [],
          hold: draft.hold || [],
          source: draft.source || S.SOURCE.VISITOR,
          attribution: draft.attribution || '',
          createdAt: nowIso()
        });
        db.messages.push(msg);
        db.mineIds = db.mineIds || [];
        db.mineIds.push(msg.id);
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

      /* 檢視模式偏好。⛔ 全站只有本檔可以碰 localStorage（G5），
       * 所以 wall.js 不自己存，走這裡。 */
      getViewMode: function () {
        var db = read();
        return Promise.resolve(db.viewMode || null);
      },

      setViewMode: function (mode) {
        var db = read();
        db.viewMode = mode;
        write(db);
        return Promise.resolve(mode);
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
      listRejected: function () { return req('GET', '/messages?status=rejected'); },
      /* ⛔ 送出後把 id 記在**本機**。這個清單永不上傳（見 api-contract）：
       * 它只是為了讓本人在自己的裝置上找得到自己說過的話。
       * 換一台裝置就找不到，那是刻意的——那正是「沒有人知道你是誰」的代價，
       * 也是它的保證。 */
      createMessage: function (draft) {
        return req('POST', '/messages', draft).then(function (msg) {
          return LocalProvider.rememberMine(msg.id).then(function () { return msg; });
        });
      },
      rememberMine: function (id) { return LocalProvider.rememberMine(id); },
      listMineIds: function () { return LocalProvider.listMineIds(); },
      setStatus: function (id, status) { return req('PATCH', '/messages/' + id, { status: status }); },
      react: function (id, reactionId) {
        if (!S.isReactionId(reactionId)) {
          return Promise.reject(new Error('[ABW] 未定義的回應類型 ' + reactionId));
        }
        return req('POST', '/messages/' + id + '/reactions', { reaction: reactionId });
      },
      /* 檢視模式是使用者的本機偏好，即使接了後端也不上傳 */
      getViewMode: function () { return LocalProvider.getViewMode(); },
      setViewMode: function (mode) { return LocalProvider.setViewMode(mode); },
      getKeywords: function () { return req('GET', '/keywords'); },
      setKeywords: function (set) { return req('PUT', '/keywords', set); }
    };
  })();

  ABW.LocalProvider = LocalProvider;
  ABW.ApiProvider = ApiProvider;

  /* ==== 切換後端只改這一行 ==== */
  ABW.provider = LocalProvider;
})(window);
