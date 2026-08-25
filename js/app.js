/* app.js — 首頁掛載。
 * P0 只做：讀 content、渲染靜態區塊、確認 provider 通了。
 * 留言牆（漂浮層／畫布／五種回應）在 P1；守門與求助卡在 P2。
 */
(function (global) {
  'use strict';

  var ABW = global.ABW;

  function $(sel) { return document.querySelector(sel); }

  function text(el, value) { if (el) el.textContent = value; }

  function renderStaticCopy() {
    var c = ABW.content;
    /* 分頁標題與 meta 也跟著 content 走，換素材時不用改 html。
     * 只有掛了 site.title 的頁（＝首頁）才覆寫 title；分頁保留自己的標題。 */
    if ($('[data-c="site.title"]')) document.title = c.site.title;
    var meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', c.site.description);
    text($('[data-c="site.title"]'), c.site.title);
    text($('[data-c="site.tagline"]'), c.site.tagline);
    text($('[data-c="wall.composePrompt"]'), c.wall.composePrompt);
    /* label 在視覺上被收起來讓高度給牆，所以提示改掛 placeholder；
       label 本身保留在 DOM 供螢幕報讀器使用，不是拿掉。 */
    var box = document.getElementById('compose-body');
    if (box && c.wall.composePlaceholder) box.setAttribute('placeholder', c.wall.composePlaceholder);
    text($('[data-c="wall.reactionsHint"]'), c.wall.reactionsHint);
    text($('[data-c="drama.name"]'), c.drama.name);
    text($('[data-c="drama.troupe"]'), c.drama.troupe);
    text($('[data-c="drama.synopsis"]'), c.drama.synopsis);
    text($('[data-c="cta.primary"]'), c.cta.primary.label);
    text($('[data-c="cta.primaryNote"]'), c.cta.primary.note);
  }

  /* 首屏分流。inline 的兩條不換頁——受害者按了就直接把游標放進輸入框，
   * 旁觀者按了就捲到牆上。多一次換頁就多一次流失。 */
  function renderTriage() {
    var host = $('[data-c="triage"]');
    if (!host) return;
    host.innerHTML = '';
    (ABW.content.triage || []).forEach(function (t) {
      var li = document.createElement('li');
      var el;
      if (t.kind === 'page') {
        el = document.createElement('a');
        el.href = t.target;
      } else {
        el = document.createElement('button');
        el.type = 'button';
        el.addEventListener('click', function () {
          if (t.target === 'compose') {
            var box = document.getElementById('compose-body');
            if (box) { box.focus(); box.scrollIntoView({ block: 'center' }); }
          } else {
            var wall = document.getElementById('wall');
            if (wall) wall.scrollIntoView({ block: 'start' });
          }
        });
      }
      el.className = 'triage-item triage-' + t.id;
      var label = document.createElement('span');
      label.className = 't-label';
      label.textContent = t.label;
      var note = document.createElement('span');
      note.className = 't-note';
      note.textContent = t.note;
      el.appendChild(label);
      el.appendChild(note);
      li.appendChild(el);
      host.appendChild(li);
    });
  }

  function renderReactionLegend() {
    var host = $('[data-c="reactions"]');
    if (!host) return;
    host.innerHTML = '';
    ABW.schema.REACTIONS.forEach(function (r) {
      var li = document.createElement('li');
      li.className = 'reaction-chip';
      li.setAttribute('data-reaction', r.id);
      li.textContent = r.glyph + ' ' + r.label;
      host.appendChild(li);
    });
  }

  function renderLawCards() {
    var host = $('[data-c="law.cards"]');
    if (!host) return;
    var law = ABW.content.law;
    host.innerHTML = '';
    law.cards.forEach(function (card) {
      var article = document.createElement('article');
      article.className = 'law-card';
      var h3 = document.createElement('h3');
      h3.textContent = card.title;
      var p = document.createElement('p');
      p.textContent = card.body;
      var a = document.createElement('a');
      a.href = card.more.url;
      a.textContent = card.more.label;
      a.rel = 'noopener noreferrer';
      article.appendChild(h3);
      article.appendChild(p);
      article.appendChild(a);
      host.appendChild(article);
    });
    var badge = $('[data-c="law.draftBadge"]');
    if (badge) badge.hidden = law.signedOff === true;
  }

  function renderHelp() {
    var host = $('[data-c="help.lines"]');
    if (!host) return;
    var help = ABW.content.help;
    text($('[data-c="help.heading"]'), help.heading);
    text($('[data-c="help.note"]'), help.note);
    host.innerHTML = '';
    help.lines.forEach(function (line) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = line.url;
      a.textContent = line.label + ' ' + line.number;
      li.appendChild(a);
      host.appendChild(li);
    });
  }

  function renderShows() {
    var host = $('[data-c="drama.shows"]');
    if (!host) return;
    host.innerHTML = '';
    ABW.content.drama.shows.forEach(function (s) {
      var li = document.createElement('li');
      li.textContent = s.date + '　' + s.venue + (s.note ? '（' + s.note + '）' : '');
      host.appendChild(li);
    });
    var fb = $('[data-c="cta.secondary"]');
    if (fb) {
      var url = ABW.content.cta.secondary.url;
      fb.textContent = ABW.content.cta.secondary.label;
      /* 網址還沒給就不要生一個點了會壞的連結 */
      if (/^https?:/.test(url)) fb.href = url;
      else { fb.removeAttribute('href'); fb.setAttribute('aria-disabled', 'true'); }
    }
  }



  function renderDemoNotice() {
    var el = $('[data-c="demoNotice"]');
    if (!el) return;
    var dn = ABW.content.demoNotice;
    el.hidden = !dn.enabled;
    text(el, dn.text);
  }

  function boot() {
    renderStaticCopy();
    renderTriage();
    renderReactionLegend();
    renderLawCards();
    renderHelp();
    renderShows();
    renderDemoNotice();

    return ABW.provider.init()
      .then(function () { return ABW.provider.getAlias(); })
      .then(function (alias) {
        text($('[data-c="alias"]'), alias.name);
        /* 牆的渲染與互動全在 wall.js，app.js 只負責靜態區塊與交棒 */
        return ABW.wall.boot();
      })
      .then(function () {
        return ABW.share.bind();
      })
      .catch(function (err) {
        /* fail-loud：資料層掛掉要看得見，不 silent skip */
        console.error('[ABW] 啟動失敗', err);
        var el = $('[data-c="wall.status"]');
        if (el) el.textContent = '資料層啟動失敗，請看 console。';
        throw err;
      });
  }

  ABW.app = { boot: boot };
  document.addEventListener('DOMContentLoaded', function () { boot(); });
})(window);
