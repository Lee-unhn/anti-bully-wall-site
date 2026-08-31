/* triage.js — 自動審核。決定一則留言是「直接上牆」還是「留給人看」。
 *
 * 產品裁定 2026-08-31（Lee）：**預設放行，只攔判不準的**。
 * 原本是反過來的——一律進待審佇列，人工通過才上牆。那個設計在沒有人
 * 值班的時候等於整面牆是死的：投稿者說完話，看到的是「檢視中」，然後
 * 永遠停在那裡。
 *
 * ⛔ 這支不是「過濾器」，是「分流器」。它從來不退件、不刪改內容——
 *    唯一的輸出是「這則現在上牆，還是等人看過再上牆」。退件只有人能做。
 *
 * ⛔ 攔下來的理由要能對投稿者說得出口。所以每一條 reason 都有 why，
 *    而且 why 是寫給投稿者看的，不是寫給後台看的。
 *
 * 前端分流是體驗，不是防線：真後端必須在 POST /messages 重跑一次
 * （見 docs/api-contract.md §2）。前端跑一次的意義是，本機模式下也有
 * 一致的行為，而且投稿者當下就知道自己的話有沒有上牆。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.ABW = root.ABW || {};
    root.ABW.triage = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MASK_CHAR = '\u25cb';

  /* 結構化的識別資訊。這些不是「詞」是「形狀」，所以不放 keywords.js
   * （那個檔是給人維護詞彙的），放在這裡跟判斷邏輯綁在一起。
   *
   * ⛔ 命中這些一律轉人工，不要改成自動遮蔽：guard.js 遮的是姓名校名這種
   *    有固定形狀又不影響句意的東西；電話跟帳號遮掉之後，投稿者會以為
   *    自己的聯絡方式還在上面，而我們其實已經改了他的話。
   */
  /* ⛔ 電話／email／身分證／社群帳號**不在這裡**：它們由 guard.maskHandles()
   *    直接遮掉，遮完就不可能再命中任何形狀。留在這裡只會讓人以為還有一道
   *    防線，其實是死碼（裁定 2026-08-31，Lee：帳號要擋，不然被找到就失去意義）。
   *    下面留的三種是「要看上下文才知道算不算」的，所以只轉人工不遮：
   *    網址可能是新聞連結、班級與地址單獨出現不一定認得出人。 */
  var PATTERNS = [
    { code: 'url',     why: '看起來像網址',
      re: /https?:\/\/|www\.|\.com|\.net|\.org|\.tw(?![\u4e00-\u9fff])/i },
    { code: 'class',   why: '看起來像班級，加上其他線索可能認得出是誰',
      re: /[一二三四五六七八九1-9]\s*年\s*[一二三四五六七八九十\d]{1,2}\s*班/ },
    { code: 'address', why: '看起來像地址',
      re: /[\u4e00-\u9fff]{1,3}[縣市][\u4e00-\u9fff]{0,6}[鄉鎮市區][\u4e00-\u9fff]{0,10}[路街][\u4e00-\u9fff\d]{0,6}號/ }
  ];

  /* 遮蔽命中幾個以上就轉人工。
   * 一兩個是「順口提到」，遮掉就沒事；三個以上代表整句話都在指認某個人，
   * 遮完之後往往還是認得出來——那是人該看的，不是機器該放行的。 */
  var MASK_HITS_LIMIT = 3;

  /* 遮罩符號佔比上限。超過代表這句話遮完已經不成句了。 */
  var MASK_RATIO_LIMIT = 0.3;

  function findTerms(text, terms) {
    var hits = [];
    for (var i = 0; i < terms.length; i++) {
      if (terms[i] && text.indexOf(terms[i]) !== -1) hits.push(terms[i]);
    }
    return hits;
  }

  function countMask(text) {
    var n = 0;
    for (var i = 0; i < text.length; i++) if (text.charAt(i) === MASK_CHAR) n++;
    return n;
  }

  /**
   * decide(scan, keywords) -> {
   *   status:  'approved' | 'pending'
   *   reasons: [{ code, why }]      給投稿者看的說法
   *   auto:    true                 標記這個決定是機器下的（後台要看得出來）
   * }
   *
   * scan 是 guard.scan() 的回傳值。這裡只讀不改。
   */
  function decide(scan, keywords) {
    if (!scan || typeof scan.body !== 'string') {
      throw new Error('[ABW] triage.decide 需要 guard.scan 的回傳值');
    }
    if (!keywords) throw new Error('[ABW] triage.decide 缺 keywords');

    var body = scan.body;
    var flags = scan.flags || [];
    var hits = scan.hits || {};
    var reasons = [];

    function hold(code, why) { reasons.push({ code: code, why: why }); }

    /* 1. 自傷訊號——不擋送出（guard 的裁定），但不直接上牆。
     *    理由不是「這種話不該說」，是「未經處理的自傷描述會被下一個
     *    正在難受的人讀到」（裁定 2026-08-17）。求助卡照樣會跳。 */
    if (flags.indexOf('self_harm') !== -1) {
      hold('self_harm', '裡面有讓我們擔心你的句子，我們想先看過再放上去');
    }

    /* 2. 明確犯罪陳述——涉及第三人，而且往往是該報案而不是該貼牆的事。 */
    if (flags.indexOf('criminal') !== -1) {
      hold('criminal', '裡面提到可能違法的行為，需要人再看一次');
    }

    /* 3. 聯絡方式。guard 已經把帳號遮掉了，這裡仍然轉人工——
     *    遮蔽是規則比對，規則永遠可能漏，人是最後一道。 */
    if (flags.indexOf('contact') !== -1) {
      hold('contact', '裡面有可以找到你的帳號或聯絡方式，我們已經先把它拿掉了');
    }

    /* 4. 遮完還是認得出是誰。 */
    var personalHits = (hits.personal || []).length;
    if (personalHits >= MASK_HITS_LIMIT) {
      hold('over_identified', '裡面提到的人太具體，即使遮起來還是可能被認出來');
    }

    /* ⛔ 扣掉「遮聯絡方式」造成的遮罩：那些 ○ 是我們自己放的，不是這句話
     * 本來就在指認某個人。不扣的話，任何一個 IG 帳號都會順帶觸發
     * over_masked，後台會看到兩個理由而其中一個是假的。
     * 長度相等是因為遮蔽一律等長替換。 */
    var contactMasked = (hits.contact || []).reduce(function (n, h) { return n + h.length; }, 0);
    var masked = countMask(body) - contactMasked;
    if (body.length > 0 && masked / body.length > MASK_RATIO_LIMIT) {
      hold('over_masked', '遮蔽之後句子已經看不懂了，我們想確認要放上去的樣子');
    }

    /* 4. 結構化的識別資訊。 */
    for (var i = 0; i < PATTERNS.length; i++) {
      if (PATTERNS[i].re.test(body)) hold(PATTERNS[i].code, PATTERNS[i].why);
    }

    /* 5. 辱罵字眼。⛔ 命中不等於這個人在罵人——受害者複述別人罵他的話
     *    也會命中，而那正是最需要人來看的一種。所以是轉人工不是退件。 */
    var abuseHits = findTerms(body, keywords.abuse || []);
    if (abuseHits.length) {
      hold('abusive', '裡面有比較重的字眼，我們想先看過');
    }

    /* 6. 近乎空白或純符號。 */
    var stripped = body.replace(/\s/g, '');
    if (stripped.length < 2) {
      hold('too_short', '內容太短，看不出想說什麼');
    } else if (!/[\u4e00-\u9fff\u3040-\u30ffA-Za-z]/.test(stripped)) {
      hold('no_content', '裡面沒有文字');
    }

    /* 7. 同一個字連打——洗版最常見的形狀。 */
    /* ⛔ 測 original 不測 body：遮蔽會留下一長串 ○，那是我們放的不是他打的。
     *    測 body 的話，任何一個長一點的帳號都會被判成洗版。 */
    if (/(.)\1{9,}/.test(scan.original || body)) {
      hold('flooding', '有一段重複的字元');
    }

    return {
      status: reasons.length ? 'pending' : 'approved',
      reasons: reasons,
      auto: true
    };
  }

  return { decide: decide, PATTERNS: PATTERNS, MASK_HITS_LIMIT: MASK_HITS_LIMIT };
});
