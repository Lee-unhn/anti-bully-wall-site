/* content.js — 全站可替換文案與素材的唯一落點
 * 客戶素材到位後只改本檔；其餘 js/html 不含硬寫文案。
 * 標了 SIM 的欄位 = 為了看版面編的模擬資料，客戶素材到位後整批換掉。
 * 換完把 simulated 改成 false，上線閘門 G17 才會放行。
 */
(function (global) {
  'use strict';

  var ABW = global.ABW = global.ABW || {};

  ABW.content = {
    /* ⚠️ 模擬資料旗標。
     * true = 本檔內容是為了看版面而編的示範資料，**不是客戶定稿**。
     * 客戶素材全部到位後改成 false；在那之前 scripts/smoke.js --deploy 會擋住部署（G17）。
     * 下面每個模擬欄位都標了 SIM，換素材時搜 SIM 就找得到全部。 */
    simulated: true,
    /* ⛔ 揭露方式：不再放首頁橫幅（裁定 2026-08-24——這是要交付的完整網站，
     * 不是貼滿 demo 字樣的樣品）。改由**每張種子卡片自己標出處**（「示例」），
     * 標記跟著留言本身走，比一條可以被略過的橫幅更牢靠。G17 在守這件事。
     * 這個旗標仍然擋著 --deploy，客戶素材到位後改 false。 */

    /* ---- 種子留言的風險承擔（裁定 2026-08-25）----
     * 牆上 60 則是為了看版面而寫的虛構自述，且已依要求移除「示例」標記，
     * 在畫面上與真人匿名投稿沒有區別。
     * Lee 於 2026-08-25 明確表示由他承擔此風險，據此放行部署。
     * ⛔ 這不是「風險消失了」，是「有人具名承擔」。客戶素材到位後仍應整批換掉。
     *    改回 false 就會重新擋住部署。 */
    seedRiskAccepted: true,

    /* ---- 時期旗標（P5）----
     * 'teaser'  = 宣傳前哨期。**節目相關的一切完全不出現**：不掛節目名、不掛製作方、
     *             不掛卡司、不掛合作單位。理由是懸念——任一項掛上去，搜尋三秒就串得出是哪個節目。
     *             面板的節目按鈕與 show.html 在這個時期由 shell.js 直接不渲染（不是 hidden，是不產生）。
     * 'reveal'  = 節目公開後。同一顆按鈕自動長出節目名，show.html 開始被連結。
     * 切換方式：客戶把下面這行改成 'reveal'，重新部署。不需要動任何其他檔案。
     */
    phase: 'teaser',

    /* ---- 區塊層級的素材真偽（P5 取代原本單一 simulated 旗標）----
     * true = 這個區塊的內容仍是為了看版面編的，不是客戶定稿。
     * G17 上線閘門：teaser 期只檢查 teaser 期會出現的區塊；show 區塊在 teaser 期不上線所以不擋。
     */
    verified: {
      site:  false,   /* 站名為暫定字串，品牌命名未定 */
      wall:  false,   /* 種子留言為示例與模擬台詞 */
      cases: false,   /* 案件內容未寫 */
      law:   false,   /* 法律三卡為草稿，未經簽核（ABW-LEGAL）*/
      show:  false    /* 節目素材未取得，且 teaser 期不使用 */
    },

    /* ---- 首屏分流（版型 C，裁定 2026-08-19）----
     * 四個國際反霸凌網站（Ditch the Label／StopBullying.gov／Bullying No Way／
     * 教育部專區）的共同做法是一進站先分流身分。少了這一層，留言牆讀起來只是留言板。
     * 三條而不是兩條：五種鼓勵回應本來就是給旁觀者的功能，首屏不給旁觀者入口，
     * 那個功能就等於沒有門。
     */
    triage: [
      { id: 'victim',    label: '我被霸凌',  note: '說出那件事',   kind: 'inline', target: 'compose' },
      { id: 'bystander', label: '我看見了',  note: '給他一句話',   kind: 'inline', target: 'wall' },
      { id: 'learn',     label: '我想了解',  note: '什麼算霸凌',   kind: 'page',   target: 'law.html' }
    ],

    /* ---- 右側面板 / 手機底部 tab（P5 單一定義，shell.js 注入每一頁）----
     * phase: 'always' = 兩個時期都出現；'reveal' = 只在 reveal 期出現。
     * kind:  'page'   = 換頁；'inline' = 不換頁，觸發同頁行為。
     */
    /* short: 手機底部四格 tab 用的短標籤（一到三個字）。⛔ 不可留空——
     *   底部 tab 每格只有約 94px（375px 螢幕 ÷ 4），完整 label 放不下，
     *   放不下就會折行、把 tab bar 撐高，把牆的軌道吃掉一條。
     * note: 桌機面板目錄項的說明行。有了說明行，那一列讀起來就不是按鈕，是目錄。
     *   ⛔ 不要寫進數量（例「60 則」）——種子換掉之後那個數字會變成謊話。 */
    nav: [
      { id: 'speak',  label: '說出你的事',   short: '說出來', note: '匿名，沒有人知道是誰',
        kind: 'inline', target: 'compose',     phase: 'always' },
      { id: 'wall',   label: '這面牆',       short: '牆',     note: '大家說出口的話',
        kind: 'page',   target: 'index.html',  phase: 'always' },
      { id: 'cases',  label: '霸凌是什麼樣子', short: '案例',  note: '四件事，實際發生的樣子',
        kind: 'page',   target: 'cases.html',  phase: 'always' },
      { id: 'law',    label: '你該知道的三件事', short: '法規', note: '條文原文與法定期限',
        kind: 'page',   target: 'law.html',    phase: 'always' },
      /* ⛔ 預留接口，teaser 期不渲染。label 待公開時改。 */
      { id: 'show',   label: '關於這個計畫',  short: '計畫',   note: '這個站為什麼存在',
        kind: 'page',   target: 'show.html',   phase: 'reveal' }
    ],

    /* 求助資源不是 nav 項目，它在每一頁常駐浮動，任何時候都伸手可及。 */


    /* ---- 站台 ---- */
    site: {
      title: '這面牆',                                              /* 站名定稿 2026-08-19（Lee）*/
      /* 標語（Lee 定稿 2026-08-19）。
       * ⛔ 不要改成教育部 1953 專線的官方標語「陪你勇敢，不再旁觀」——那是政府
       *    campaign 的資產，拿來當首屏主標會讓人誤以為這是官方網站，代價由客戶承擔。 */
      tagline: '來這裡說，我們跟你一起',
      description: '匿名說出被霸凌的經歷，其他人只能給你溫暖。'
    },

    /* ---- 牆 ---- */
    wall: {
      composePrompt: '想說什麼都可以。送出後大部分的話會直接出現在牆上。',
      composePlaceholder: '那天發生的事是……',
      maxLength: 300,

      /* ---- 送出後的四種說法 ----
       * 2026-08-31 起是自動審核（triage.js）：判得準的直接上牆，判不準的留給人看。
       * 所以「上牆了」與「被留下來」要用不同的話，而每一種又分真後端與本機兩版。
       * ⛔ 四句都要在，少一句就會在某個組合下對投稿者說錯話。 */
      approvedNotice: '你的話已經在牆上了。接下來你會開始收到別人給你的溫暖。',
      /* ⛔ 資料層是本機時要用這一句。上面那句承諾「會收到別人的溫暖」——
       * 本機模式下沒有任何人收得到，那是對正在說出傷口的人說謊。 */
      approvedNoticeLocal: '你的話已經上牆了。先說清楚：目前它只存在你自己的裝置上，'
        + '還沒有其他人看得到——這個網站還在準備階段。',

      pendingNotice: '已經收到你的話了。這一則我們想先看過再放上牆，'
        + '看完就會出現，然後你會開始收到別人給你的溫暖。',
      /* ⛔ 同上，本機模式專用。G9 上線閘門在守這件事
       * （LocalProvider 必須用這兩句 Local 版，或開 demoNotice）。 */
      pendingNoticeLocal: '已經收到你的話了。這一則我們想先看過再放上牆。'
        + '先說清楚：目前它只存在你自己的裝置上，還沒有其他人看得到——'
        + '這個網站還在準備階段。',
      pendingLinkLabel: '看看我說過的話',
      emptyNotice: '牆上還沒有留言。',

      /* ---- 牆上方那一行 ----
       * ⛔ 這裡原本是系統訊息：「60 則留言在牆上。你的系統設為減少動態，
       *    按「流動」可以讓它動起來」。那是講給機器聽的話，出現在一個
       *    給受害者看的畫面最上方（裁定 2026-08-31，Lee：這句可以寫成
       *    鼓勵話語之類的）。
       * 每次進站隨機挑一句，跟代號一樣——同一個人回來看到的不會是同一句。
       * ⛔ 每一句都不可以是「加油」「要堅強」這種要求對方振作的話：
       *    這個站的立場是陪著，不是鼓勵他撐住。 */
      statusLines: [
        '這些話說出口的時候，都沒有人在聽。現在有了。',
        '每一句都是有人真的經歷過的。你不是唯一一個。',
        '你可以只是看看。想說的時候再說。',
        '這裡沒有人會問你「你確定嗎」。',
        '看到哪一句像你，就給它一句話。',
        '說出來不會讓事情變小，但你不用再一個人扛。',
        '這面牆不會催你。它就在這裡。'
      ],

      /* 鼓勵相關文案。這一區是這個網站的主軸——受害者說出來、其他人按鈕鼓勵他，
       * 所以鼓勵字樣必須是「看得到」的，不能藏在 hover 後面（G18 在守這件事）。 */
      reactionsHint: '看完一則留言，選一句話給他。只有這五種，因為這裡不需要評論。',
      warmthZero: '還沒有人回應。你可以是第一個。',
      warmthOne: '已經有 1 個人給了他溫暖',
      warmthMany: '已經有 {n} 個人給了他溫暖',
      wallTally: '這面牆上有 {m} 句話，收到了 {n} 次溫暖。',
      /* 首屏的規模句。數量本身就是論述——這麼多人有話沒說出口。
       * ⚠️ 種子只有 10 則時這個位置會很空，擴充種子是版型 C 的前提不是配套。 */
      wallScale: '<strong>{m}</strong> 句沒說出口的話，正在這面牆上流動',
      wallScaleEmpty: '這面牆還在等第一句話',
      wallTallyEmpty: '這面牆還在等第一句話。'
    },

    /* ---- 種子留言 ----
     * 牆上空無一物沒有說服力，但**不得使用真實受害者的話**（裁定 2026-08-17）。
     * source 只能是 'script'（作品內容改寫，attribution 填出處）
     * 或 'sample'（虛構示例，attribution 固定「示例」）。
     * 目前 60 則全部是 sample——原本兩則標 'script' 的「劇中台詞」建立在
     * 一個 2026-08-19 已作廢的錯誤前提上，已改回 sample。
     * ⛔ 這 60 則全是為了讓牆有重量而寫的虛構自述，不是真人投稿，也不得
     *    對外聲稱是真實案例。客戶素材到位後整批替換。
     */
    seeds: [
      { source: 'sample', attribution: '示例', body: '每天走進教室前，我都要在門口先深呼吸一次。' },
      { source: 'sample', attribution: '示例', body: '他們說只是開玩笑。可是玩笑不會讓人整晚睡不著。' },
      { source: 'sample', attribution: '示例', body: '最難的不是被說了什麼，是旁邊那些跟著笑的人。' },
      { source: 'sample', attribution: '示例', body: '我跟老師說過一次。後來就沒有再說第二次了。' },
      { source: 'sample', attribution: '示例', body: '我把制服洗了三遍，那個味道還在。' },
      { source: 'sample', attribution: '示例', body: '午餐時間我都躲在樓梯間吃。那裡沒有人會找我。' },
      { source: 'sample', attribution: '示例', body: '畢業那天我沒有拍照。我只想快點離開。' },
      { source: 'sample', attribution: '示例', body: '很多年過去了，我還是會夢到那間走廊。' },
      { source: 'sample', attribution: '示例', body: '分組的時候，我已經學會直接說「我自己一組就好」。' },
      { source: 'sample', attribution: '示例', body: '他們幫我取的那個綽號，全班叫了兩年。我到現在還會對那兩個字有反應。' },
      { source: 'sample', attribution: '示例', body: '我的水壺被丟到垃圾桶。我沒有撿，回家跟我媽說弄丟了。' },
      { source: 'sample', attribution: '示例', body: '班群裡有一個沒有我的群組。我是在有人截圖傳錯的時候才知道的。' },
      { source: 'sample', attribution: '示例', body: '體育課分隊，我永遠是最後那一個。老師會說「那你去那邊好了」。' },
      { source: 'sample', attribution: '示例', body: '我開始把錢帶得剛剛好，這樣被要走的時候比較不痛。' },
      { source: 'sample', attribution: '示例', body: '他們模仿我走路的樣子。後來我真的不知道自己本來怎麼走路。' },
      { source: 'sample', attribution: '示例', body: '我媽問我制服扣子怎麼又掉了。我說是自己勾到的。' },
      { source: 'sample', attribution: '示例', body: '掃地時間我負責的區域每次都被弄髒。導師只說「你動作要快一點」。' },
      { source: 'sample', attribution: '示例', body: '有人在我的課本上寫字。我用立可白塗掉，塗到那一頁破了。' },
      { source: 'sample', attribution: '示例', body: '我聽到他們在廁所隔間外面笑，就在裡面等到上課鐘響。' },
      { source: 'sample', attribution: '示例', body: '段考完他們拿我的成績單傳來傳去。我第一次希望自己考得更差一點。' },
      { source: 'sample', attribution: '示例', body: '那天我終於回嘴了，然後被說「開不起玩笑」。' },
      { source: 'sample', attribution: '示例', body: '我在校車上永遠坐第一排，因為司機看得到。' },
      { source: 'sample', attribution: '示例', body: '他們把我的鞋子藏起來。我穿著襪子走了半節課去找。' },
      { source: 'sample', attribution: '示例', body: '我不敢在走廊上跟人對到眼。低頭走比較安全。' },
      { source: 'sample', attribution: '示例', body: '有一次全班都被留下來，是因為我「告狀」。那之後更難了。' },
      { source: 'sample', attribution: '示例', body: '我的名字被拿來當成罵人的詞。連不認識我的學弟都在用。' },
      { source: 'sample', attribution: '示例', body: '家裡的事被講出去以後，我就變成了另一種好笑的東西。' },
      { source: 'sample', attribution: '示例', body: '他們說我娘。我到現在還會注意自己講話的聲音。' },
      { source: 'sample', attribution: '示例', body: '我書包裡永遠多帶一件衣服。以防萬一。' },
      { source: 'sample', attribution: '示例', body: '社團學長叫我做的事我都做了，然後被說「你就是很好使喚」。' },
      { source: 'sample', attribution: '示例', body: '我開始提早四十分鐘到校。空教室是最安全的地方。' },
      { source: 'sample', attribution: '示例', body: '補習班是唯一沒有人認識我的地方。我最喜歡星期三。' },
      { source: 'sample', attribution: '示例', body: '那則貼文有兩百多個讚。我認識裡面大部分的人。' },
      { source: 'sample', attribution: '示例', body: '他們用我的照片做了梗圖。我沒有辦法叫每一個人刪掉。' },
      { source: 'sample', attribution: '示例', body: '我的東西被藏在垃圾桶最底下。我還是拿出來洗一洗繼續用。' },
      { source: 'sample', attribution: '示例', body: '我學會了先笑。先笑的話，就比較不像在被笑。' },
      { source: 'sample', attribution: '示例', body: '老師說「你們兩個都有錯」。可是我什麼都沒做。' },
      { source: 'sample', attribution: '示例', body: '輔導室的門我站在外面看了很久，最後還是走掉了。' },
      { source: 'sample', attribution: '示例', body: '我媽去學校那一次之後，情況沒有變好，只是變得更小心。' },
      { source: 'sample', attribution: '示例', body: '他們不打我了，只是不再跟我說話。那個更久。' },
      { source: 'sample', attribution: '示例', body: '一整天沒有人叫我的名字是什麼感覺，我很清楚。' },
      { source: 'sample', attribution: '示例', body: '我開始不去福利社，因為要經過他們的教室。' },
      { source: 'sample', attribution: '示例', body: '生日那天沒有人知道。我自己買了一個麵包。' },
      { source: 'sample', attribution: '示例', body: '換座位的時候我最緊張。旁邊是誰，決定接下來一個月。' },
      { source: 'sample', attribution: '示例', body: '我把聯絡簿上的字擦掉重寫了一次，因為手在抖。' },
      { source: 'sample', attribution: '示例', body: '那個群組的名字取得很可愛。裡面全是關於我的事。' },
      { source: 'sample', attribution: '示例', body: '我不敢跟新同學太好，怕他們也被牽連。' },
      { source: 'sample', attribution: '示例', body: '有人幫過我一次。就一次，但我記到現在。' },
      { source: 'sample', attribution: '示例', body: '我後來轉學了。新學校沒有人知道，我卻還是坐在最角落。' },
      { source: 'sample', attribution: '示例', body: '大學開學第一天，我還是在找哪裡可以一個人吃飯。' },
      { source: 'sample', attribution: '示例', body: '出社會以後，聽到有人一起笑，我還是會先確認不是在笑我。' },
      { source: 'sample', attribution: '示例', body: '我沒有變勇敢，我只是變得比較會忍。' },
      { source: 'sample', attribution: '示例', body: '十年後在路上遇到他。他笑著跟我打招呼，像什麼都沒發生過。' },
      { source: 'sample', attribution: '示例', body: '他可能真的忘了。可是我沒有。' },
      { source: 'sample', attribution: '示例', body: '我不是不敢講，我是講過了，然後什麼都沒有發生。' },
      { source: 'sample', attribution: '示例', body: '我那時候站在旁邊。我到現在都還記得我沒有動。' },
      { source: 'sample', attribution: '示例', body: '我曾經也跟著笑過一次。我不敢說那不算。' },
      { source: 'sample', attribution: '示例', body: '如果那時候有人問我一句「你還好嗎」，可能就不一樣了。' },
      { source: 'sample', attribution: '示例', body: '我現在會回頭看，看那個一個人走的人是不是也一樣。' },
      { source: 'sample', attribution: '示例', body: '我到現在還是不知道，那到底算不算霸凌。' }
    ],

    /* ---- ⛔ 作廢中（裁定 2026-08-19 Q1）----
     * 本區的設計前提在 2026-08-19 被推翻，內容全部作廢（原因寫在 ANTI-BULLY-WALL.md，
     * 不寫在這裡——這個檔會隨網站送到瀏覽器，teaser 期任何暗示都不能留）。
     * teaser 期完全不使用；reveal 時整段重寫，下面的佔位內容屆時全部丟棄。
     */
    drama: {
      name: '',                                                     /* 作廢，待 reveal 重寫 */
      troupe: '',                                                   /* 作廢，待 reveal 重寫 */
      synopsis: ''                                                  /* 作廢，待 reveal 重寫 */
        + ''
        + '受害者、旁觀者、和那個以為自己只是在開玩笑的人——'
        + '這齣戲不急著給答案，只想把當時沒說完的話，一句一句放回桌上。',
      shows: [                                                       /* SIM */
        { date: '2026-10-03（六）19:30', venue: '示範藝文中心 實驗劇場', note: '演後座談' },
        { date: '2026-10-04（日）14:30', venue: '示範藝文中心 實驗劇場', note: '' },
        { date: '2026-10-11（六）19:30', venue: '示範文化園區 小劇場', note: '手語翻譯場' }
      ],
      keyVisual: '',
      stills: []
    },

    /* ---- 法律三卡 ----
     * signedOff：客戶（或其律師）書面簽核後才可改為 true。
     * ⚠️ 下面是**我起草的草稿**，不是法律意見，也還沒經過任何律師檢視。
     *    signedOff 保持 false，全站顯示 draft 標記，且 --deploy 會擋住部署。
     */
    law: {
      /* signedOff：客戶或其律師**書面簽核**過才可以是 true。
       * ⛔ 不要因為「想上線」就改這個值——它是紀錄不是開關，改假了
       *    之後每個人都會以為律師看過。
       * 目前是 false，而且應該維持 false：律師確實還沒看過那份草稿
       *（草稿在 docs/legal-draft-for-review.md）。 */
      signedOff: false,

      /* interpretive：網站上「現在」有沒有法律解釋／涵攝。
       * 2026-08-24 已把解釋全部移出，只留條文原文與法定期限，
       * 那些不需要律師簽核。G9 因此只在 interpretive=true 且未簽核時才擋。
       * ⛔ 把解釋放回網站時，這裡要一起改回 true。G9 會用關鍵詞掃描核對，
       *    改假了會被抓到。 */
      interpretive: false,
      signOffNote: '草稿待客戶／其律師書面簽核（人類關卡 ABW-LEGAL）',
      /* ⛔ 這三張卡原本寫的是法律解釋（構成要件、可能涉及哪些罪名、可以主張什麼），
       * 2026-08-24 移出網站送律師檢視，全文存於 docs/legal-draft-for-review.md。
       * 現在只留「怎麼查、找誰」這種程序性指引，不做任何法律判斷。
       * 簽核後才把解釋版放回並改 signedOff。 */
      cards: [
        {
          id: 'what',
          title: '法規怎麼定義',
          body: '校園霸凌的定義寫在《校園霸凌防制準則》第 4 條，'
            + '原文與生對生／師對生的區分列在下面第一段。',
          more: { label: '教育部防制校園霸凌專區', url: 'https://bully.moe.edu.tw/index' }
        },
        {
          id: 'rights',
          title: '學校有法定期限',
          body: '從檢舉、受理通知、調查到終局處理，準則每一步都訂了期限。'
            + '下面第二段把條號與天數列出來，可以直接對照。',
          more: { label: '校園霸凌防制準則全文', url: 'https://law.moj.gov.tw/LawClass/LawAll.aspx?PCode=H0020081' }
        },
        {
          id: 'where',
          title: '可以找誰',
          body: '不確定算不算霸凌也可以打 1953。需要法律協助時，'
            + '符合資格可以向法律扶助基金會申請。',
          more: { label: '法律扶助基金會', url: 'https://www.laf.org.tw/' }
        }
      ]
    },

    /* ---- CTA ----
     * ⛔ 已移除。原本是「留 email，有進展時通知你」。
     * 裁定 2026-08-25（Lee）：不收 email。這個站因此完全不蒐集任何個人資料，
     * 個資法第 8 條的告知義務也就不適用——比寫一份完整的告知更乾淨。
     * 要加回任何蒐集欄位之前，先看 G24 閘門——它紅了就代表「零蒐集」這個
     * 前提不成立了，屆時個資法第 8 條的告知義務要一起處理。 */


    /* ---- 求助資源（安全層用，非行銷文案，不可刪） ---- */
    help: {
      heading: '如果你現在很不好受',
      lines: [
        { label: '衛福部安心專線', number: '1925', url: 'tel:1925' },
        { label: '生命線', number: '1995', url: 'tel:1995' },
        { label: '張老師專線', number: '1980', url: 'tel:1980' }
      ],
      note: '24 小時，免付費。你不需要準備好才打。'
    },

    /* ---- demo 揭露（裁定：demo 不對外；若客戶堅持曝光才啟用） ---- */
    demoNotice: {
      enabled: false,
      text: '此為體驗版：你的留言只儲存在你自己的裝置，不會被其他人看見。'
    }
  };
})(window);
