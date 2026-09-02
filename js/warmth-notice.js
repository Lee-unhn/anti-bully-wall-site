/* warmth-notice.js — 有人給了你的話一句鼓勵時，跳出來告訴你。
 *
 * 這個站沒有帳號、沒有推播、資料庫裡也沒有作者欄位——所以「通知作者」
 * 不能用一般做法。做法是：**瀏覽器自己算**。
 *   1. 本機記著「我送出過哪幾則」（mineIds）與「上次看到的溫暖次數」
 *   2. 比對牆上那份**既有的**留言清單，看我的那幾則有沒有變多
 *   3. 變多就跳出來
 *
 * ⛔ 絕對不要為了這件事去查「這幾個 id 的最新狀態」。那種查詢本身就是
 *    一條線索：伺服器一旦知道某台裝置在追蹤哪幾則，就等於知道那幾則是
 *    誰寫的——那正是這個站承諾不做的事。所以只吃已經下載回來的整面牆。
 *
 * ⛔ 也不要做成紅點或未讀數字。這面牆上的人不需要再多一個要清空的東西。
 *    出現一次、幾秒後自己走。
 */
(function (global) {
  'use strict';

  var ABW = global.ABW;
  var S = ABW.schema;
  var SHOW_MS = 7000;
  var host = null;

  function labelOf(id) {
    var r = S.REACTIONS.filter(function (x) { return x.id === id; })[0];
    return r ? r.label : '';
  }

  function ensureHost() {
    if (host) return host;
    host = document.createElement('div');
    host.className = 'warmth-toasts';
    /* ⛔ aria-live 用 polite 不用 assertive：這是好消息不是警報，
     * 不該打斷正在讀留言的人。 */
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-atomic', 'false');
    document.body.appendChild(host);
    return host;
  }

  function toast(text) {
    var el = document.createElement('div');
    el.className = 'warmth-toast';
    el.textContent = text;
    ensureHost().appendChild(el);
    /* 進場動畫掛在下一幀，否則元素一插入就已經是最終狀態、看不到動畫 */
    global.requestAnimationFrame(function () { el.classList.add('is-in'); });
    global.setTimeout(function () {
      el.classList.remove('is-in');
      global.setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
    }, SHOW_MS);
  }

  /* messages＝牆上那份已經下載回來的清單。這支不自己發任何請求。 */
  function check(messages) {
    if (!ABW.provider.listMineIds || !ABW.provider.getSeenReactions) return Promise.resolve(0);
    return Promise.all([ABW.provider.listMineIds(), ABW.provider.getSeenReactions()])
      .then(function (r) {
        var mine = {}, shown = 0;
        r[0].forEach(function (id) { mine[id] = true; });
        var seen = r[1] || {};
        var next = {};
        var first = Object.keys(seen).length === 0;

        messages.forEach(function (m) {
          if (!mine[m.id]) return;
          var counts = {};
          var gained = [];
          S.REACTIONS.forEach(function (x) {
            var now = (m.reactions && m.reactions[x.id]) || 0;
            counts[x.id] = now;
            var was = (seen[m.id] && seen[m.id][x.id]) || 0;
            if (now > was) gained.push({ id: x.id, n: now - was });
          });
          next[m.id] = counts;

          /* ⛔ 第一次看到這則就不跳：那不是「有人剛剛回應你」，
           * 是「這台裝置第一次知道它的數字」。不擋的話，換裝置或清快取
           * 之後會一次噴出一堆假通知。 */
          if (first || !seen[m.id]) return;
          gained.forEach(function (g) {
            var word = labelOf(g.id);
            if (!word) return;
            shown++;
            toast(g.n > 1
              ? '有 ' + g.n + ' 個人給了你的話一句「' + word + '」'
              : '有人給了你的話一句「' + word + '」');
          });
        });

        return ABW.provider.setSeenReactions(next).then(function () { return shown; });
      })
      .catch(function (err) {
        /* 通知失敗不該讓牆掛掉——它是附加的好意，不是主功能 */
        console.warn('[ABW] 溫暖通知檢查失敗', err);
        return 0;
      });
  }

  ABW.warmthNotice = { check: check, toast: toast };
})(window);
