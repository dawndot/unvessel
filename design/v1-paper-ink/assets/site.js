/* ==========================================================================
   unvessel · 不器 —— 设计稿交互脚本（原生 JS，零依赖）
   --------------------------------------------------------------------------
   包含五件事：
     1. 主题切换（墨白 / 墨夜，localStorage 持久化，切换时画布换墨色）
     2. 墨迹画布（2D canvas 模拟「墨在纸上晕开」，指针划过会落墨点）
     3. 滚动显现（IntersectionObserver，进入视口才浮现）
     4. 自定义光标（小点即时跟随 + 圆环惯性跟随，仅精确指针设备）
     5. 阅读进度条（文章页顶部朱砂细线）

   无障碍约定：
     - prefers-reduced-motion: reduce 时，画布只画一张静帧、不注册指针落墨、
       不启用自定义光标；滚动显现与跑马灯的降级由 CSS 负责
     - JS 失效时页面仍完整可读（所有增强均为渐进式）
   ========================================================================== */

(function () {
  'use strict';

  var docEl = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ========================================================================
     2. 墨迹画布
     ------------------------------------------------------------------------
     原理：维护一组「墨滴」blob，每个墨滴由若干层不规则圆叠加而成——
       - 半径缓慢生长（指数趋近目标值），模拟渗透
       - 圆心随时间微微漂移，边缘半径用 sin 抖动，模拟洇开的不规则轮廓
       - 每层透明度极低（0.02~0.05），多层叠加出「晕染」的浓淡
     性能约定：blob 数量封顶、DPR 封顶 2、页面隐藏时暂停渲染。
     ======================================================================== */

  var canvas = document.getElementById('ink-canvas');
  var inkReset = null; // 暴露给主题切换用的「重新落墨」函数

  if (canvas && canvas.getContext) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var blobs = [];
    var frame = 0;          // 帧计数（充当时间轴）
    var running = true;     // 页面隐藏时置 false，暂停循环
    // 文章页画布带 data-quiet，墨滴更小更淡，避免干扰阅读
    var quiet = canvas.hasAttribute('data-quiet');
    var MAX_BLOBS = quiet ? 10 : 16;

    // 从 CSS 令牌读墨色（--canvas-ink 存的是裸 RGB 串，如 "33, 31, 26"）
    function inkRGB() {
      var v = getComputedStyle(docEl).getPropertyValue('--canvas-ink').trim();
      return v || '33, 31, 26';
    }

    // 造一滴墨：x/y 位置、生长目标半径、基础透明度、相位与漂速
    function makeBlob(x, y, maxR, alpha, temporary) {
      return {
        x: x,
        y: y,
        r: 6,                                    // 出生半径：小小一点
        max: maxR,                               // 生长目标：晕开的极限
        alpha: alpha,
        phase: Math.random() * Math.PI * 2,      // 边缘抖动的初相位
        speed: 0.4 + Math.random() * 0.6,        // 抖动速度
        life: temporary ? 420 : Infinity,        // 指针墨滴会枯竭，底墨不会
        age: 0
      };
    }

    // 初始「落墨」：在版面里随机放几滴底墨
    function seed() {
      var count = quiet ? 3 : 5;
      for (var i = 0; i < count; i++) {
        blobs.push(
          makeBlob(
            Math.random() * window.innerWidth,
            Math.random() * window.innerHeight,
            (quiet ? 40 : 70) + Math.random() * (quiet ? 50 : 90),
            (quiet ? 0.022 : 0.032) + Math.random() * 0.02,
            false
          )
        );
      }
    }

    // 画一滴墨：8 层圆叠加，半径与圆心都带 sin 抖动 → 不规则墨缘
    function drawBlob(b) {
      var rgb = b.rgb;
      // 指针墨滴按生命衰减透明度；底墨不衰减
      var fade = isFinite(b.life) ? Math.max(b.life / 420, 0) : 1;
      ctx.fillStyle = 'rgba(' + rgb + ',' + (b.alpha * fade).toFixed(4) + ')';
      for (var i = 0; i < 8; i++) {
        var ang = (i / 8) * Math.PI * 2;
        var wob = 1 + 0.24 * Math.sin(frame * 0.012 * b.speed + i * 1.7 + b.phase);
        ctx.beginPath();
        ctx.arc(
          b.x + Math.cos(ang) * b.r * 0.14,
          b.y + Math.sin(ang) * b.r * 0.14,
          b.r * wob,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }

    // 单帧：清屏 → 推进每滴墨的生长/漂移/生命周期 → 重绘
    function tick() {
      frame++;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      var rgb = inkRGB();
      for (var i = blobs.length - 1; i >= 0; i--) {
        var b = blobs[i];
        b.rgb = rgb; // 每帧取当前主题墨色，主题切换后旧墨自然「换色」
        b.r += (b.max - b.r) * 0.006;                        // 渗透：指数趋近
        b.x += Math.sin(frame * 0.001 + b.phase) * 0.08;     // 漂移：呼吸感
        b.y += Math.cos(frame * 0.0013 + b.phase) * 0.06;
        if (isFinite(b.life)) {
          b.life--;
          if (b.life <= 0) {                                 // 枯竭的墨滴移除
            blobs.splice(i, 1);
            continue;
          }
        }
        drawBlob(b);
      }
      if (running) requestAnimationFrame(tick);
    }

    // 尺寸变化：重设画布物理像素，缩放回到 CSS 像素坐标系
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();
    seed();
    if (reduceMotion) {
      tick();               // 降级：只画一帧静帧，不进入循环
      running = false;
    } else {
      requestAnimationFrame(tick);
    }

    window.addEventListener('resize', function () {
      resize();
      // 尺寸剧变后底墨可能跑出画面：静帧模式下补画一帧
      if (reduceMotion) tick();
    });

    // 页面切走时停渲染，回来继续（省电）
    document.addEventListener('visibilitychange', function () {
      var wasRunning = running;
      running = !document.hidden && !reduceMotion;
      if (running && !wasRunning) requestAnimationFrame(tick);
    });

    // 指针落墨：划过时在指尖滴一小滴（节流 280ms，避免刷屏）
    if (!reduceMotion) {
      var lastDrop = 0;
      window.addEventListener(
        'pointermove',
        function (e) {
          var now = performance.now();
          if (now - lastDrop < 280) return;
          lastDrop = now;
          if (blobs.length >= MAX_BLOBS) blobs.shift(); // 超上限则挤掉最老的
          blobs.push(makeBlob(e.clientX, e.clientY, 18 + Math.random() * 22, 0.05, true));
        },
        { passive: true }
      );
    }

    // 主题切换时调用：清空画布重新落墨（旧色底墨直接换新色重画）
    inkReset = function () {
      blobs = [];
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      seed();
      if (reduceMotion) tick();
    };
  }

  /* ========================================================================
     1. 主题切换（墨白 / 墨夜）
     ======================================================================== */

  var toggle = document.querySelector('.theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = docEl.dataset.theme === 'ink-dark' ? 'ink-light' : 'ink-dark';
      docEl.dataset.theme = next;
      try {
        localStorage.setItem('unvessel-theme', next);
      } catch (e) {
        /* 隐私模式下 localStorage 可能被禁，主题降级为会话内生效 */
      }
      if (inkReset) inkReset();
    });
  }

  /* ========================================================================
     3. 滚动显现：进入视口的 .reveal 元素加 .is-visible（CSS 管过渡动画）
     ======================================================================== */

  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target); // 只显现一次，回滚不重播
          }
        });
      },
      { threshold: 0.12 }
    );
    revealEls.forEach(function (el) {
      io.observe(el);
    });
  } else {
    // 老浏览器 / 减少动态偏好：直接全部可见
    revealEls.forEach(function (el) {
      el.classList.add('is-visible');
    });
  }

  /* ========================================================================
     4. 自定义光标：小点即时跟随 + 圆环惯性跟随（difference 混合，明暗皆可见）
        仅在「精确指针 + 允许动态」时启用；启用后隐藏系统光标
     ======================================================================== */

  var finePointer = window.matchMedia('(pointer: fine)').matches;
  if (finePointer && !reduceMotion) {
    var dot = document.createElement('div');
    var ring = document.createElement('div');
    dot.className = 'cursor-dot';
    ring.className = 'cursor-ring';
    document.body.append(dot, ring);
    document.body.classList.add('cursor-none');

    var mx = -100, my = -100;   // 目标（指针）位置
    var rx = -100, ry = -100;   // 圆环当前位置（每帧向目标插值）
    var seen = false;           // 指针首次入场前隐藏光标

    window.addEventListener(
      'pointermove',
      function (e) {
        mx = e.clientX;
        my = e.clientY;
        if (!seen) {
          seen = true;
          dot.style.opacity = '1';
          ring.style.opacity = '1';
        }
      },
      { passive: true }
    );

    // 指针离开窗口：淡出光标
    document.addEventListener('mouseleave', function () {
      dot.style.opacity = '0';
      ring.style.opacity = '0';
      seen = false;
    });

    (function follow() {
      rx += (mx - rx) * 0.16; // 惯性系数：越小越「拖沓」
      ry += (my - ry) * 0.16;
      dot.style.transform = 'translate(' + (mx - 3) + 'px,' + (my - 3) + 'px)';
      ring.style.transform =
        'translate(' + (rx - 17) + 'px,' + (ry - 17) + 'px)';
      requestAnimationFrame(follow);
    })();
  }

  /* ========================================================================
     5. 阅读进度条：存在 .progress 元素时启用（仅文章页有）
     ======================================================================== */

  var bar = document.querySelector('.progress');
  if (bar) {
    var update = function () {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var pct = max > 0 ? (window.scrollY / max) * 100 : 0;
      bar.style.width = pct.toFixed(2) + '%';
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }
})();
