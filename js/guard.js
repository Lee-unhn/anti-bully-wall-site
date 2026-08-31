/* guard.js — 送出前守門。純函式，無 DOM、無儲存，瀏覽器與 node 都能載入。
 *
 * 三類命中的處置完全不同，這是產品裁定不是實作偏好（2026-08-17）：
 *
 *   selfHarm — **不阻擋送出**，回傳 flag 讓前端遞出求助資源卡。
 *              阻擋等於對正在求救的人關門。
 *   personal — 姓名／校名自動遮成 ○，回傳遮蔽後的 body 與提示。
 *   criminal — 照常收下，只標記讓後台人工看。
 *   contact  — FB／IG／LINE 等帳號自動遮成 ○，並標記轉人工。
 *              ⛔ 這一類**一定要遮掉**，不能只標記：漏偵測或後台誤放行，
 *              帳號就公開了，而匿名承諾只要破一次就沒了。
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

  /* ---- 聯絡方式遮蔽（2026-08-31，裁定 Lee）----
   * 「留下帳號就等於把真實身分綁在這則匿名留言上」——而且是投稿者自己交出去的。
   * ⛔ 這裡**遮掉**而不是只標記轉人工：只標記的話，偵測漏掉一種寫法那則留言就
   *    自動上牆、帳號跟著公開；就算沒漏，後台按了通過帳號一樣會出去。
   * ⛔ 遮掉之後一定要在送出提示裡告訴投稿者（wall.js 在做）。不說的話我們就是
   *    偷偷改了他的話。
   *
   * 三條規則，由寬到嚴：
   *   1. @帳號                      —— 任何地方都遮
   *   2. 平台名／聯絡意圖 ＋ 拉丁數字帳號  —— 連接詞可有可無
   *   3. 平台名／聯絡意圖 ＋ 必要連接詞 ＋ 中文名 —— 連接詞不可省
   * 第 3 條的連接詞不可省，是因為「FB上面的人」會被吃成「FB上面的○○」。
   */
  var HANDLE = '[A-Za-z0-9][A-Za-z0-9._#\-]{2,29}';
  /* 拉丁帳號前面可以有的東西：空白、常見助詞、冒號、以及 ID／帳號 等字樣 */
  var LINK_OPT = '(?:[\\s:：=＝,，]|是|的|叫|加|找|搜尋|搜|ID|id|Id|帳號|名稱|名字)*';
  /* 中文名前面**必須**出現的連接詞，至少一個 */
  var LINK_REQ = '(?:[\\s:：]*(?:搜尋|搜|找|加|叫|帳號|名稱|名字|是)[\\s:：]*)';

  /* 直接就是聯絡方式的形狀，不需要平台名當線索。
   * ⛔ 這幾種一律遮掉而不是只轉人工，理由同上：只轉人工的話，
   *    後台按一次通過就公開了，而匿名承諾只要破一次就沒了。 */
  var CONTACT_SHAPES = [
    /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g,          /* email */
    /09\d{2}[-\s]?\d{3}[-\s]?\d{3}/g,                             /* 手機 */
    /0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/g,                          /* 市話 */
    /[A-Za-z][12]\d{8}/g                                          /* 身分證字號 */
  ];

  function maskRun(n) { return new Array(n + 1).join(MASK_CHAR); }

  function platformPattern(p, latin) {
    return latin ? '\\b' + escapeRe(p) + '\\b' : escapeRe(p);
  }

  function maskHandles(text, contact) {
    var hits = [];
    var out = text;

    /* 0. 本身就是聯絡方式的形狀（email／電話／證號）。
     * ⛔ 必須排在 @帳號 前面：不然 someone@example.com 會先被當成 @example
     *    遮掉一半，剩下的殘骸既不像 email 也不像帳號，兩邊都攔不到
     *    （2026-08-31 triage-probe 實際抓到）。 */
    CONTACT_SHAPES.forEach(function (re) {
      re.lastIndex = 0;
      out = out.replace(re, function (whole) {
        hits.push(whole);
        return maskRun(whole.length);
      });
    });

    /* 1. @帳號。前面不可以是字母數字，否則會咬進 email 的網域段。 */
    out = out.replace(new RegExp('(^|[^A-Za-z0-9._%+\-' + MASK_CHAR + '])(@' + HANDLE + ')', 'g'),
      function (whole, pre, handle) {
        hits.push(handle);
        return pre + maskRun(handle.length);
      });

    if (!contact) return { text: out, hits: hits };

    var latin = (contact.platformsLatin || []).map(function (p) {
      return platformPattern(p, true);
    });
    var cjk = (contact.platformsCjk || []).map(function (p) {
      return platformPattern(p, false);
    });
    var intents = (contact.intents || []).map(function (p) { return escapeRe(p); });
    var lead = latin.concat(cjk, intents);
    if (!lead.length) return { text: out, hits: hits };
    var LEAD = '(?:' + lead.join('|') + ')';

    /* 2. 平台／意圖 ＋ 拉丁數字帳號 */
    out = out.replace(
      new RegExp('(' + LEAD + LINK_OPT + ')(' + HANDLE + ')', 'gi'),
      function (whole, pre, handle) {
        hits.push(handle);
        return pre + maskRun(handle.length);
      });

    /* 3. 平台／意圖 ＋ 必要連接詞 ＋ 中文名（2–4 字）。
     * ⛔ 連接詞不可省：「FB上面的人」會被吃成「FB上面的○○」。 */
    out = out.replace(
      new RegExp('(' + LEAD + LINK_REQ + ')([\u4e00-\u9fff]{2,4})', 'gi'),
      function (whole, pre, name) {
        hits.push(name);
        return pre + maskRun(name.length);
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
    /* ⛔ 聯絡方式放在最後遮：前面幾道會把「賴老師」變成「○老師」，
     * 這裡才不會把那個已經遮掉的姓氏當成 LINE 帳號的開頭再遮一次。 */
    var byContact = maskHandles(byTitle.text, keywords.contact);

    var personalHits = byName.hits.concat(bySchool.hits, byTitle.hits);

    if (selfHarmHits.length) flags.push('self_harm');
    if (personalHits.length) flags.push('masked');
    if (byContact.hits.length) flags.push('contact');
    if (criminalHits.length) flags.push('criminal');

    return {
      body: byContact.text,
      original: text,
      flags: flags,
      blocked: false,
      hits: {
        selfHarm: selfHarmHits,
        personal: personalHits,
        criminal: criminalHits,
        contact: byContact.hits
      }
    };
  }

  return { scan: scan, MASK_CHAR: MASK_CHAR };
});
