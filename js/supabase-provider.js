/* supabase-provider.js — 真後端。介面與 LocalProvider 完全相同，可整支替換。
 *
 * ⛔ 投稿**不走**直接 INSERT，走 Edge Function：守門與自動審核必須在伺服器端
 *    跑過才入庫（docs/api-contract.md §2）。RLS 也沒有給 anon 任何 INSERT 政策，
 *    所以就算有人繞過前端，也寫不進去。
 *
 * ⛔ 溫暖回應走 RPC add_reaction()，不是直接 update：直接 update 等於任何人
 *    都能把計數設成任意數字。
 *
 * ⛔ 代號與「我說過的話」的 id 清單一律留在本機，永遠不上傳——
 *    上傳等於在一個匿名站裡建立作者身分。
 */
(function (global) {
  'use strict';
  var ABW = global.ABW;
  var S = ABW.schema;

  function makeProvider(cfg) {
    var BASE = cfg.url.replace(/\/+$/, '');
    var REST = BASE + '/rest/v1';
    var FN = BASE + '/functions/v1';
    var session = null;   /* 後台登入後才有 */

    function headers(extra) {
      var h = {
        'apikey': cfg.anonKey,
        'Authorization': 'Bearer ' + (session ? session.access_token : cfg.anonKey),
        'Content-Type': 'application/json'
      };
      for (var k in extra) if (extra.hasOwnProperty(k)) h[k] = extra[k];
      return h;
    }

    function req(method, url, body, extraHeaders) {
      var opts = { method: method, headers: headers(extraHeaders) };
      if (body !== undefined) opts.body = JSON.stringify(body);
      return fetch(url, opts).then(function (res) {
        if (!res.ok) {
          return res.text().then(function (t) {
            throw new Error('[ABW] ' + method + ' ' + url + ' -> ' + res.status + ' ' + t.slice(0, 120));
          });
        }
        return res.status === 204 ? null : res.json();
      });
    }

    /* 資料庫的欄位名是 snake_case，前端的形狀是 schema.makeMessage。
     * ⛔ 這一層一定要有：讓資料庫的欄位命名漏進整個前端，之後換後端就要改全站。 */
    function toMessage(r) {
      return S.makeMessage({
        id: r.id,
        body: r.body,
        alias: { name: r.alias_name, hue: r.alias_hue },
        status: r.status,
        flags: r.flags || [],
        hold: r.hold || [],
        source: r.source,
        attribution: r.attribution || '',
        reactions: r.reactions,
        createdAt: r.created_at
      });
    }

    function list(status) {
      return req('GET', REST + '/messages?select=*&status=eq.' + status + '&order=created_at.desc')
        .then(function (rows) { return (rows || []).map(toMessage); });
    }

    return {
      name: 'SupabaseProvider',
      persistent: true,

      init: function () { return Promise.resolve(); },
      /* ⛔ 種子由管理者從後台匯入，前端不得自行灌資料到共用資料庫。 */
      ensureSeeds: function () { return Promise.resolve({ added: 0, removed: 0 }); },

      getAlias:      function () { return ABW.LocalProvider.getAlias(); },
      rememberMine:  function (id) { return ABW.LocalProvider.rememberMine(id); },
      listMineIds:   function () { return ABW.LocalProvider.listMineIds(); },
      getSeenReactions: function () { return ABW.LocalProvider.getSeenReactions(); },
      setSeenReactions: function (m) { return ABW.LocalProvider.setSeenReactions(m); },
      getViewMode:   function () { return ABW.LocalProvider.getViewMode(); },
      setViewMode:   function (m) { return ABW.LocalProvider.setViewMode(m); },

      listApproved: function () { return list('approved'); },
      listPending:  function () { return list('pending'); },
      listRejected: function () { return list('rejected'); },

      createMessage: function (draft) {
        /* ⛔ 只送 body 與 alias。status／hold 是伺服器算的，送過去也不會被採用。 */
        return req('POST', FN + '/submit', { body: draft.body, alias: draft.alias })
          .then(function (row) {
            var msg = toMessage(row);
            return ABW.LocalProvider.rememberMine(msg.id).then(function () { return msg; });
          });
      },

      setStatus: function (id, status) {
        return req('PATCH', REST + '/messages?id=eq.' + id, { status: status },
          { 'Prefer': 'return=representation' })
          .then(function (rows) { return rows && rows[0] ? toMessage(rows[0]) : null; });
      },

      react: function (id, reactionId) {
        if (!S.isReactionId(reactionId)) {
          return Promise.reject(new Error('[ABW] 未定義的回應類型 ' + reactionId));
        }
        return req('POST', REST + '/rpc/add_reaction', { msg_id: id, reaction: reactionId });
      },

      getKeywords: function () {
        return req('GET', REST + '/keyword_set?select=data&id=eq.1')
          .then(function (rows) {
            return (rows && rows[0] && rows[0].data) || ABW.defaultKeywords();
          });
      },
      setKeywords: function (set) {
        return req('PATCH', REST + '/keyword_set?id=eq.1', { data: set })
          .then(function () { return set; });
      },

      /* ---- 後台登入 ----
       * ⛔ 沒有這個，後端一上線任何人都能通過／退回（人類關卡 ABW-AUTH）。 */
      signIn: function (email, password) {
        return fetch(BASE + '/auth/v1/token?grant_type=password', {
          method: 'POST',
          headers: { 'apikey': cfg.anonKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password })
        }).then(function (res) {
          if (!res.ok) throw new Error('登入失敗');
          return res.json();
        }).then(function (s) { session = s; return s; });
      },
      signedIn: function () { return !!session; }
    };
  }

  ABW.makeSupabaseProvider = makeProvider;

  /* ⛔ 設定填好才切換。沒填就維持 LocalProvider——留言只存在訪客自己的
   *    瀏覽器，而前台的送出提示會照實說出這件事（G9 在守）。 */
  var cfg = (ABW.config && ABW.config.supabase) || {};
  if (cfg.url && cfg.anonKey) {
    ABW.provider = makeProvider(cfg);
  }
})(window);
