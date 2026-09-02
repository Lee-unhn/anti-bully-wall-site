/* admin-content.js — 後台編輯「霸凌是什麼樣子」與「你該知道的三件事」。
 *
 * ⛔ 表單只吃**純文字**，不吃 HTML。粗體寫成 `**這樣**`，由 js/pages.js
 *    建成 DOM 節點。允許 HTML 等於讓後台變成全站的 XSS 注入點——
 *    這個站的訪客是正在說出創傷的人，不值得冒這個險。
 *
 * ⛔ 區塊型別、案例的 id 與插圖都不可從這裡改：型別決定版面，而版面裡藏著
 *    可及性與對比的裁定；id 是錨點（目錄與外部連結指向它）；插圖是可執行
 *    的標記，不是文案。這裡只改「字」。
 *
 * ⛔ 儲存前一律先跟資料層拿一次現況再疊上去，不要用畫面上的舊值整包覆蓋：
 *    兩個人同時開後台時，後存的會把先存的蓋掉。
 */
(function (global) {
  'use strict';
  var ABW = global.ABW;

  function $(sel) { return document.querySelector(sel); }

  function field(labelText, value, rows) {
    var wrap = document.createElement('p');
    var lab = document.createElement('label');
    var id = 'f' + Math.random().toString(36).slice(2, 9);
    lab.setAttribute('for', id);
    lab.textContent = labelText;
    var box = document.createElement(rows ? 'textarea' : 'input');
    box.id = id;
    if (rows) box.rows = rows; else box.type = 'text';
    box.value = value == null ? '' : value;
    wrap.appendChild(lab);
    wrap.appendChild(box);
    return { wrap: wrap, box: box };
  }

  /* ---- 霸凌是什麼樣子 ---- */
  function renderCasesEditor() {
    var host = $('[data-admin="cases-fields"]');
    if (!host) return Promise.resolve();
    return ABW.provider.getSiteContent().then(function (over) {
      var items = (over && over.cases && over.cases.items)
        || (ABW.content.cases && ABW.content.cases.items) || [];
      host.innerHTML = '';
      host._model = JSON.parse(JSON.stringify(items));

      host._model.forEach(function (item, i) {
        var box = document.createElement('fieldset');
        box.className = 'admin-block';
        var lg = document.createElement('legend');
        lg.textContent = '案件 ' + (i + 1) + '（錨點 ' + item.id + '，不可更動）';
        box.appendChild(lg);

        var t = field('標籤（例：關係霸凌）', item.tag);
        t.box.addEventListener('input', function () { item.tag = t.box.value; });
        box.appendChild(t.wrap);

        var h = field('標題', item.title);
        h.box.addEventListener('input', function () { item.title = h.box.value; });
        box.appendChild(h.wrap);

        (item.fields || []).forEach(function (f) {
          var q = field('小標', f.q);
          q.box.addEventListener('input', function () { f.q = q.box.value; });
          box.appendChild(q.wrap);
          var a = field('內容（粗體寫成 **這樣**）', f.a, 4);
          a.box.addEventListener('input', function () { f.a = a.box.value; });
          box.appendChild(a.wrap);
        });
        host.appendChild(box);
      });
    });
  }

  /* ---- 你該知道的三件事 ---- */
  function renderLawEditor() {
    var host = $('[data-admin="law-fields"]');
    if (!host) return Promise.resolve();
    return ABW.provider.getSiteContent().then(function (over) {
      var secs = (over && over.lawPage && over.lawPage.sections)
        || (ABW.content.lawPage && ABW.content.lawPage.sections) || [];
      host.innerHTML = '';
      host._model = JSON.parse(JSON.stringify(secs));

      host._model.forEach(function (sec) {
        var box = document.createElement('fieldset');
        box.className = 'admin-block';
        var lg = document.createElement('legend');
        lg.textContent = sec.title + '（錨點 ' + sec.id + '）';
        box.appendChild(lg);

        var h = field('段落標題', sec.title);
        h.box.addEventListener('input', function () { sec.title = h.box.value; });
        box.appendChild(h.wrap);

        (sec.blocks || []).forEach(function (b, bi) {
          var tag = document.createElement('p');
          tag.className = 'admin-block-type';
          tag.textContent = '區塊 ' + (bi + 1) + '：' + b.type + '（型別不可更動）';
          box.appendChild(tag);

          if (b.type === 'para' || b.type === 'note' || b.type === 'quote') {
            var t = field('文字（粗體寫成 **這樣**）', b.text, 4);
            t.box.addEventListener('input', function () { b.text = t.box.value; });
            box.appendChild(t.wrap);
            if (b.type === 'quote') {
              var c = field('條號出處', b.cite);
              c.box.addEventListener('input', function () { b.cite = c.box.value; });
              box.appendChild(c.wrap);
            }
          } else if (b.type === 'steps') {
            (b.items || []).forEach(function (s, si) {
              var st = field('步驟 ' + (si + 1) + ' 標題', s.title);
              st.box.addEventListener('input', function () { s.title = st.box.value; });
              box.appendChild(st.wrap);
              var sx = field('步驟 ' + (si + 1) + ' 內容', s.text, 3);
              sx.box.addEventListener('input', function () { s.text = sx.box.value; });
              box.appendChild(sx.wrap);
            });
          } else if (b.type === 'list') {
            (b.items || []).forEach(function (_t, li) {
              var x = field('第 ' + (li + 1) + ' 項', b.items[li], 2);
              x.box.addEventListener('input', function () { b.items[li] = x.box.value; });
              box.appendChild(x.wrap);
            });
          } else if (b.type === 'contacts') {
            (b.items || []).forEach(function (ct, ci) {
              var n = field('第 ' + (ci + 1) + ' 項　號碼／代稱', ct.num);
              n.box.addEventListener('input', function () { ct.num = n.box.value; });
              box.appendChild(n.wrap);
              var x = field('第 ' + (ci + 1) + ' 項　說明', ct.text, 2);
              x.box.addEventListener('input', function () { ct.text = x.box.value; });
              box.appendChild(x.wrap);
            });
          } else if (b.type === 'links') {
            (b.items || []).forEach(function (lk, li) {
              var n = field('連結 ' + (li + 1) + ' 文字', lk.label);
              n.box.addEventListener('input', function () { lk.label = n.box.value; });
              box.appendChild(n.wrap);
            });
          }
        });
        host.appendChild(box);
      });
    });
  }

  function bindSave(formSel, hostSel, noteSel, key, wrap) {
    var form = $(formSel);
    if (!form) return;
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var host = $(hostSel);
      var note = $(noteSel);
      /* ⛔ 先拿現況再疊：直接整包覆蓋的話，兩個人同時開後台時後存的會蓋掉先存的 */
      ABW.provider.getSiteContent()
        .then(function (over) {
          over = over || {};
          over[key] = wrap(host._model);
          return ABW.provider.setSiteContent(over);
        })
        .then(function () {
          if (note) { note.textContent = '已儲存。前台重新整理就會看到。'; note.hidden = false; }
        })
        .catch(function (err) {
          if (note) { note.textContent = '儲存失敗：' + err.message; note.hidden = false; }
        });
    });
  }

  function boot() {
    bindSave('[data-admin="cases-form"]', '[data-admin="cases-fields"]',
      '[data-admin="cases-note"]', 'cases', function (m) { return { items: m }; });
    bindSave('[data-admin="law-form"]', '[data-admin="law-fields"]',
      '[data-admin="law-note"]', 'lawPage', function (m) { return { sections: m }; });
    return renderCasesEditor().then(renderLawEditor);
  }

  ABW.adminContent = { boot: boot, renderCasesEditor: renderCasesEditor, renderLawEditor: renderLawEditor };
})(window);
