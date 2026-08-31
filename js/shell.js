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

  /* ---- 字級 ----
   * 公共圖書館網站的常設功能，不是設定頁裡的選項。三級離散值，
   * 基準掛在 html 上（見 styles.css 檔尾）。
   *
   * ⛔ 套用要在 mount() 之前、在腳本載入當下就做完，不能等 DOMContentLoaded：
   *    等到那時候頁面已經用預設字級畫過一次，使用者會看到字跳一下。
   */
  var FS_KEY = 'abw.fontsize';
  var FS_LEVELS = [
    { id: 'sm', label: '小' },
    { id: 'md', label: '中' },
    { id: 'lg', label: '大' }
  ];

  /* ⛔ 不直接碰 localStorage：裝置偏好的唯一擁有者是 js/prefs.js。
   * 無痕視窗會在存取當下就丟例外，那個 try/catch 只該寫一次、寫在那裡。 */
  function readFs() {
    var v = ABW.prefs.get(FS_KEY, 'md');
    return FS_LEVELS.some(function (l) { return l.id === v; }) ? v : 'md';
  }

  function applyFs(id) {
    if (id === 'md') document.documentElement.removeAttribute('data-fs');
    else document.documentElement.setAttribute('data-fs', id);
  }

  applyFs(readFs());

  function setFs(id) {
    applyFs(id);
    ABW.prefs.set(FS_KEY, id);
    var btns = document.querySelectorAll('[data-fs-set]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed',
        btns[i].getAttribute('data-fs-set') === id ? 'true' : 'false');
    }
    /* 牆的軌道高度是**實測卡片高度**算出來的，字一變卡片就變高。
     * 不重排的話軌道會疊在一起——這不是美觀問題，是留言互相蓋住。 */
    if (ABW.wall && ABW.wall.render && ABW.provider) {
      ABW.provider.listApproved().then(ABW.wall.render);
    }
  }

  function buildTools() {
    var box = document.createElement('div');
    box.className = 'shell-tools';
    var h = document.createElement('p');
    h.className = 'shell-tools-h';
    h.id = 'shell-fs-h';
    h.textContent = '字級';
    box.appendChild(h);
    var group = document.createElement('div');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-labelledby', 'shell-fs-h');
    var now = readFs();
    FS_LEVELS.forEach(function (lv) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'shell-fs';
      b.setAttribute('data-fs', lv.id);
      b.setAttribute('data-fs-set', lv.id);
      b.setAttribute('aria-pressed', lv.id === now ? 'true' : 'false');
      b.textContent = lv.label;
      group.appendChild(b);
    });
    box.appendChild(group);
    return box;
  }

  /* ---- 跳至主內容 ----
   * 鍵盤使用者的第一個 Tab。⛔ 平常不可用 display:none 藏起來——
   * 那樣它就不在 tab 序列裡，等於沒做。CSS 用 transform 移出畫面。 */
  function mountSkipLink() {
    if (document.querySelector('.skip-link')) return;
    var main = document.querySelector('.shell-main main') || document.querySelector('main');
    if (!main) return;
    if (!main.id) main.id = 'abw-main';
    main.setAttribute('tabindex', '-1');
    var a = document.createElement('a');
    a.className = 'skip-link';
    a.href = '#' + main.id;
    a.textContent = '跳至主要內容';
    document.body.insertBefore(a, document.body.firstChild);
  }

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

  /* ---- 24px 內嵌線稿圖標 ----
   * ⛔ 一律內嵌 SVG，不可 <img src>：CSP 是 default-src 'self'，而且內嵌才吃得到
   *    currentColor——當前項換色時圖標要跟著換，外部圖檔做不到。
   * 規格統一：viewBox 0 0 24 24、fill:none、stroke:currentColor、stroke-width:2、
   *    stroke-linecap/linejoin:round。無漸層、無陰影。
   * 圖標是裝飾，說明由旁邊的文字承擔，所以一律 aria-hidden。
   */
  var ICONS = {
    speak: 'M3.5 5.5h17v10h-9l-5 4v-4h-3z',
    wall:  'M2.5 4.5h19v15h-19zM2.5 9.5h19M2.5 14.5h19M8 4.5v5M16 9.5v5M8 14.5v5',
    cases: 'M6.5 3.5h8l4 4v13h-12zM14.5 3.5v4h4M9.5 12.5h6M9.5 16.5h4',
    law:   'M12 6.8v12.6M12 6.8C10.6 5.6 8.6 5 6 5H3.5v12.5H6c2.6 0 4.6.6 6 1.9'
           + 'M12 6.8C13.4 5.6 15.4 5 18 5h2.5v12.5H18c-2.6 0-4.6.6-6 1.9',
    show:  'M12 3.5l2.2 5.4 5.8.4-4.5 3.7 1.5 5.6L12 15.6 7 18.6l1.5-5.6L4 9.3l5.8-.4z',
    help:  'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7'
           + 'M6 6l3.5 3.5M18 6l-3.5 3.5M6 18l3.5-3.5M18 18l-3.5-3.5'
  };

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function makeIcon(id, cls) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', cls);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', ICONS[id] || ICONS.wall);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  }

  function span(cls, text) {
    var el = document.createElement('span');
    el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  /* 一個導覽項＝24px 圖標 ＋ 標籤 ＋ 一行說明。
   * 說明行是刻意的：帶了說明就不再讀成按鈕，而是目錄項。
   * 手機底部 tab 用同一份 DOM，只是 CSS 換成「圖標在上、短標籤在下」，
   * 說明行隱藏、完整標籤換成 short——⛔ 不要為了手機另外產一份 DOM，
   * 兩份會漂移，而且面板只有一個真相源（content.nav）。 */
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
    el.className = 'shell-nav-item'
      + (item.kind === 'page' ? '' : ' shell-nav-item--action');
    el.setAttribute('data-nav-id', item.id);

    el.appendChild(makeIcon(item.id, 'shell-nav-icon'));

    var text = span('shell-nav-text');
    var label = span('shell-nav-label');
    label.appendChild(span('nav-full', item.label));
    /* short 缺席時退回完整 label：寧可在手機上折行，也不要出現空白的 tab */
    label.appendChild(span('nav-short', item.short || item.label));
    text.appendChild(label);
    if (item.note) text.appendChild(span('shell-nav-note', item.note));
    el.appendChild(text);
    return el;
  }

  /* 面板＝四段式垂直軌：識別 → 動作 → 去處 → 求助。
   * 由上到下就是這個網站要你做的事的順序，四段的視覺重量刻意不相等。 */
  function buildBrand() {
    var site = (ABW.content && ABW.content.site) || {};
    var brand = document.createElement('div');
    brand.className = 'shell-brand';
    var name = document.createElement('p');
    name.className = 'shell-brand-name';
    name.textContent = site.title || '';
    brand.appendChild(name);
    if (site.tagline) {
      var tag = document.createElement('p');
      tag.className = 'shell-brand-tag';
      tag.textContent = site.tagline;
      brand.appendChild(tag);
    }
    return brand;
  }

  /* 求助鈕：號碼直接印在鈕上，不必先點開對話框才看得到。
   * ⛔ 這一行不可拿掉——最需要它的人，不該被要求先完成一次互動才拿到號碼。 */
  function buildHelp() {
    var help = document.createElement('button');
    help.type = 'button';
    help.className = 'shell-help';
    help.setAttribute('data-shell-help', '');
    help.appendChild(makeIcon('help', 'shell-help-icon'));
    var text = span('shell-help-text');
    text.appendChild(span('shell-help-t',
      (ABW.content.help && ABW.content.help.heading) || '如果你現在很不好受'));
    var lines = (ABW.content.help && ABW.content.help.lines) || [];
    var nums = lines.map(function (l) { return l.number; }).filter(Boolean).join('・');
    if (nums) text.appendChild(span('shell-help-n', nums));
    help.appendChild(text);
    return help;
  }

  function buildPanel(items, here) {
    var panel = document.createElement('nav');
    panel.className = 'shell-panel';
    panel.setAttribute('aria-label', '網站導覽');

    panel.appendChild(buildBrand());
    panel.appendChild(buildTools());

    var list = document.createElement('ul');
    items.forEach(function (item) {
      var li = document.createElement('li');
      if (item.kind !== 'page') li.className = 'shell-nav-li--action';
      li.appendChild(makeLink(item, here));
      list.appendChild(li);
    });
    panel.appendChild(list);

    /* 求助鈕釘在面板底部，視覺上與導覽分開——它不是「其中一個去處」 */
    panel.appendChild(buildHelp());

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
      var fs = ev.target.closest('[data-fs-set]');
      if (fs) { ev.preventDefault(); setFs(fs.getAttribute('data-fs-set')); return; }
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
    mountSkipLink();
    var panel = buildPanel(visibleNav(), currentPage());
    host.appendChild(panel);
    bind(host);

    /* 從別頁按「說出你的事」回來時，直接把游標放進輸入框 */
    if (location.hash === '#compose') {
      var box = document.getElementById('compose-body');
      if (box) box.focus();
    }
  }

  ABW.shell = { mount: mount, visibleNav: visibleNav, setFs: setFs, readFs: readFs };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})(window);
