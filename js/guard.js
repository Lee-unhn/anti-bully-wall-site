/* guard.js — 送出前守門。純函式，無 DOM、無儲存，瀏覽器與 node 都能載入。
 *
 * 三類命中的處置完全不同，這是產品裁定不是實作偏好（2026-08-17）：
 *
 *   selfHarm — **不阻擋送出**，回傳 flag 讓前端遞出求助資源卡。
 *              阻擋等於對正在求救的人關門。
 *   personal — 姓名／校名自動遮成 ○，回傳遮蔽後的 body 與提示。
 *   criminal — 照常收下，只標記讓後台人工看。
 *
 * 前端守門是體驗，不是防線：真後端必須在 POST /messages 重跑一次（見 api-contract §2）。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.ABW = root.ABW || {};
    root.ABW.guard = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MASK_CHAR = '○';

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function findTerms(text, terms) {
    var hits = [];
    for (var i = 0; i < terms.length; i++) {
      if (terms[i] && text.indexOf(terms[i]) !== -1) hits.push(terms[i]);
    }
    return hits;
  }

  /* 校名：任意前綴 + 後綴 → 前綴遮掉，保留後綴，句子還讀得通（「○○國中」）。
   *
   * 前綴取後綴前最多 4 個中文字，但**排除高頻虛字**——否則「我在建國國中」會被吃成
   * 「○○○○國中」，把使用者自己的話也遮掉了。排除後結果是「我在○○國中」。
   * 這裡只影響遮多少，不影響遮不遮：識別字一定會被遮掉（guard-probe B 組在驗）。 */
  /* 注意：數字國字（一三五…）**不能**放進來——「北一女中」「三重高職」「五股國中」
   * 的識別字本身就含數字，排掉它們會直接漏遮。這是加這張表時踩到的第一個坑。 */
  var STOP_CHARS = '我你他她它們的了在被和跟與到去就都很也還沒有這那是不個天年月日時候前後從對把讓要會想說'
    + '念讀上下裡外每';

  function maskSchools(text, suffixes) {
    var hits = [];
    var out = text;
    var sorted = suffixes.slice().sort(function (a, b) { return b.length - a.length; });
    sorted.forEach(function (suffix) {
      var re = new RegExp('((?:(?![' + STOP_CHARS + '])[\\u4e00-\\u9fff]){1,4})' + escapeRe(suffix), 'g');
      out = out.replace(re, function (whole, prefix) {
        hits.push(whole);
        return new Array(prefix.length + 1).join(MASK_CHAR) + suffix;
      });
    });
    return { text: out, hits: hits };
  }

  /* 稱謂：常見姓氏 + 職稱／關係 → 姓氏遮掉（「○老師」）。 */
  function maskTitles(text, surnames, titles) {
    var hits = [];
    var surnameClass = '[' + surnames.join('') + ']';
    var sorted = titles.slice().sort(function (a, b) { return b.length - a.length; });
    var out = text;
    sorted.forEach(function (title) {
      var re = new RegExp('(' + surnameClass + ')' + escapeRe(title), 'g');
      out = out.replace(re, function (whole) {
        hits.push(whole);
        return MASK_CHAR + title;
      });
    });
    return { text: out, hits: hits };
  }

  /* 管理者在後台補的特定姓名，整串遮掉。 */
  function maskNames(text, names) {
    var hits = [];
    var out = text;
    names.slice().sort(function (a, b) { return b.length - a.length; }).forEach(function (name) {
      if (!name) return;
      var re = new RegExp(escapeRe(name), 'g');
      if (re.test(out)) {
        hits.push(name);
        out = out.replace(re, new Array(name.length + 1).join(MASK_CHAR));
      }
    });
    return { text: out, hits: hits };
  }

  /**
   * scan(text, keywords) -> {
   *   body,            遮蔽後的內容（送出用的就是這個）
   *   original,        原文（不送出、不儲存，只給前端顯示差異）
   *   flags,           ['self_harm' | 'masked' | 'criminal']
   *   blocked,         永遠是 false —— 守門不擋人說話
   *   hits: { selfHarm: [], personal: [], criminal: [] }
   * }
   */
  function scan(text, keywords) {
    if (typeof text !== 'string') throw new Error('[ABW] guard.scan 只吃字串');
    if (!keywords) throw new Error('[ABW] guard.scan 缺 keywords');

    var personal = keywords.personal || {};
    var flags = [];

    var selfHarmHits = findTerms(text, keywords.selfHarm || []);
    var criminalHits = findTerms(text, keywords.criminal || []);

    var byName = maskNames(text, personal.names || []);
    var bySchool = maskSchools(byName.text, personal.schoolSuffixes || []);
    var byTitle = maskTitles(bySchool.text, personal.surnames || [], personal.titles || []);

    var personalHits = byName.hits.concat(bySchool.hits, byTitle.hits);

    if (selfHarmHits.length) flags.push('self_harm');
    if (personalHits.length) flags.push('masked');
    if (criminalHits.length) flags.push('criminal');

    return {
      body: byTitle.text,
      original: text,
      flags: flags,
      blocked: false,
      hits: { selfHarm: selfHarmHits, personal: personalHits, criminal: criminalHits }
    };
  }

  return { scan: scan, MASK_CHAR: MASK_CHAR };
});
