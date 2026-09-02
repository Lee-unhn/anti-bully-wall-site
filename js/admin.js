/* admin.js — 管理後台。
 *
 * ⛔ 這一頁沒有身分驗證，檔名不好猜不是安全機制。
 *
 * 目前之所以還安全，是因為 ABW.provider 是 LocalProvider——資料只存在
 * 每個訪客自己的瀏覽器，沒有共用伺服器。任何人打開這一頁，能動的也只有
 * 他自己那份資料，碰不到別人的。
 *
 * ⛔ 危險出現在「接上真後端」的那一刻：那時這一頁就變成任何人都能通過／
 *    退回別人的留言、改姓名遮蔽清單的入口。所以下面的 guard 會在偵測到
 *    非本機資料層時**直接停用整頁**，逼你先做伺服器端驗證
 *    （見 docs/api-contract.md「後台限定端點」）。
 *    G23 閘門在守這個 guard 還在不在。
 */
(function (global) {
  'use strict';

  var ABW = global.ABW;
  var S = ABW.schema;

  var FLAG_LABEL = {
    self_harm: '自傷訊號（已遞出求助資源）',
    masked: '已遮蔽姓名／校名',
    criminal: '犯罪陳述・待人工',
    contact: '帳號／聯絡方式已遮蔽'
  };

  function $(sel) { return document.querySelector(sel); }

  /* 資料層不是本機的 → 這一頁在沒有伺服器端驗證的情況下不得運作 */
  function isLocalOnly() {
    return ABW.provider === ABW.LocalProvider;
  }

  function lockDown() {
    var main = document.querySelector('main') || document.body;
    main.innerHTML = '';
    var box = document.createElement('p');
    box.className = 'notice';
    box.textContent = '這個後台沒有身分驗證，只能在資料存放於本機時使用。'
      + '偵測到資料層已改接伺服器——請先實作伺服器端驗證再啟用本頁。';
    main.appendChild(box);
  }

  /* 自動審核攔下來的理由（triage.js 的 code）。⛔ 佇列裡現在**只剩**機器
   * 判不準的留言——2026-08-31 起判得準的直接上牆。所以審核者第一個要
   * 知道的不是「這則有什麼旗標」，是「機器為什麼不敢放行」。
   * 沒有這一欄的話，人只看得到一則看起來很正常的留言，不知道要看什麼。 */
  var HOLD_LABEL = {
    self_harm:       '自傷訊號',
    criminal:        '犯罪陳述',
    contact:         '聯絡方式',
    over_identified: '指認太具體',
    over_masked:     '遮到看不懂',
    phone:           '電話',
    email:           '電子郵件',
    url:             '網址',
    social:          '社群帳號',
    natid:           '身分證字號',
    class:           '班級',
    address:         '地址',
    abusive:         '重話',
    too_short:       '太短',
    no_content:      '無文字',
    flooding:        '洗版'
  };

  function row(msg, onDecide, actions) {
    var tr = document.createElement('tr');

    var tdTime = document.createElement('td');
    tdTime.textContent = msg.createdAt;

    var tdBody = document.createElement('td');
    tdBody.className = 'body-cell';
    tdBody.textContent = msg.body;

    var tdFlags = document.createElement('td');
    if (!msg.flags.length) {
      tdFlags.textContent = '—';
    } else {
      msg.flags.forEach(function (f) {
        var chip = document.createElement('span');
        chip.className = 'flag flag-' + f;
        chip.textContent = FLAG_LABEL[f] || f;
        tdFlags.appendChild(chip);
      });
    }

    /* 機器為什麼攔下來。放在旗標後面、動作前面——審核者的視線順序就是
     * 內容 → 為什麼要我看 → 決定。 */
    var tdHold = document.createElement('td');
    var hold = msg.hold || [];
    if (!hold.length) {
      tdHold.textContent = '—';
    } else {
      hold.forEach(function (h) {
        var chip = document.createElement('span');
        chip.className = 'flag flag-hold';
        chip.textContent = HOLD_LABEL[h] || h;
        tdHold.appendChild(chip);
      });
    }

    var tdAct = document.createElement('td');
    (actions || [[S.STATUS.APPROVED, '通過'], [S.STATUS.REJECTED, '退回']]).forEach(function (pair) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = pair[1];
      b.addEventListener('click', function () { onDecide(msg.id, pair[0]); });
      tdAct.appendChild(b);
    });

    tr.appendChild(tdTime);
    tr.appendChild(tdBody);
    tr.appendChild(tdFlags);
    tr.appendChild(tdHold);
    tr.appendChild(tdAct);
    return tr;
  }

  function fill(sel, list, actions) {
    var tbody = $('[data-admin="' + sel + '"]');
    var empty = $('[data-admin="' + sel + '-empty"]')
      || (sel === 'queue' ? $('[data-admin="empty"]') : null);
    if (!tbody) return;
    tbody.innerHTML = '';
    if (empty) empty.hidden = list.length > 0;
    list.forEach(function (m) { tbody.appendChild(row(m, decide, actions)); });
  }

  function num(sel, n) {
    var el = $('[data-admin="' + sel + '"]');
    if (el) el.textContent = String(n);
  }

  function render() {
    return Promise.all([
      ABW.provider.listPending(),
      ABW.provider.listApproved(),
      ABW.provider.listRejected ? ABW.provider.listRejected() : Promise.resolve([])
    ]).then(function (r) {
      var pending = r[0], approved = r[1], rejected = r[2];
      fill('queue', pending);
      /* ⛔ 退回區只給「還原」一個動作。要直接從退回跳到上牆，等於跳過
       * 一次完整的重看——誤判過一次的東西，值得再看一次全文再決定。 */
      fill('rejected', rejected, [[S.STATUS.PENDING, '還原到佇列']]);
      num('count', pending.length);
      /* 牆上的數字只算訪客投稿，種子不算——後台看的是「人送進來的東西」 */
      num('count-approved', approved.filter(function (m) {
        return m.source === S.SOURCE.VISITOR;
      }).length);
      num('count-rejected', rejected.length);
    });
  }

  function decide(id, status) {
    return ABW.provider.setStatus(id, status).then(render).catch(function (err) {
      console.error('[ABW] 審核失敗', err);
      throw err;
    });
  }

  function renderProviderBanner() {
    var el = $('[data-admin="provider"]');
    var local = !ABW.provider.persistent;
    el.textContent = ABW.provider.name + (local ? '（本機）' : '（持久化後端）');
    var scope = $('[data-admin="scope"]');
    if (!scope) return;
    /* ⛔ 講實話，不要含糊。這一頁公開可達，而在本機資料層下它管不到任何
     * 其他人的留言——寫得像個真的管理台就是在騙使用它的人。 */
    scope.textContent = local
      ? '⚠ 這一頁現在只看得到「你這台瀏覽器自己」送出的留言。網站還沒有共用的資料庫，'
        + '所以這裡的通過／退回不會影響其他人看到的牆。要成為真的管理台，需要先接上後端並加上登入。'
      : '已接上後端。⛔ 這一頁沒有身分驗證，必須先在伺服器端擋住未授權存取才可以繼續使用。';
    scope.setAttribute('data-state', local ? 'local' : 'server');
  }

  /* 姓名遮蔽清單：guard.js 的校名／稱謂規則抓不到的特定姓名，由管理者補在這裡。
   * 只新增不刪除的介面留給 P4 之後再議——現階段直接編輯整份清單。 */
  function renderKeywords() {
    var box = $('[data-admin="names"]');
    var summary = $('[data-admin="kw-summary"]');
    if (!box) return Promise.resolve();
    return ABW.provider.getKeywords().then(function (kw) {
      box.value = (kw.personal.names || []).join('\n');
      if (summary) {
        summary.textContent = '自傷詞 ' + kw.selfHarm.length
          + ' 筆・犯罪詞 ' + kw.criminal.length
          + ' 筆・校名後綴 ' + kw.personal.schoolSuffixes.length
          + ' 種・稱謂 ' + kw.personal.titles.length
          + ' 種・自訂姓名 ' + (kw.personal.names || []).length + ' 筆';
      }
    });
  }

  function bindKeywordForm() {
    var form = $('[data-admin="kw-form"]');
    if (!form) return;
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var box = $('[data-admin="names"]');
      var names = box.value.split('\n').map(function (s) { return s.trim(); })
        .filter(function (s) { return s.length > 0; });
      ABW.provider.getKeywords()
        .then(function (kw) {
          kw.personal.names = names;
          return ABW.provider.setKeywords(kw);
        })
        .then(renderKeywords)
        .then(function () {
          var note = $('[data-admin="kw-note"]');
          if (note) { note.textContent = '已儲存 ' + names.length + ' 筆姓名。'; note.hidden = false; }
        })
        .catch(function (err) {
          console.error('[ABW] 關鍵字儲存失敗', err);
          throw err;
        });
    });
  }

  function boot() {
    if (!isLocalOnly()) { lockDown(); return Promise.resolve(); }
    renderProviderBanner();
    bindKeywordForm();
    return ABW.provider.init()
      .then(render)
      .then(renderKeywords)
      .catch(function (err) {
        console.error('[ABW] 後台啟動失敗', err);
        throw err;
      });
  }

  ABW.admin = { boot: boot, render: render, renderKeywords: renderKeywords };
  document.addEventListener('DOMContentLoaded', function () { boot(); });
})(window);
