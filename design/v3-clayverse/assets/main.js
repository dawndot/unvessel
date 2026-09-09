/* ============================================================
   不器 unvessel — v3「未器之城 CLAYVERSE」DOM 交互
   ------------------------------------------------------------
   职责：① 字体就绪后入场（避免字体闪烁）
         ② 滚动显现动画（IntersectionObserver 单次触发）
   3D 相机/鼠标交互全部在 scene.js，此文件不碰 canvas
   ============================================================ */

(function () {
  'use strict';

  /* ---------- ① 入场闸门：字体就绪 或 900ms 兜底，先到先开 ---------- */
  // 字体未加载就显示文字会出现"闪替"（FOUT），所以等 fonts.ready；
  // 但 CDN 偶发缓慢，900ms 定时器兜底保证页面永远会亮起来。
  let live = false;
  const goLive = () => {
    if (live) return;
    live = true;
    document.body.classList.add('is-live');
  };
  document.fonts.ready.then(goLive);
  setTimeout(goLive, 900);

  /* ---------- ② 滚动显现：元素进入视口 15% 后加 is-in（只触发一次） ---------- */
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) {
        en.target.classList.add('is-in');
        io.unobserve(en.target); // 单次触发，显现后不再观测
      }
    }
  }, {
    threshold: 0.15,
    rootMargin: '0px 0px -8% 0px', // 元素露出 8% 视口高才开始，避免"贴边就亮"
  });

  document.querySelectorAll('[data-rv]').forEach((el) => io.observe(el));
})();
