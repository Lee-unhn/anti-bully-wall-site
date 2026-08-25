/* keywords.js — 守門用的詞庫。
 *
 * 三類的處理方式各不相同，實作時不得混用（裁定 2026-08-17）：
 *   selfHarm — 命中「不阻擋送出」，改跳求助資源卡。
 *   personal — 姓名／校名，自動遮成 ○○ 並提示已遮蔽。
 *   criminal — 明確犯罪陳述，照常收下，後台標記待人工。
 *
 * 本檔在瀏覽器與 node 都能載入（scripts/guard-probe.js 直接 require 它跑樣本測試）。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.ABW = root.ABW || {};
    root.ABW.defaultKeywords = api.defaultKeywords;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* 自傷／輕生訊號。命中只用來「遞出求助資源」，不是用來擋人說話。
   * 寧可多攔一點跳出專線，也不要漏掉正在求救的人。 */
  var SELF_HARM = [
    '想死', '不想活', '活不下去', '不想活了', '撐不下去', '撐不住了',
    '自殺', '輕生', '尋短', '自我了斷', '一了百了',
    '結束生命', '結束一切', '想結束', '解脫',
    '自殘', '自傷', '傷害自己', '割腕', '割自己',
    '跳下去', '跳樓', '燒炭', '上吊',
    '吞藥', '安眠藥', '把藥吃完',
    '消失比較好', '不在比較好', '沒有我比較好', '沒有人會想念我',
    '沒有明天', '不想醒來', '睡著就不要醒'
  ];

  /* 明確犯罪陳述。照常收下，只在後台標記待人工判斷，不影響上牆流程。 */
  var CRIMINAL = [
    '打我', '揍我', '踹我', '推我下樓', '把我關',
    '勒索', '恐嚇', '威脅我', '搶我錢', '要我付錢',
    '偷拍', '裸照', '外流', '散布我的',
    '性騷擾', '摸我', '強迫我',
    '弄壞我的', '偷我的'
  ];

  /* 姓名遮蔽的兩條規則（見 guard.js）：
   * 1. 校名＝任意前綴 + SCHOOL_SUFFIX → 前綴遮成 ○○，保留後綴讓句子還讀得通。
   * 2. 稱謂＝常見姓氏 + TITLE → 姓氏遮成 ○。
   * 另有 names 清單供管理者在後台補特定姓名（預設空，由 ABW-ASSETS 之後維護）。 */
  var SCHOOL_SUFFIX = [
    '國小', '國中', '高中', '高職', '高工', '高商', '國中部', '高中部',
    '附中', '附小', '實中', '女中', '中學', '小學', '大學', '科大', '技術學院', '專科'
  ];

  var TITLE = [
    '老師', '導師', '主任', '教官', '校長', '教練', '輔導老師',
    '同學', '學長', '學姊', '學姐', '學弟', '學妹', '班長', '風紀'
  ];

  var SURNAME = ('王李張劉陳楊黃趙吳周徐孫馬朱胡郭何高林羅鄭梁謝宋唐許韓馮鄧曹彭曾蕭'
    + '田董袁潘蔣蔡余杜葉程蘇魏呂丁任沈姚盧姜崔鍾譚陸汪范金石廖賈夏韋方白鄒孟熊秦'
    + '邱江尹薛段雷侯龍史陶黎賀顧毛郝龔邵萬錢嚴賴洪武莫孔游簡施柯翁').split('');

  function defaultKeywords() {
    return {
      version: 2,
      selfHarm: SELF_HARM.slice(),
      criminal: CRIMINAL.slice(),
      personal: {
        names: [],                       /* 管理者後台自行補的特定姓名 */
        schoolSuffixes: SCHOOL_SUFFIX.slice(),
        titles: TITLE.slice(),
        surnames: SURNAME.slice()
      }
    };
  }

  return { defaultKeywords: defaultKeywords };
});
