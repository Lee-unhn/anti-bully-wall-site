/* share.js — 「我說過的話」：讓本人找得到自己在這台裝置上說過的話。
 *
 * ⛔ 這裡**沒有**分享或匯出功能，而且不要再加回去（裁定 2026-08-24，
 *    推翻 2026-08-17 的「可分享自己的留言卡圖」）。
 *    理由：這個站承諾「沒有人知道你是誰」。把自己的留言做成圖貼到自己的
 *    社群帳號，等於親手把真實身分綁上那則匿名留言——這是全站最快破壞
 *    匿名承諾的動作。而且 guard.js 遮得掉姓名校名，遮不掉情節：
 *    「班群裡那個沒有我的群組」對同班同學就是指名道姓。
 *    真的想公開自己的話的人可以自己截圖，我們不必鋪一條一鍵的路。
 *
 * ⛔ `myMessages()` 仍然只回傳 alias 與本機代號相同的留言。
 *    這道過濾不是為了分享，是為了不要把別人的話列進「我說過的話」。
 */
(function (global) {
  'use strict';

  var ABW = global.ABW;
  var S = ABW.schema;


  /* 送出後的留言要進待審佇列才會上牆，但「找不到自己剛剛說的話」會讓人
   * 以為送丟了。所以這裡把待審的也列出來、標成檢視中——
   * ⛔ 只是列給本人看，不代表它已經在牆上（牆仍然只顯示 approved）。 */
  function myMessages() {
    return ABW.provider.getAlias().then(function (alias) {
      var mine = function (list) {
        return list.filter(function (m) {
          return m.source === S.SOURCE.VISITOR && m.alias && m.alias.name === alias.name;
        });
      };
      return Promise.all([ABW.provider.listApproved(), ABW.provider.listPending()])
        .then(function (both) {
          var approved = mine(both[0]).map(function (m) { return { msg: m, pending: false }; });
          var pending = mine(both[1]).map(function (m) { return { msg: m, pending: true }; });
          return pending.concat(approved);
        });
    });
  }

  function bind() {
    var host = document.querySelector('[data-share-list]');
    if (!host) return Promise.resolve(0);

    return myMessages().then(function (list) {
      var empty = document.querySelector('[data-share-empty]');
      if (empty) empty.hidden = list.length > 0;
      /* 審核說明只對「已經說過話」的人有意義——沒留言的人看到它只是多一段字。 */
      var note = document.querySelector('[data-mine-note]');
      if (note) note.hidden = list.length === 0;
      host.innerHTML = '';

      return ABW.provider.getAlias().then(function (alias) {
        list.forEach(function (entry) {
          var msg = entry.msg;
          var li = document.createElement('li');
          li.className = 'share-item' + (entry.pending ? ' is-pending' : '');

          var body = document.createElement('div');
          var p = document.createElement('p');
          p.textContent = msg.body;
          body.appendChild(p);
          var state = document.createElement('p');
          state.className = 'share-state';
          state.textContent = entry.pending
            ? '檢視中——通過之後就會出現在牆上'
            : '已經在牆上了';
          body.appendChild(state);

          li.appendChild(body);
          host.appendChild(li);
        });
        return list.length;
      });
    });
  }

  ABW.share = { bind: bind, myMessages: myMessages };
})(window);
