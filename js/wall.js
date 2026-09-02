/* wall.js — 留言牆。兩種檢視模式共用同一批 DOM 節點：
 *
 *   danmaku — 右→左多軌彈幕（P5 取代原本的緩速漂浮）。滑鼠移上、鍵盤 focus
 *             或觸控點一下該則即停住，鼓勵鈕本來就常駐可見，停住只是為了好按。
 *   board — 畫布總覽。可拖曳平移、滾輪縮放，留言以穩定網格排列（B1-3）。
 *
 * 效能作法：只寫 transform（合成器friendly），不動 top/left；一支 rAF 迴圈
 * 統一更新，不是每則各開一支 timer。200 則的目標是 FPS >= 30（B1-1）。
 *
 * 無障礙：每則留言 tabindex=0，focus 等同 hover（停住並展開回應）；
 * prefers-reduced-motion: reduce 時完全不啟動漂浮，改靜態網格（B1-6）。
 *
 * ⛔ 本檔不得直接碰 localStorage / fetch，一律走 ABW.provider。
 */
(function (global) {
  'use strict';

  var ABW = global.ABW;
  var S = ABW.schema;

  var CARD_W = 460;   /* 要讓五顆帶字的鼓勵鈕排成「一行」；300px 會折三排、卡片高度翻倍 */
  var CARD_MIN_H = 100;
  /* 速度對齊 B 站彈幕：B 站預設一則約 8-12 秒橫越畫面。
   * 我們的留言比彈幕長（14-33 字），取偏慢端 ~12 秒，換算約 130-165 px/秒。
   * 原本的 26-48 px/秒要花一分鐘才走完，慢到像靜止。 */
  var DAN_SPEED_MIN = 130;
  var DAN_SPEED_MAX = 165;
  var DAN_GAP = 56;
  /* 每則留言在自己的軌道上輕微上下飄，不要像印表機一樣走在完美直線上。
   * 幅度刻意小：這是「紙在風裡」的感覺，不是彈跳。 */
  var DRIFT_AMP = 7;
  /* ⛔ 軌道高度不寫死。寫死的 168 與卡片實際高度（曾經是 275）對不上，
   * 結果是軌道彼此重疊、而且軌道數算錯。改成建卡後實測一次。 */
  var LANE_H = 120;
  var BOARD_GAP = 24;

  var state = {
    mode: 'danmaku',
    items: [],            /* { msg, el, x, y, vx, lane, paused, countEls } */
    lanes: 1,
    myAlias: null,
    /* 這台裝置送出過的留言 id（物件當 set 用）。⛔ 只用來標「你說的」，
     * 永不上傳——見 data-provider 的 listMineIds 註解。 */
    mineIds: null,
    savedMode: null,       /* 使用者上次明確選過的檢視模式 */          /* 本機代號，用來標出「這是你說的」 */
    stage: null,
    plane: null,
    raf: null,
    lastTs: 0,
    reduced: false,
    board: { scale: 1, tx: 0, ty: 0, dragging: false, lastX: 0, lastY: 0 },
    fps: { frames: 0, since: 0, value: 0 }
  };

  /* ------------------------------------------------------------------ *
   * 建立節點
   * ------------------------------------------------------------------ */
  function buildCard(msg) {
    var card = document.createElement('article');
    card.className = 'msg-card';
    card.tabIndex = 0;
    card.setAttribute('data-msg-id', msg.id);

    var body = document.createElement('p');
    body.className = 'msg-body';
    body.textContent = msg.body;
    card.appendChild(body);

    if (msg.source !== S.SOURCE.VISITOR) {
      var attr = document.createElement('p');
      attr.className = 'msg-attribution';
      attr.textContent = msg.source === S.SOURCE.SCRIPT
        ? '劇中台詞 · ' + msg.attribution
        : msg.attribution;
      card.appendChild(attr);
    }

    /* 署名。這是心理層面的東西不是裝飾：作者要能在牆上認出「那句是我說的」，
     * 否則說出來這件事在介面上沒有任何回音（Lee 2026-08-24）。
     * ⛔ 代號是本機生成、不可識別的（見 data-provider 的 getAlias），
     *    顯示它不會削弱匿名承諾。 */
    var who = document.createElement('p');
    who.className = 'msg-who';
    if (msg.alias && msg.alias.name) {
      var dot = document.createElement('span');
      dot.className = 'who-dot';
      if (typeof msg.alias.hue === 'number') dot.style.background = 'hsl(' + msg.alias.hue + ' 46% 42%)';
      who.appendChild(dot);
      var nm = document.createElement('span');
      nm.textContent = msg.alias.name;
      who.appendChild(nm);
      /* ⛔ 用 id 認不用代號認。代號 2026-08-31 起每次進站重擲，比對代號
       * 會誤標：這一次隨機到的名字剛好跟某一則種子或別人的留言同名時，
       * 那則就會被標成「你說的」——在一個匿名站裡把別人的話說成你的，
       * 比漏標嚴重得多。 */
      if (state.mineIds && state.mineIds[msg.id]) {
        card.classList.add('is-mine');
        var mine = document.createElement('span');
        mine.className = 'who-mine';
        mine.textContent = '你說的';
        who.appendChild(mine);
      }
    } else if (msg.attribution) {
      who.textContent = msg.attribution;
    }
    if (who.childNodes.length || who.textContent) card.appendChild(who);

    /* 收到多少溫暖，寫成一句話而不是一個數字。
     * 0 的時候不顯示「0」——那會讓沒被回應的留言變成計分板，
     * 改成對讀者說「你可以是第一個」，把空白變邀請。 */
    var warmth = document.createElement('p');
    warmth.className = 'msg-warmth';
    card.appendChild(warmth);

    var bar = document.createElement('div');
    bar.className = 'msg-reactions';
    var countEls = {};
    S.REACTIONS.forEach(function (r) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'msg-reaction';
      btn.setAttribute('data-reaction', r.id);
      btn.setAttribute('aria-label', '給這則留言一句「' + r.label + '」');

      var glyph = document.createElement('span');
      glyph.className = 'glyph';
      glyph.textContent = r.glyph;

      /* 鼓勵字樣要看得到——這是整個網站的主軸，不能只留一個符號 */
      var label = document.createElement('span');
      label.className = 'label';
      label.textContent = r.label;

      var count = document.createElement('span');
      count.className = 'count';
      count.textContent = String(msg.reactions[r.id] || 0);
      count.hidden = !(msg.reactions[r.id] > 0);

      btn.appendChild(glyph);
      btn.appendChild(label);
      btn.appendChild(count);
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        onReact(msg.id, r.id, btn);
      });
      bar.appendChild(btn);
      countEls[r.id] = count;
    });
    card.appendChild(bar);

    return { el: card, countEls: countEls, warmthEl: warmth };
  }

  function totalWarmth(msg) {
    var n = 0;
    S.REACTIONS.forEach(function (r) { n += (msg.reactions[r.id] || 0); });
    return n;
  }

  /* 出處（「示例」）併進這一行。原本它自己佔一整行，乘上軌道數是很可觀的高度；
   * ⛔ 但不能就這樣拿掉——那是誠信標記，牆上必須看得出這些不是真人投稿。 */
  function paintWarmth(item) {
    var w = ABW.content.wall;
    var n = totalWarmth(item.msg);
    var line = n === 0 ? w.warmthZero
      : n === 1 ? w.warmthOne
      : w.warmthMany.replace('{n}', String(n));
    item.warmthEl.textContent = line;
    item.warmthEl.className = 'msg-warmth' + (n > 0 ? ' has-warmth' : '');
  }

  /* 首屏的規模句：只放句數，不放溫暖次數。
   * 首屏放兩個數字會變成儀表板；這裡要的是「有多少人說了」的重量。 */
  function paintScale() {
    var el = document.querySelector('[data-wall-scale]');
    if (!el) return;
    var w = ABW.content.wall;
    var m = state.items.length;
    if (!m) { el.textContent = w.wallScaleEmpty; return; }
    var strong = document.createElement('strong');
    strong.textContent = m.toLocaleString('zh-Hant');
    el.textContent = '';
    var parts = (w.wallScale || '{m}').split('{m}');
    el.appendChild(document.createTextNode(parts[0].replace(/<\/?strong>/g, '')));
    el.appendChild(strong);
    el.appendChild(document.createTextNode((parts[1] || '').replace(/<\/?strong>/g, '')));
  }

  function paintTally() {
    paintScale();
    var el = document.querySelector('[data-wall-tally]');
    if (!el) return;
    var w = ABW.content.wall;
    var msgs = state.items.length;
    var warm = state.items.reduce(function (a, it) { return a + totalWarmth(it.msg); }, 0);
    el.textContent = msgs === 0 ? w.wallTallyEmpty
      : w.wallTally.replace('{m}', String(msgs)).replace('{n}', String(warm));
  }

  function onReact(msgId, reactionId, btn) {
    btn.disabled = true;
    return ABW.provider.react(msgId, reactionId)
      .then(function (updated) {
        var item = state.items.filter(function (it) { return it.msg.id === msgId; })[0];
        if (!item) throw new Error('[ABW] 回應後找不到對應留言 ' + msgId);
        item.msg = updated;
        Object.keys(item.countEls).forEach(function (id) {
          var el = item.countEls[id];
          el.textContent = String(updated.reactions[id] || 0);
          el.hidden = !(updated.reactions[id] > 0);
        });
        btn.classList.add('given');
        paintWarmth(item);
        paintTally();
      })
      .catch(function (err) {
        /* fail-loud：回應寫不進去要看得見，不要假裝點成功了 */
        console.error('[ABW] 送出回應失敗', err);
        throw err;
      })
      .then(function () { btn.disabled = false; }, function () { btn.disabled = false; });
  }

  /* ------------------------------------------------------------------ *
   * 版面
   * ------------------------------------------------------------------ */
  function stageSize() {
    var r = state.stage.getBoundingClientRect();
    return { w: Math.max(r.width, CARD_W + 40), h: Math.max(r.height, 320) };
  }

  /* 彈幕排版（P5 取代原本的 2D 漂浮）
   *
   * 軌道制：把舞台切成數條水平軌，每則留言配一軌，右→左等速通過。
   * 為什麼不沿用漂浮：漂浮的留言會互相疊、也會停在角落被永遠看不到；
   * 彈幕保證每一則都會通過視野正中央，這面牆的重點是「每個人都被看見」。
   */
  /* 用實際渲染出來的卡片高度當軌距，不用猜的。
   * 卡片高度會隨字級、換行、rwd 寬度變動，寫死必然對不上。 */
  function measureLaneHeight() {
    var tallest = 0;
    state.items.forEach(function (it) {
      var h = it.el.offsetHeight;
      if (h > tallest) tallest = h;
    });
    /* ⛔ 軌距必須含飄移的上下振幅，否則相鄰兩軌會撞在一起。
     * 軌道數是固定的、牆自己會捲，所以加大軌距不會少掉任何一軌，只是平面變高。 */
    if (tallest > 0) LANE_H = tallest + 6 + DRIFT_AMP * 2;
    return LANE_H;
  }

  /* 軌道數由「螢幕上真的剩多少空間」決定，不是寫死。
   *
   * 2026-08-21 第一版寫死 6 軌並讓舞台長到 1046px，結果一進站只看得到 2 軌
   * ——工具列底 335px、輸入列頂 633px，可視高度只有 298px。其餘四軌在摺線下，
   * 使用者看到的是一面被切一半的牆（Lee 回報「下半部分會看不到」）。
   *
   * ⛔ 牆要嘛完整放進一個畫面，要嘛就不要假裝自己放得進去。
   *    現在的規則：牆的高度＝扣掉吸頂工具列與吸底輸入列之後剩下的可視高度，
   *    軌道數＝那個高度塞得下幾軌。想要更多軌，只能讓卡片變矮（那是取捨，不是 bug）。
   */
  /* 看得到的那一帶有多高。
   * ⛔ 用舞台自己的 top 量，不要把「工具列＋輸入列」加一加就當成佔用高度——
   *    那樣算不到 hero（句數、分流三卡、代號行），實測差 290px：
   *    回傳 593 而舞台其實只有 300，軌道數因此照著一個不存在的高度算，
   *    平面比可視帶高一倍，60 則留言有一半在看不到的地方（2026-08-31）。 */
  function availableHeight() {
    var vh = global.innerHeight || 720;
    var top = state.stage ? state.stage.getBoundingClientRect().top : 180;
    var cb = document.querySelector('.composer-bar');
    var used = top + (cb ? cb.offsetHeight : 88) + 16;
    return Math.max(260, vh - used);
  }

  /* 軌道數不再受視窗高度限制——牆自己會上下捲（裁定 2026-08-24）。
   * 上限給 10 是效能與意義的取捨：60 則留言分到 10 軌，每軌 6 則，
   * 再多軌就會有整條軌長時間是空的。 */
  /* 軌道數＝**比可視帶多**，讓牆捲得動。
   *
   * 這個值改過兩次，兩次都改錯方向，記在這裡免得再來一次：
   *   ・原本寫死 10 軌 → 牆捲得動，但可視帶只有 2 軌有東西（那是水平間距
   *     的問題，不是軌道數的問題，我當時誤診了）。
   *   ・2026-08-31 改成「剛好塞滿可視帶」→ 平面 510 舞台 472，**等於沒得捲**，
   *     Lee 回報「彈幕不能往下滾動看起來很少」。
   * 正解是兩件事一起：軌道多過可視帶（捲得動＝看起來很多），
   * 而且同一軌的前後兩則要靠得近（見 spreadFactor）。
   *
   * ⛔ 下限取「塞滿可視帶所需的條數」：平面比舞台矮的話，底下會露出一整片
   *    空牆（2026-08-31 實測 146px）。 */
  var LANES_MAX = 12;

  function desiredLanes() {
    var w = global.innerWidth || 1280;
    /* ⛔ 量到的高度必須夾住。舞台是可捲的容器，某些時序下量到的是**內容高度**
     * 而不是可視高度，於是「高度→軌道數→平面更高→高度更大」形成回授，
     * 平面一路長到 10318px（2026-08-31 線上實測，應為 1350）。
     * ResizeObserver 的 24px 門檻擋不住它——每一輪的變化都遠大於 24px。 */
    var band = state.stage ? state.stage.getBoundingClientRect().height : 0;
    if (band < 120 || band > 2000) band = availableHeight();
    var fill = Math.ceil((band - 6) / LANE_H);      /* 不得少於這個，否則底部露空 */
    var want = w < 620 ? 5 : 8;                     /* 想要的條數：捲得動才像「很多人說過」 */
    return Math.min(LANES_MAX, Math.max(3, fill, want));
  }

  function laneCount(size) {
    return desiredLanes();
  }

  /* 舞台＝看得到的那一格（一個畫面高）；平面＝全部軌道的真實高度。
   * 兩者不同才捲得動：捲的是舞台裡的平面。 */
  function applyStageHeight(lanes) {
    if (!state.stage) return;
    if (state.mode === 'board' || state.reduced) {
      state.stage.style.height = '';
      if (state.plane) state.plane.style.removeProperty('--plane-h');
      return;
    }
    state.stage.style.height = availableHeight() + 'px';
    if (state.plane) state.plane.style.setProperty('--plane-h', (lanes * LANE_H + 6) + 'px');
  }

  function shuffledOrder(n) {
    var a = [];
    for (var i = 0; i < n; i++) a.push(i);
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = a[j]; a[j] = a[k]; a[k] = t;
    }
    return a;
  }

  function laneY(lane) { return lane * LANE_H + 6; }

  function randSpeed() {
    return -(DAN_SPEED_MIN + Math.random() * (DAN_SPEED_MAX - DAN_SPEED_MIN));
  }

  /* 留言少的時候拉開間距，而不是重複刷同幾則。
   * 重播同一句會讓這面牆看起來像在灌水；拉開間距至少是誠實的「現在就這麼多人說話」。 */
  /* 同一軌相鄰兩則的間距倍率。
   * 2026-08-31 Lee：一段時間被蓋掉也沒關係，滑鼠移上去會自動變成最上層就好。
   * 有了 hover 置頂這條保證，交疊就從缺點變成密度的手段——所以這裡壓得比
   * 原本更近（0.72 → 0.58）。
   * ⛔ 1.0 代表 (卡寬 580 + 間隙 56) = 636px，而舞台只有約 900px 寬——
   *    一條軌道上永遠只有一張多，這就是「彈幕看起來很少」的直接原因
   *    （2026-08-31 實測：每軌 20 張鋪在 9700px 上，畫面內只有 2 張）。
   * 0.72 讓相鄰兩則各露出大半、邊緣稍微交疊，畫面內每軌看得到 2-3 則。
   * ⛔ 不要壓到 0.5 以下：留言是要被讀的，疊到看不見字就本末倒置了——
   *    這一點跟影片彈幕不同，那裡的字疊掉了還有影片可以看。 */
  function spreadFactor(lanes) {
    var perLane = state.items.length / Math.max(1, lanes);
    if (perLane < 1.5) return 1.6;   /* 留言太少時反而要拉開，否則整團擠在左邊 */
    if (perLane < 3) return 0.9;
    return 0.58;
  }

  function seedPositions() {
    var size = stageSize();
    measureLaneHeight();
    var lanes = laneCount(size);
    state.lanes = lanes;
    applyStageHeight(lanes);
    size = stageSize();          /* 高度剛改過，重新量一次才是真的 */
    var spread = spreadFactor(lanes);
    var order = shuffledOrder(state.items.length);
    /* 每軌各自的排隊尾端。輪流填軌並記住尾巴，同一軌的兩則就不會疊在一起。 */
    /* ⛔ 起始位置不能全部排在畫面右邊等進場——那樣一開站是空的，
     * 使用者要等好幾秒才看到第一句話，而「這面牆有很多人說過話」是首屏的論述。
     * 讓每軌從左緣附近開始鋪，畫面立刻是滿的，其餘的排在右邊依序進場。 */
    var tail = [];
    for (var i = 0; i < lanes; i++) tail.push(-Math.random() * CARD_W * 0.6);

    order.forEach(function (idx, seat) {
      var it = state.items[idx];
      var lane = seat % lanes;
      it.lane = lane;
      it.y = laneY(lane);
      it.x = tail[lane];
      tail[lane] += (CARD_W + DAN_GAP) * spread;
      it.vx = randSpeed();
      it.vy = 0;
      it.ph = Math.random() * Math.PI * 2;              /* 相位錯開，避免整排同步起伏 */
      it.fq = 0.10 + Math.random() * 0.16;              /* 週期約 6–10 秒 */
    });
  }

  /* 出了左邊界就從右邊重新進場，並重抽軌道與速度＝跑完一輪自動隨機重排，
   * 不會出現「看過一輪就沒有新東西」的固定循環。 */
  /* 回收時挑「右邊最空的那一軌」——隨機挑會讓新進場的卡片直接壓在
   * 同軌前一張的屁股上。B 站的做法也是找不會撞的軌道，不是亂丟。 */
  function recycle(it, size) {
    var lanes = state.lanes || laneCount(size);
    var rightmost = [];
    for (var i = 0; i < lanes; i++) rightmost.push(-Infinity);
    state.items.forEach(function (o) {
      if (o === it || o.lane == null || o.lane >= lanes) return;
      if (o.x > rightmost[o.lane]) rightmost[o.lane] = o.x;
    });
    var best = 0;
    for (var j = 1; j < lanes; j++) if (rightmost[j] < rightmost[best]) best = j;
    it.lane = best;
    it.y = laneY(best);
    it.x = Math.max(size.w, rightmost[best] + CARD_W + DAN_GAP);
    it.vx = randSpeed();
    it.ph = Math.random() * Math.PI * 2;
    it.fq = 0.10 + Math.random() * 0.16;
  }

  function boardLayout() {
    var cols = Math.max(1, Math.round(Math.sqrt(state.items.length)));
    state.items.forEach(function (it, i) {
      it.bx = (i % cols) * (CARD_W + BOARD_GAP);
      it.by = ((i / cols) | 0) * (CARD_MIN_H + BOARD_GAP * 2);
    });
  }

  function paint() {
    var board = state.mode === 'board';
    state.items.forEach(function (it) {
      var x = board ? it.bx : it.x;
      var y = board ? it.by : it.y;
      it.el.style.transform = 'translate3d(' + Math.round(x) + 'px,' + Math.round(y) + 'px,0)';
    });
    if (board) {
      state.plane.style.transform = 'translate3d(' + state.board.tx + 'px,' + state.board.ty + 'px,0) scale(' + state.board.scale + ')';
    } else {
      state.plane.style.transform = 'none';
    }
  }

  /* ------------------------------------------------------------------ *
   * 彈幕迴圈（一支 rAF 統管全部，不是每則各開一支 timer）
   * ------------------------------------------------------------------ */
  function step(ts) {
    if (state.mode !== 'danmaku' || state.reduced) { state.raf = null; return; }
    var dt = state.lastTs ? Math.min((ts - state.lastTs) / 1000, 0.1) : 0;
    state.lastTs = ts;

    var size = stageSize();
    for (var i = 0; i < state.items.length; i++) {
      var it = state.items[i];
      if (it.paused) continue;
      it.x += it.vx * dt;
      if (it.x < -(CARD_W + 12)) recycle(it, size);
      /* 上下飄移只改繪製時的 y，不改 it.y（軌道基準）——
       * 否則誤差會累積，卡片會慢慢漂出自己的軌道。 */
      var dy = Math.sin(ts / 1000 * it.fq * Math.PI * 2 + it.ph) * DRIFT_AMP;
      it.el.style.transform = 'translate3d(' + Math.round(it.x) + 'px,' + Math.round(it.y + dy) + 'px,0)';
    }

    state.fps.frames++;
    if (!state.fps.since) state.fps.since = ts;
    if (ts - state.fps.since >= 1000) {
      state.fps.value = Math.round(state.fps.frames * 1000 / (ts - state.fps.since));
      state.fps.frames = 0;
      state.fps.since = ts;
    }

    state.raf = requestAnimationFrame(step);
  }

  function startFloat() {
    if (state.reduced || state.raf) return;
    state.lastTs = 0;
    state.raf = requestAnimationFrame(step);
  }

  function stopFloat() {
    if (state.raf) { cancelAnimationFrame(state.raf); state.raf = null; }
  }

  /* ------------------------------------------------------------------ *
   * 互動
   * ------------------------------------------------------------------ */
  function bindCardEvents(it) {
    function pause() { it.paused = true; it.el.classList.add('paused'); }
    function resume() { it.paused = false; it.el.classList.remove('paused'); }
    it.el.addEventListener('pointerenter', pause);
    it.el.addEventListener('pointerleave', resume);
    it.el.addEventListener('focusin', pause);
    it.el.addEventListener('focusout', function (ev) {
      if (!it.el.contains(ev.relatedTarget)) resume();
    });
    /* 觸控裝置沒有 hover，「移上去停住」在手機上不存在。
     * 點一下卡片＝停住／再點一下＝放行；點鼓勵鈕不受影響（裁定 2026-08-19 Q10）。 */
    it.el.addEventListener('click', function (ev) {
      if (ev.target.closest('.msg-reaction')) return;
      if (it.paused) resume(); else pause();
    });
  }

  function bindBoardEvents() {
    var stage = state.stage;

    stage.addEventListener('pointerdown', function (ev) {
      if (state.mode !== 'board') return;
      if (ev.target.closest('.msg-reaction')) return;
      state.board.dragging = true;
      state.board.lastX = ev.clientX;
      state.board.lastY = ev.clientY;
      stage.setPointerCapture(ev.pointerId);
      stage.classList.add('grabbing');
    });

    stage.addEventListener('pointermove', function (ev) {
      if (!state.board.dragging) return;
      state.board.tx += ev.clientX - state.board.lastX;
      state.board.ty += ev.clientY - state.board.lastY;
      state.board.lastX = ev.clientX;
      state.board.lastY = ev.clientY;
      paint();
    });

    ['pointerup', 'pointercancel'].forEach(function (name) {
      stage.addEventListener(name, function () {
        state.board.dragging = false;
        stage.classList.remove('grabbing');
      });
    });

    stage.addEventListener('wheel', function (ev) {
      if (state.mode !== 'board') return;
      ev.preventDefault();
      var next = state.board.scale * (ev.deltaY < 0 ? 1.1 : 0.9);
      state.board.scale = Math.min(2.5, Math.max(0.3, next));
      paint();
    }, { passive: false });
  }

  function setMode(mode) {
    state.mode = mode;
    state.stage.setAttribute('data-mode', mode);
    /* 「回到原點」只在畫布模式有存在意義——那裡拖曳縮放過就回不去了。
     * 流動模式它頂多是重新洗牌，不值得一直佔著工具列一個位子
     * （Lee 2026-08-24：沒用就不用放上去吧）。 */
    var reset = document.querySelector('[data-wall-reset]');
    if (reset) reset.hidden = mode !== 'board';
    document.querySelectorAll('[data-wall-mode]').forEach(function (btn) {
      var on = btn.getAttribute('data-wall-mode') === mode;
      btn.setAttribute('aria-pressed', String(on));
    });
    if (mode === 'board') {
      stopFloat();
      boardLayout();
      paint();
    } else {
      state.board.tx = 0; state.board.ty = 0; state.board.scale = 1;
      paint();
      startFloat();
    }
  }

  /* 「回到原點」在兩個模式做兩件不同但同名的事。
   * ⛔ 原本它只重設畫布的平移縮放，在流動模式按下去完全沒有反應——
   *    按鈕在說謊（Lee 2026-08-24：這顆好像沒什麼用）。
   *    流動模式的「原點」＝牆捲回最上面，並重新洗牌讓留言重新進場。 */
  function resetBoardView() {
    if (state.mode === 'board') {
      state.board.tx = 0; state.board.ty = 0; state.board.scale = 1;
      paint();
      return;
    }
    if (state.stage) state.stage.scrollTop = 0;
    seedPositions();
    paint();
  }

  /* ------------------------------------------------------------------ *
   * 求助資源卡（自傷關鍵字命中時彈出）
   *
   * ⛔ 這張卡不擋送出、不擋關閉、不要求任何輸入。它只是把電話遞過去。
   * ------------------------------------------------------------------ */
  function openHelpDialog(hits) {
    var dlg = document.querySelector('[data-help-dialog]');
    if (!dlg) return;
    var why = dlg.querySelector('[data-help-why]');
    if (why) {
      why.textContent = hits && hits.length
        ? '你剛剛寫的內容裡有「' + hits[0] + '」這樣的字。留言已經送出了，這裡只是想把幾個號碼放在你手邊。'
        : '留言已經送出了。這裡只是想把幾個號碼放在你手邊。';
    }
    if (typeof dlg.showModal === 'function' && !dlg.open) dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  function bindHelpDialog() {
    var dlg = document.querySelector('[data-help-dialog]');
    if (!dlg) return;
    var close = dlg.querySelector('[data-help-close]');
    if (close) {
      close.addEventListener('click', function () {
        if (typeof dlg.close === 'function') dlg.close();
        else dlg.removeAttribute('open');
      });
    }
  }

  /* ------------------------------------------------------------------ *
   * 送出留言（P2 起：送出前守門）
   * ------------------------------------------------------------------ */
  function bindCompose() {
    var form = document.querySelector('[data-compose]');
    if (!form) return;
    var field = form.querySelector('[name="body"]');
    var notice = document.querySelector('[data-compose-notice]');
    var counter = document.querySelector('[data-compose-count]');
    var max = ABW.content.wall.maxLength;

    field.setAttribute('maxlength', String(max));
    field.addEventListener('input', function () {
      if (counter) counter.textContent = field.value.length + ' / ' + max;
    });

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var body = field.value.trim();
      if (!body) return;
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;

      var scan = null;
      var decision = null;
      var kw = null;
      ABW.provider.getKeywords()
        .then(function (k) {
          kw = k;
          scan = ABW.guard.scan(body, kw);
          if (scan.blocked) {
            /* 守門不得阻擋送出。真的走到這裡代表 guard 被改壞了。 */
            throw new Error('[ABW] guard 回傳 blocked=true，違反產品裁定');
          }
          /* 自動審核：判得準的直接上牆，判不準的留給人看（裁定 2026-08-31）。 */
          decision = ABW.triage.decide(scan, kw);
          return ABW.provider.getAlias();
        })
        .then(function (alias) {
          /* 送出的是遮蔽後的內容；原文不儲存也不上傳 */
          return ABW.provider.createMessage({
            body: scan.body,
            alias: alias,
            flags: scan.flags,
            status: decision.status,
            hold: decision.reasons.map(function (r) { return r.code; })
          });
        })
        .then(function (msg) {
          if (msg.status !== decision.status) {
            throw new Error('[ABW] 資料層沒有採用自動審核的判定，實際狀態：' + msg.status);
          }
          field.value = '';
          if (counter) counter.textContent = '0 / ' + max;
          var approved = msg.status === S.STATUS.APPROVED;
          /* ⛔ 開機時載入過一次就不會再更新——不補這一行的話，剛送出的
           * 留言上牆之後不會被標「你說的」，他會在牆上看到自己的話卻
           * 認不出那是自己的（2026-08-31 實測）。 */
          if (!state.mineIds) state.mineIds = {};
          state.mineIds[msg.id] = true;
          if (notice) {
            /* 本機資料層＝沒有人收得到。這時候不能沿用「會出現在牆上」那句。 */
            var w = ABW.content.wall;
            var localOnly = ABW.provider === ABW.LocalProvider;
            var lines = [];
            if (approved) {
              lines.push(localOnly && w.approvedNoticeLocal ? w.approvedNoticeLocal : w.approvedNotice);
            } else {
              lines.push(localOnly && w.pendingNoticeLocal ? w.pendingNoticeLocal : w.pendingNotice);
              /* ⛔ 攔下來一定要說為什麼。不說的話，投稿者只知道「別人的話上去了，
               * 我的沒有」——那對一個剛說完傷口的人是二次拒絕。 */
              var why = decision.reasons[0];
              if (why) lines.push(why.why + '。');
            }
            /* ⛔ 遮掉了就一定要說。不說的話我們就是偷偷改了他的話——
             * 而且他會以為自己的帳號還在上面，等著別人來找他。 */
            if (scan.flags.indexOf('contact') !== -1) {
              lines.push('另外，內容裡的帳號或聯絡方式已經拿掉了：留下帳號等於'
                + '把真實身分綁回這則匿名留言，那是這個站最快失效的方式。');
            }
            if (scan.flags.indexOf('masked') !== -1) {
              lines.push('為了保護被提到的人，內容裡的姓名與校名已經自動遮成 ' + ABW.guard.MASK_CHAR + '。');
            }
            notice.textContent = lines.join(' ');
            /* 「我說過的話」不在面板裡——只有剛送出的人需要它，這裡給入口。 */
            if (w.pendingLinkLabel) {
              var a = document.createElement('a');
              a.href = 'mine.html';
              a.className = 'notice-link';
              a.textContent = w.pendingLinkLabel;
              notice.appendChild(document.createTextNode(' '));
              notice.appendChild(a);
            }
            notice.hidden = false;
          }
          if (scan.flags.indexOf('self_harm') !== -1) {
            openHelpDialog(scan.hits.selfHarm);
          }
          /* 上牆了就要看得到。不重畫的話，通知說「已經在牆上」但牆上沒有他的話——
           * 那句通知就是在說謊，而且他要重新整理才會發現不是。 */
          if (approved) {
            return ABW.provider.listApproved().then(render);
          }
        })
        .catch(function (err) {
          console.error('[ABW] 送出留言失敗', err);
          if (notice) {
            notice.textContent = '送出失敗，請稍後再試。';
            notice.hidden = false;
          }
        })
        .then(function () { btn.disabled = false; });
    });
  }

  /* ------------------------------------------------------------------ *
   * 啟動
   * ------------------------------------------------------------------ */
  function render(messages) {
    state.plane.innerHTML = '';
    state.items = messages.map(function (msg) {
      var built = buildCard(msg);
      var it = { msg: msg, el: built.el, countEls: built.countEls, warmthEl: built.warmthEl,
                 x: 0, y: 0, vx: 0, vy: 0, paused: false, bx: 0, by: 0 };
      state.plane.appendChild(built.el);
      bindCardEvents(it);
      paintWarmth(it);
      return it;
    });
    paintTally();
    seedPositions();
    boardLayout();
    paint();
  }

  function boot() {
    state.stage = document.querySelector('[data-wall-stage]');
    if (!state.stage) return Promise.resolve();

    state.plane = document.createElement('div');
    state.plane.className = 'wall-plane';
    state.stage.appendChild(state.plane);

    /* 上下淡出：牆比可視帶高，要讓人看得出「還有更多、可以往下捲」。
     * ⛔ 掛在 .wall-frame 不是 .wall-stage——舞台是會捲的那一層，
     *    掛上去會跟著內容捲走，只在最上面看得到。 */
    var frame = state.stage.parentNode;
    if (frame && frame.classList && frame.classList.contains('wall-frame')) {
      ['t', 'b'].forEach(function (pos) {
        var el = document.createElement('div');
        el.className = 'wall-scroll-hint-' + pos;
        el.setAttribute('aria-hidden', 'true');
        frame.appendChild(el);
      });
    }

    var mq = global.matchMedia('(prefers-reduced-motion: reduce)');
    /* ?motion=force：驗收用的測試鉤子，強制走彈幕主路徑。
     * 存在的理由與 ?fps=1 相同——某些驗收環境回報 prefers-reduced-motion: reduce，
     * 主路徑就永遠驗不到，只能驗到退路。⛔ 這個參數不改變任何真實使用者的體驗，
     * 只有明確在網址加上它的人會走到。 */
    var forceMotion = /[?&]motion=force(&|$)/.test(global.location.search);
    /* 光翻 JS 旗標不夠：reduced-motion 的 CSS 區塊會用 transform:none !important
     * 把彈幕位移整個蓋掉，主路徑仍然驗不到。掛一個 class 讓 styles.css 用更高的
     * 選擇器權重把那幾條讓開（見 styles.css 的 .force-motion 區塊）。 */
    if (forceMotion) document.documentElement.classList.add('force-motion');
    state.reduced = mq.matches && !forceMotion;
    if (mq.addEventListener) {
      mq.addEventListener('change', function (e) {
        state.reduced = e.matches;
        if (state.reduced) { stopFloat(); setMode('board'); }
      });
    }

    /* 視窗尺寸一變，軌道數與軌距就過期了——舞台高度變了、卡片高度也可能因換行變了。
     * 不重算的話牆會維持載入當下的樣子：把視窗拉高不會多出軌道，拉窄則會讓卡片
     * 疊在一起。debounce 是因為拖曳視窗會連續觸發，每次都重排會卡。 */
    /* ⛔ 軌道數是「舞台量到多高」算出來的，而 boot() 跑的時候版面還沒穩：
     * 字體還在載、面板還在注入、hero 高度還會變。量到偏小就只排 1-2 軌，
     * 60 則留言於是擠在最上面一條，牆看起來是空的——而且時好時壞，
     * 取決於那一次載入的時序（2026-08-31 線上實測：同一頁一次 3 軌一次 1 軌）。
     *
     * ResizeObserver 把這一類全部收掉：舞台高度只要真的變了就重排，
     * 不必猜要等幾個 frame，也一併涵蓋字級切換與視窗縮放。
     * ⛔ 要擋住「重排本身造成高度微調」的回授迴圈，所以設 24px 的門檻。 */
    if (global.ResizeObserver && state.stage) {
      var lastH = 0;
      var ro = new global.ResizeObserver(function () {
        var h = state.stage.getBoundingClientRect().height;
        if (Math.abs(h - lastH) < 24) return;
        lastH = h;
        if (state.mode === 'board') { boardLayout(); paint(); return; }
        seedPositions();
        paint();
      });
      ro.observe(state.stage);
    }

    var resizeTimer = null;
    var lastResize = 0;

    function relayout() {
      lastResize = Date.now();
      if (state.mode === 'board') { boardLayout(); paint(); return; }
      seedPositions();
      paint();
    }

    /* leading edge 先跑一次，再用 timer 收尾。
     * ⛔ 不要只留 setTimeout 版本——背景分頁的 timer 會被瀏覽器重度節流
     *    （實測隱藏分頁下 3 秒都不一定跑到），純 debounce 等於整個功能失效。
     *    先跑一次保證至少排版正確一次，收尾那次負責處理拖曳過程的中間狀態。 */
    global.addEventListener('resize', function () {
      if (Date.now() - lastResize > 200) relayout();
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { resizeTimer = null; relayout(); }, 180);
    });

    /* 使用者按下「流動」＝明示意圖，蓋過作業系統的 reduced-motion 預設值。
     *
     * 為什麼要這樣：reduce 開著的人（很多）預設看到靜態牆，這是對的；但工具列
     * 那顆「流動」按鈕原本按了也不會動（startFloat 開頭就被 state.reduced 擋掉），
     * 按鈕在說謊——使用者只會覺得壞了。
     * ⛔ 這不是繞過無障礙設定：預設仍然尊重系統設定，只有本人親手按下去才開始動，
     *    而且再按「全部攤開」就停。自動播放與手動播放是兩件事。 */
    document.querySelectorAll('[data-wall-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mode = btn.getAttribute('data-wall-mode');
        /* 記住使用者明確按過的選擇。下次進站直接照這個走，
         * 不必每次重按——尤其是系統開了「減少動態」的人。 */
        if (ABW.provider.setViewMode) ABW.provider.setViewMode(mode);
        if (mode === 'danmaku' && state.reduced) {
          state.reduced = false;
          document.documentElement.classList.add('force-motion');
          /* ⛔ 先把 state.mode 設好再排版。applyStageHeight() 會依 state.mode
           * 分支——mode 還停在 'board' 時它會「清掉」舞台高度而不是設定，
           * 結果外框塌成 0px、整面牆消失（2026-08-24 實測）。 */
          state.mode = mode;
          seedPositions();
        }
        setMode(mode);
      });
    });
    var reset = document.querySelector('[data-wall-reset]');
    if (reset) reset.addEventListener('click', resetBoardView);

    bindBoardEvents();
    bindHelpDialog();
    bindCompose();

    return ABW.provider.getAlias()
      .then(function (alias) { state.myAlias = alias && alias.name; })
      .then(function () { return ABW.provider.listMineIds(); })
      .then(function (ids) {
        state.mineIds = {};
        ids.forEach(function (id) { state.mineIds[id] = true; });
      })
      .then(function () {
        return ABW.provider.getViewMode ? ABW.provider.getViewMode() : null;
      })
      .then(function (mode) { state.savedMode = mode; })
      .then(function () { return ABW.provider.ensureSeeds(ABW.content.seeds); })
      .then(function () { return ABW.provider.listApproved(); })
      .then(function (list) {
        render(list);
        var status = document.querySelector('[data-c="wall.status"]');
        if (status) {
          /* ⛔ 這一行是鼓勵不是系統狀態（裁定 2026-08-31）。句數已經在首屏
           * 的大標裡說過一次，這裡不必再報一次數字。 */
          var lines = ABW.content.wall.statusLines || [];
          var base = list.length
            ? (lines.length ? lines[Math.floor(Math.random() * lines.length)] : '')
            : ABW.content.wall.emptyNotice;
          /* reduce 開著的人預設看到靜態牆——要告訴他可以自己打開，否則
           * 他只會以為牆壞了（Lee 2026-08-20 就是這樣回報的）。附註，不是主詞。 */
          status.textContent = state.reduced && ABW.content.wall.statusMotionHint
            ? base + '　' + ABW.content.wall.statusMotionHint
            : base;
        }
        /* reduced-motion 使用者直接進靜態的畫布模式，不做漂浮 */
        /* 預設值的順位：
         *   1. 使用者上次明確按過的模式（他自己的意思最大）
         *   2. 系統的 reduced-motion 設定（沒表達過意見時尊重它）
         * ⛔ 不要拿掉第 2 條——對開了減少動態的人自動播放動畫，
         *    對前庭系統敏感的使用者是實際傷害，不是偏好問題。 */
        var pref = state.savedMode;
        if (pref === 'danmaku' && state.reduced) {
          state.reduced = false;
          document.documentElement.classList.add('force-motion');
          state.mode = 'danmaku';
          seedPositions();
        }
        setMode(pref || (state.reduced ? 'board' : 'danmaku'));
        return maybeMountFpsBadge().then(function () { return list.length; });
      })
      .catch(function (err) {
        console.error('[ABW] 牆啟動失敗', err);
        throw err;
      });
  }

  /* ------------------------------------------------------------------ *
   * FPS 讀數（驗收用，docs/verify-browser.md B1-1）
   *
   * 只在網址帶 ?fps=1 時出現，正式站台不會看到。
   * 存在的理由：無頭／隱藏分頁的瀏覽器會暫停 requestAnimationFrame，
   * 導致自動化量不到真實幀率。這個讀數讓任何人在一般瀏覽器開一次就有數字。
   *
   *   ?fps=1            注入 200 則測試留言並顯示即時幀率
   *   ?fps=1&force=1    連 prefers-reduced-motion: reduce 也強制跑漂浮（僅供量測）
   * ------------------------------------------------------------------ */
  function maybeMountFpsBadge() {
    var params = new URLSearchParams(global.location.search);
    if (params.get('fps') !== '1') return Promise.resolve(false);

    var forced = params.get('force') === '1';
    var badge = document.createElement('div');
    badge.className = 'fps-badge';
    badge.setAttribute('role', 'status');
    document.body.appendChild(badge);

    var samples = [];
    var msgs = [];
    for (var i = 0; i < 200; i++) {
      msgs.push(S.makeMessage({
        id: 'fps-' + i,
        body: '幀率量測用的假留言 ' + i + '，長度大約二十個字左右。',
        alias: { name: '量測', hue: i },
        status: S.STATUS.APPROVED,
        source: S.SOURCE.SAMPLE,
        attribution: '量測',
        createdAt: new Date().toISOString()
      }));
    }
    render(msgs);

    if (state.reduced && !forced) {
      badge.textContent = '你的系統開了「減少動態效果」，漂浮已停用。'
        + '要量幀率請改開 ?fps=1&force=1';
      return Promise.resolve(false);
    }
    if (forced) state.reduced = false;
    setMode('danmaku');

    var last = 0, frames = 0;
    function tick(ts) {
      frames++;
      if (!last) last = ts;
      if (ts - last >= 1000) {
        var fps = Math.round(frames * 1000 / (ts - last));
        samples.push(fps);
        frames = 0;
        last = ts;
        var min = Math.min.apply(null, samples);
        badge.textContent = '200 則漂浮中｜目前 ' + fps + ' FPS'
          + '｜' + samples.length + ' 秒最低 ' + min
          + '｜' + (min >= 30 ? 'B1-1 通過（門檻 30）' : 'B1-1 未達 30');
        badge.setAttribute('data-min-fps', String(min));
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    return Promise.resolve(true);
  }

  /* 給驗收探針用的觀測點（docs/verify-browser.md B1） */
  ABW.wall = {
    boot: boot,
    render: render,
    setMode: setMode,
    /* ⛔ 這一項不可拿掉：面板上那顆常駐求助鈕就是呼叫它。
     * 沒有匯出的話 shell.js 的 `if (ABW.wall.openHelp)` 會靜默跳過，
     * 按鈕變成裝飾品——2026-08-24 之前它一直是壞的，而「求助資源常駐
     * 每一頁」是安全裁定，等於那條裁定一直是空的。G22 在守這件事。 */
    openHelp: openHelpDialog,
    state: state,
    fps: function () { return state.fps.value; },
    positionOf: function (id) {
      var it = state.items.filter(function (x) { return x.msg.id === id; })[0];
      return it ? { x: it.x, y: it.y, paused: it.paused } : null;
    }
  };
})(window);
