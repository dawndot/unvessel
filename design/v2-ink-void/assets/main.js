/* ============================================================
   main.js — v2 页面交互层
   ============================================================
   四件事，都不依赖任何库：
   1. 字体就绪后才触发 Hero 入场（避免字体交换时的跳动/FOUT）；
   2. IntersectionObserver 滚动显现（Hero 之外的 [data-rv]）；
   3. 自定义光标（仅精确指针设备：朱砂点 + 滞后圆环）；
   4. Hero 巨字鼠标视差（幅度克制在 14px 内，是「衬」不是「炫」）。
   ============================================================ */

(function () {
  'use strict';

  var docEl = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. 字体就绪 → Hero 入场 ----------
     CSS 里 Hero 的 [data-rv] 等待 body.is-live；
     document.fonts.ready 有极小概率挂着不来，用 900ms 兜底赛跑。 */
  var kicked = false;
  function kick() {
    if (kicked) return;
    kicked = true;
    document.body.classList.add('is-live');
  }
  if (reduced) {
    kick(); // 减少动效模式：CSS 已直接显示全部内容，这里只对齐状态
  } else {
    Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(),
      new Promise(function (r) { setTimeout(r, 900); })
    ]).then(kick);
  }

  /* ---------- 2. 滚动显现 ----------
     只观察 Hero 之外的 [data-rv]（Hero 的由 is-live 统一编排）。 */
  var toReveal = Array.prototype.filter.call(
    document.querySelectorAll('[data-rv]'),
    function (el) { return !el.closest('.hero'); }
  );
  if ('IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target); // 只播一次，滚回去不重播
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
    );
    toReveal.forEach(function (el) { io.observe(el); });
  } else {
    // 无 IO / 减少动效：直接全部可见
    toReveal.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---------- 3. 自定义光标 ----------
     仅 pointer:fine（鼠标/触控板）启用；触屏保持系统行为。
     结构：dot 贴手（插值 0.55）+ ring 滞后（插值 0.16）→ 有「拖拽感」。
     悬停可点元素：html.cursor-hover 让 ring 放大咬合（样式在 CSS）。 */
  var finePointer = window.matchMedia('(pointer: fine)').matches;
  if (finePointer && !reduced) {
    docEl.classList.add('has-cursor');
    var dot = document.querySelector('.cursor__dot');
    var ring = document.querySelector('.cursor__ring');
    var px = innerWidth / 2, py = innerHeight / 2; // ring 当前位置
    var tx = px, ty = py;                          // 指针目标
    var dx = px, dy = py;                          // dot 当前位置

    window.addEventListener('pointermove', function (e) {
      tx = e.clientX;
      ty = e.clientY;
    }, { passive: true });

    // pointerover 捕获阶段统一处理悬停态，不逐个绑事件
    window.addEventListener('pointerover', function (e) {
      var hit = e.target.closest && e.target.closest('a, button, .row');
      docEl.classList.toggle('cursor-hover', !!hit);
    }, { passive: true });

    (function loop() {
      dx += (tx - dx) * 0.55;
      dy += (ty - dy) * 0.55;
      px += (tx - px) * 0.16;
      py += (ty - py) * 0.16;
      dot.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0)';
      ring.style.transform = 'translate3d(' + px + 'px,' + py + 'px,0)';
      requestAnimationFrame(loop);
    })();
  }

  /* ---------- 4. Hero 巨字视差 ----------
     指针在视口内的归一化偏移 → 巨字平移 ±14px（slogan 不参与，
     避免与入场动画的 transform 打架）。 */
  if (finePointer && !reduced) {
    var hero = document.querySelector('.hero');
    var title = document.querySelector('.hero__title');
    if (hero && title) {
      var nx = 0, ny = 0, cx = 0, cy = 0;
      hero.addEventListener('pointermove', function (e) {
        // -1..1
        nx = (e.clientX / innerWidth) * 2 - 1;
        ny = (e.clientY / innerHeight) * 2 - 1;
      }, { passive: true });
      (function drift() {
        cx += (nx - cx) * 0.06; // 慢插值：巨字是「沉」在水里的
        cy += (ny - cy) * 0.06;
        title.style.transform =
          'translate3d(' + (cx * 14).toFixed(2) + 'px,' + (cy * 10).toFixed(2) + 'px,0)';
        requestAnimationFrame(drift);
      })();
    }
  }
})();
