/* schema.js — 資料模型與全站常數。
 * 與 docs/api-contract.md 為同一份契約的兩面；改一邊必須改另一邊。
 */
(function (global) {
  'use strict';

  var ABW = global.ABW = global.ABW || {};

  /* 五種溫暖回應。固定、不可自訂、不可新增自由文字回覆。
   * 顯示計數，但全站不得出現排行／熱門榜（裁定 2026-08-17）。 */
  var REACTIONS = [
    { id: 'iknow',   label: '我懂',     glyph: '◍' },
    { id: 'notalone',label: '你不孤單', glyph: '◎' },
    { id: 'hug',     label: '抱抱你',   glyph: '❍' },
    { id: 'brave',   label: '你很勇敢', glyph: '◈' },
    { id: 'withyou', label: '我陪你',   glyph: '◐' }
  ];

  var STATUS = {
    PENDING:  'pending',   /* 送出後預設狀態，不得出現在牆上 */
    APPROVED: 'approved',  /* 人工審核通過，唯一可上牆的狀態 */
    REJECTED: 'rejected'   /* 退回，不上牆、不刪除 */
  };

  var FLAGS = {
    SELF_HARM: 'self_harm', /* 命中自傷關鍵字：不阻擋送出，前端跳求助卡 */
    MASKED:    'masked',    /* 內含姓名／校名已遮成 ○○ */
    CRIMINAL:  'criminal'   /* 明確犯罪陳述：照收，後台標記待人工 */
  };

  var SOURCE = {
    VISITOR: 'visitor',
    SCRIPT:  'script',      /* 種子留言：劇中台詞，須標示出處 */
    SAMPLE:  'sample'       /* 種子留言：虛構示例，須標示為示例 */
  };

  /* 一則留言的正規形狀。provider 兩種實作都回傳這個形狀。 */
  function makeMessage(fields) {
    return {
      id:        fields.id,
      body:      fields.body,
      alias:     fields.alias,             /* { name, hue } 本機生成，不可識別 */
      status:    fields.status || STATUS.PENDING,
      flags:     fields.flags  || [],
      source:    fields.source || SOURCE.VISITOR,
      attribution: fields.attribution || '', /* source 非 visitor 時必填 */
      reactions: fields.reactions || emptyReactions(),
      createdAt: fields.createdAt
    };
  }

  function emptyReactions() {
    var r = {};
    REACTIONS.forEach(function (x) { r[x.id] = 0; });
    return r;
  }

  function isReactionId(id) {
    return REACTIONS.some(function (x) { return x.id === id; });
  }

  ABW.schema = {
    REACTIONS: REACTIONS,
    STATUS: STATUS,
    FLAGS: FLAGS,
    SOURCE: SOURCE,
    makeMessage: makeMessage,
    emptyReactions: emptyReactions,
    isReactionId: isReactionId
  };
})(window);
