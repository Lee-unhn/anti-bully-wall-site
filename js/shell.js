/* shell.js — 每一頁共用的外框：右側面板（桌機）／底部 tab（手機）／求助浮動鈕。
 *
 * 為什麼用注入而不是每頁複製一份 HTML：這個站沒有 build step，也沒有樣板引擎。
 * 面板若寫死在六個 .html 裡，客戶改一顆按鈕就要改六個檔，遲早改漏。
 * 單一定義放在 content.js 的 nav，這裡負責長出來。
 *
 * ⛔ 懸念紀律：teaser 期 phase==='reveal' 的項目**完全不產生 DOM 節點**，
 *    不是加 hidden、不是 display:none。任何留在原始碼裡的節目名都會被搜尋引擎與
 *    好奇的訪客翻出來，懸念當場破功（裁定 2026-08-19 Q13）。
 *
 * ⛔ 求助資源不是 nav 項目。它在每一頁常駐，換頁也不會消失——最需要它的時候
 *    不該要求任何人先找到正確的分頁。
 */
(function (global) {
  'use strict';

  var ABW = global.ABW;

  function currentPage() {
    var f = location.pathname.split('/').pop();
    return f && f.length ? f : 'index.html';
  }

  /* teaser 期把 reveal 項整個濾掉——這是懸念紀律的落點，不要改成 hidden */
  function visibleNav() {
    var phase = (ABW.content && ABW.content.phase) || 'teaser';
    return (ABW.content.nav || []).filter(function (item) {
      return item.phase === 'always' || item.phase === phase;
    });
  }

  function makeLink(item, here) {
    var el;
    if (item.kind === 'page') {
      el = document.createElement('a');
      el.href = item.target;
      if (item.target === here) el.setAttribute('aria-current', 'page');
    } else {
      el = document.createElement('button');
      el.type = 'button';
      el.setAttribute('data-shell-action', item.target);
    }
    el.className = 'shell-nav-item';
    el.setAttribute('data-nav-id', item.id);
    el.textContent = item.label;
    return el;
  }

  function buildPanel(items, here) {
    var panel = document.createElement('nav');
    panel.className = 'shell-panel';
    panel.setAttribute('aria-label', '網站導覽');

    var list = document.createElement('ul');
    items.forEach(function (item) {
      var li = document.createElement('li');
      li.appendChild(makeLink(item, here));
      list.appendChild(li);
    });
    panel.appendChild(list);

    /* 求助鈕釘在面板底部，視覺上與導覽分開——它不是「其中一個去處」 */
    var help = document.createElement('button');
    help.type = 'button';
    help.className = 'shell-help';
    help.setAttribute('data-shell-help', '');
    help.textContent = (ABW.content.help && ABW.content.help.heading) || '如果你現在很不好受';
    panel.appendChild(help);

    return panel;
  }

  function bind(root) {
    root.addEventListener('click', function (ev) {
      var help = ev.target.closest('[data-shell-help]');
      if (help) {
        ev.preventDefault();
        if (ABW.wall && ABW.wall.openHelp) ABW.wall.openHelp(null);
        return;
      }
      var act = ev.target.closest('[data-shell-action]');
      if (!act) return;
      ev.preventDefault();
      var target = act.getAttribute('data-shell-action');
      if (target === 'compose') {
        /* 送出入口在首頁底部常駐列；不在首頁就先回首頁再聚焦。
         * ⛔ 判斷依據是「看得見嗎」不是「存在嗎」。單檔預覽版的分頁與首頁在同一份
         *    文件裡，輸入框永遠存在、只是被隱藏——只檢查存在的話會聚焦到一個看不見
         *    的元素，使用者按下去完全沒有反應（Lee 2026-08-24 回報）。 */
        var box = document.getElementById('compose-body');
        var visible = box && box.offsetParent !== null;
        if (visible) { box.focus(); box.scrollIntoView({ block: 'center' }); }
        else location.href = 'index.html#compose';
      }
    });
  }

  function mount() {
    if (!ABW || !ABW.content) return;
    var host = document.querySelector('[data-shell]');
    if (!host) return;
    var panel = buildPanel(visibleNav(), currentPage());
    host.appendChild(panel);
    bind(host);

    /* 從別頁按「說出你的事」回來時，直接把游標放進輸入框 */
    if (location.hash === '#compose') {
      var box = document.getElementById('compose-body');
      if (box) box.focus();
    }
  }

  ABW.shell = { mount: mount, visibleNav: visibleNav };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})(window);
