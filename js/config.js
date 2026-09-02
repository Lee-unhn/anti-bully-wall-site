/* config.js — 這個站要連哪個後端。
 *
 * ⛔ 這裡的 anonKey **本來就是公開的**：它會出現在每個訪客的原始碼裡，
 *    Supabase 的設計就是如此。擋住任何人亂改的不是這把金鑰，是
 *    backend/sql/02_policies.sql 裡的 Row Level Security。
 *    ⛔ 所以絕對不可以把 service_role key 放進這個檔——那把才是真的權限，
 *       貼進來等於整個資料庫對全世界開放。
 *
 * url 留空＝維持本機模式（LocalProvider）：留言只存在訪客自己的瀏覽器，
 * 沒有人收得到。填上之後才會切到真後端。
 */
(function (global) {
  'use strict';
  var ABW = global.ABW = global.ABW || {};
  ABW.config = {
    supabase: {
      url: 'https://xppcelhclohxdkzwijbm.supabase.co',
      anonKey: 'sb_publishable_HqR--dUWLhvFXacK211aWA_o_wPyXqm'
    }
  };
})(window);
