/* pages.js — 用資料畫出「霸凌是什麼樣子」與「你該知道的三件事」。
 *
 * 為什麼要資料化：後台要能改這兩頁的內容（Lee 2026-09-02）。原本是寫死在
 * HTML 裡的，後台沒有東西可以改。
 *
 * ⛔ **永遠不用 innerHTML 塞內容。** 後台改的東西會送到每一個訪客的瀏覽器，
 *    允許 HTML 等於開一條 XSS 路徑，而這個站的訪客是正在說出創傷的人。
 *    粗體用 `**這樣**` 的寫法，由 emphasize() 建成真的 DOM 節點。
 *
 * ⛔ 區塊型別是**具名的**（quote／steps／list／contacts／para／note／links），
 *    不是自由格式。自由格式等於把版面決定權交給文字框，而版面裡藏著
 *    可及性與對比的裁定。未知型別直接跳過，不退化成 innerHTML。
 *
 * ⛔ 插圖（SVG）不可從後台編輯：那是可執行的標記，而且不是文案。
 *    它們是這裡的固定資產，用 id 對應。
 */
(function (global) {
  'use strict';
  var ABW = global.ABW;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* **粗體** → <strong>。⛔ 逐段建節點，不拼字串。 */
  function emphasize(target, text) {
    var parts = String(text == null ? '' : text).split('**');
    parts.forEach(function (part, i) {
      if (!part) return;
      if (i % 2 === 1) target.appendChild(el('strong', null, part));
      else target.appendChild(document.createTextNode(part));
    });
    return target;
  }

  function para(cls, text) { return emphasize(el('p', cls), text); }

  /* ---- 案例頁的插圖。⛔ 固定資產，不從內容來。 ---- */
  var MARKS = {
    c1: { title: '一個圈子把一個人留在外面',
          paths: ['M12 40a24 24 0 1 1 48 0 24 24 0 0 1-48 0', 'M30 22 46 32 42 50 26 40Z'] },
    c2: { title: '一張卡片複製擴散成許多小卡',
          paths: ['M8 16h28v20H8z', 'M44 12h16v12H44z', 'M46 30h16v12H46z', 'M38 46h16v12H38z'] },
    c3: { title: '每天剛好帶足的零錢',
          paths: ['M20 24h32v24H20z', 'M28 34h16', 'M28 40h10'] },
    c4: { title: '一個人被拿出來當例子',
          paths: ['M10 18h52v28H10z', 'M36 46v10', 'M24 56h24'] }
  };

  function makeMark(id) {
    var spec = MARKS[id] || MARKS.c1;
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'case-mark');
    svg.setAttribute('viewBox', '0 0 72 72');
    svg.setAttribute('role', 'img');
    var t = document.createElementNS(SVG_NS, 'title');
    t.textContent = spec.title;
    svg.appendChild(t);
    spec.paths.forEach(function (d) {
      var path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'var(--warm)');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);
    });
    return svg;
  }

  function fillToc(sel, items) {
    var toc = document.querySelector(sel);
    if (!toc) return;
    toc.innerHTML = '';
    items.forEach(function (x) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + x.id;
      a.appendChild(el('span', null, x.title || ''));
      li.appendChild(a);
      toc.appendChild(li);
    });
  }

  /* ---- 霸凌是什麼樣子 ---- */
  function renderCases() {
    var host = document.querySelector('[data-c="cases.items"]');
    if (!host) return;
    var data = (ABW.content.cases && ABW.content.cases.items) || [];
    host.innerHTML = '';
    fillToc('[data-c="cases.toc"]', data);

    /* ⛔ 迴圈變數不可命名為 c：全站慣例 `var c = ABW.content`，
     * G25 會把 c.xxx 當成 content 的參照而誤報（2026-09-02 實際踩到）。 */
    data.forEach(function (item) {
      var art = el('article', 'case');
      art.setAttribute('aria-labelledby', item.id);
      var wrap = el('div', 'case-mark-wrap');
      wrap.appendChild(makeMark(item.id));
      wrap.appendChild(el('p', 'case-tag', item.tag || ''));
      art.appendChild(wrap);
      var h = el('h2', 'page-sec-h', item.title || '');
      h.id = item.id;
      art.appendChild(h);
      var dl = el('dl', 'case-dl');
      (item.fields || []).forEach(function (f) {
        dl.appendChild(el('dt', null, f.q || ''));
        dl.appendChild(emphasize(el('dd'), f.a || ''));
      });
      art.appendChild(dl);
      host.appendChild(art);
    });
  }

  /* ---- 你該知道的三件事 ---- */
  var BLOCK = {
    quote: function (b) {
      var q = emphasize(el('blockquote', 'law-quote'), b.text);
      if (b.cite) q.appendChild(el('cite', null, b.cite));
      return q;
    },
    para: function (b) { return para(null, b.text); },
    note: function (b) { return para('law-note', b.text); },
    steps: function (b) {
      var ol = el('ol', 'law-steps');
      (b.items || []).forEach(function (s) {
        var li = document.createElement('li');
        li.appendChild(el('span', 'step-t', s.title || ''));
        li.appendChild(emphasize(el('p'), s.text || ''));
        ol.appendChild(li);
      });
      return ol;
    },
    list: function (b) {
      var ul = el('ul', 'law-list law-list-check');
      (b.items || []).forEach(function (t) {
        ul.appendChild(emphasize(document.createElement('li'), t));
      });
      return ul;
    },
    contacts: function (b) {
      var ul = el('ul', 'law-contacts');
      (b.items || []).forEach(function (contact) {
        var li = document.createElement('li');
        li.appendChild(el('span', 'c-num', contact.num || ''));
        var body = el('span', 'c-body');
        emphasize(body, contact.text || '');
        if (contact.url) {
          var a = document.createElement('a');
          a.href = contact.url;
          a.rel = 'noopener noreferrer';
          a.textContent = String(contact.url).replace(/^https?:\/\//, '').replace(/\/$/, '');
          body.appendChild(document.createTextNode(' '));
          body.appendChild(a);
        }
        li.appendChild(body);
        ul.appendChild(li);
      });
      return ul;
    },
    links: function (b) {
      var ul = el('ul', 'law-list');
      (b.items || []).forEach(function (x) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = x.url;
        a.rel = 'noopener noreferrer';
        a.textContent = x.label || x.url;
        li.appendChild(a);
        if (x.note) li.appendChild(document.createTextNode(x.note));
        ul.appendChild(li);
      });
      return ul;
    }
  };

  function renderLaw() {
    var host = document.querySelector('[data-c="lawPage.sections"]');
    if (!host) return;
    var data = (ABW.content.lawPage && ABW.content.lawPage.sections) || [];
    host.innerHTML = '';
    fillToc('[data-c="lawPage.toc"]', data.filter(function (s) { return s.inToc !== false; }));

    data.forEach(function (s) {
      var sec = el('section', 'law-sec' + (s.bleed ? ' law-help-bleed' : ''));
      sec.setAttribute('aria-labelledby', s.id);
      var h = el('h2', 'page-sec-h', s.title || '');
      h.id = s.id;
      sec.appendChild(h);
      (s.blocks || []).forEach(function (b) {
        var make = BLOCK[b.type];
        /* ⛔ 未知型別直接跳過。退化成 innerHTML 正是這支檔案存在的理由所要避免的事。 */
        if (!make) { console.warn('[ABW] 未知的內容區塊型別', b.type); return; }
        sec.appendChild(make(b));
      });
      host.appendChild(sec);
    });
  }

  ABW.pages = {
    renderCases: renderCases,
    renderLaw: renderLaw,
    emphasize: emphasize,
    BLOCK: BLOCK,
    MARKS: MARKS
  };
})(window);
