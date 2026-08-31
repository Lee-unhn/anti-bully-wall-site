/* prefs.js — 這台裝置上的顯示偏好，唯一擁有者。
 *
 * 為什麼不塞進 data-provider.js：那支的職責是「留言資料」，兩種實作
 * （本機／真後端）都要能換。字級是純粹的裝置偏好，永遠不該送到伺服器，
 * 也永遠不該跟著帳號走——放進 provider 會逼 ApiProvider 也長出一套
 * 它根本不該有的偏好 API。
 *
 * ⛔ 這支**不得**碰任何留言資料。它拿到 storage 的權限是因為職責單一，
 *    一旦開始存留言就變成第二個資料層，G5 在守這件事。
 *
 * ⛔ key 一律走白名單。沒有白名單的話，下一個人會把「暫存草稿」「上次看到
 *    哪一則」這種真的算資料的東西也塞進來，而且不會有人發現。
 */
(function (global) {
  'use strict';

  var ABW = global.ABW = global.ABW || {};

  /* 允許的偏好。每一項都必須是「換一台裝置就該重來」的東西。 */
  var ALLOWED = {
    'abw.fontsize': true    /* 字級：sm / md / lg */
  };

  function assertKey(key) {
    if (!ALLOWED[key]) {
      throw new Error('[ABW] prefs 只收白名單內的裝置偏好，未登錄的 key：' + key);
    }
  }

  /* 讀不到就回 fallback。
   * ⛔ 不要讓它往外丟例外：無痕視窗與封鎖網站資料的瀏覽器會在存取當下就丟，
   *    偏好是便利功能不是必要功能，讀不到不該讓整個面板掛掉。 */
  function get(key, fallback) {
    assertKey(key);
    try {
      var v = global.localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function set(key, value) {
    assertKey(key);
    try {
      global.localStorage.setItem(key, String(value));
      return true;
    } catch (e) {
      return false;   /* 存不進去也要能繼續用，只是換頁後會回到預設 */
    }
  }

  ABW.prefs = { get: get, set: set, ALLOWED: ALLOWED };
})(window);
