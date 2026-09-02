/* content-merge.js — 把後台改過的內容疊到 content.js 的預設上。
 *
 * ⛔ 資料層存的是**覆寫值**不是整份內容。沒有被覆寫的部分沿用預設——
 *    資料庫空了、壞了、或還沒接上時，網站仍然是完整的。
 *    內容全部搬進資料庫的做法，代價是資料庫一出事就變成空白站。
 *
 * ⛔ 只疊「已知的鍵」。後台不小心存了奇怪的結構時，不該把整份 content
 *    覆蓋掉——那會讓一次誤操作弄壞整個網站。
 */
(function (global) {
  'use strict';
  var ABW = global.ABW;

  /* 允許被後台改的東西。⛔ 白名單，不是黑名單：
   * 沒列在這裡的（例如 phase、seedRiskAccepted、law.signedOff）永遠不可從
   * 後台改——那些是紀律旗標，不是文案。 */
  var EDITABLE = {
    'reactions': true,      /* 五個鼓勵按鈕的文字 */
    'cases': true,          /* 霸凌是什麼樣子 */
    'lawPage': true,        /* 你該知道的三件事 */
    'wall.statusLines': true
  };

  function get(obj, path) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function set(obj, path, value) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }

  /* 鼓勵按鈕的文字疊到 schema.REACTIONS 上。
   * ⛔ 只換 label，不換 id 也不換數量：id 是資料庫裡計數的鍵，換掉等於
   *    所有既有的溫暖次數對不上；數量五個是產品裁定（2026-08-17）。
   * ⛔ 空字串一律忽略：沒有文字的鼓勵鈕等於藏起來，那會讓 G18 的裁定失效。 */
  function applyReactions(labels) {
    if (!labels) return;
    ABW.schema.REACTIONS.forEach(function (r) {
      var v = labels[r.id];
      if (typeof v === 'string' && v.trim()) r.label = v.trim();
    });
  }

  function apply(overrides) {
    if (!overrides) return ABW.content;
    Object.keys(EDITABLE).forEach(function (path) {
      var v = get(overrides, path);
      if (v === undefined || v === null) return;
      if (path === 'reactions') { applyReactions(v); return; }
      set(ABW.content, path, v);
    });
    return ABW.content;
  }

  function load() {
    if (!ABW.provider || !ABW.provider.getSiteContent) return Promise.resolve(ABW.content);
    return ABW.provider.getSiteContent()
      .then(apply)
      .catch(function (err) {
        /* ⛔ 讀不到就用預設，不要讓整個站掛掉。內容覆寫是加分項不是必需品。 */
        console.warn('[ABW] 讀取站內容覆寫失敗，改用預設', err);
        return ABW.content;
      });
  }

  ABW.contentMerge = { load: load, apply: apply, EDITABLE: EDITABLE };
})(window);
