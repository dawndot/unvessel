/* ═══════════════════════════════════════════════════════════════════
   UNVESSEL v4 · main.js —— 页面通电三件事：
   1. 字体就绪 → body.is-live（hero 首屏显现 + 仪表首次充能）
   2. IntersectionObserver 单次显现 → data-rv 元素逐块 CRT 刷新
   3. 像素「器」字：把衬线「器」栅格化为锈红像素块，
      随机残缺 + 微量闪烁 —— 器之未成、永不定型的标志瞬间
   ═══════════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ───────────── 1. 字体赛跑：ready 或 900ms 先到者赢 ─────────────
     像素字（Press Start 2P）必须在绘制前就绪，否则巨字会以
     fallback 等宽字闪一帧；is-live 同时触发首屏显现与充能 */
  const arm = () => document.body.classList.add('is-live');
  const timer = setTimeout(arm, 900);
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => { clearTimeout(timer); arm(); });
  } else {
    clearTimeout(timer); arm();
  }

  /* ───────────── 2. 显现系统：data-rv 进视口后加 .is-in ─────────────
     data-d="1|2" 是设计稿里的手工级联延迟（秒），写入 CSS 变量 --d；
     once:true 单次触发，滚上来不再反复播放（印刷品不跳针） */
  const rv = document.querySelectorAll('[data-rv]');
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    }
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

  rv.forEach((el) => {
    const d = el.dataset.d;
    if (d) el.style.setProperty('--d', `${d * 0.12}s`);
    io.observe(el);
  });

  /* ───────────── 3. 像素「器」字 ────────────────────────────────
     原理：离屏 canvas 以衬线 900 字重写下「器」→ 逐像素采样 alpha
     → 在主 canvas 上按 GAP 步长铺锈红方块；两种做旧手段：
       a) 固定种子伪随机 → 约 12% 方块缺失（残缺 = 未定型）
       b) 约 8% 方块印成米黄 → 双色套印的错版感
     底层再垫一遍偏移 2px 的黑影 → 硬像素投影，立体感来自错位 */
  const cv = document.getElementById('px-vessel');
  if (!cv) return;

  const GAP = 4;                 // 离屏采样步长（120px / 4 = 30×30 格）
  const CELL = 12;               // 主画布每格边长（360 / 30）
  const off = document.createElement('canvas');
  off.width = off.height = 120;
  const octx = off.getContext('2d', { willReadFrequently: true });

  /* mulberry32：固定种子伪随机，保证每次刷新"残缺图样"完全一致
     —— 像同一块印版的印刷品，而不是每帧乱闪的雪花屏 */
  const mulberry32 = (seed) => () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  let cells = [];                // { x, y, tone: 0 缺 | 1 锈红 | 2 米黄 }

  /** 把「器」栅格化为 tone 矩阵（字体就绪后调用） */
  function rasterize() {
    octx.clearRect(0, 0, 120, 120);
    octx.fillStyle = '#fff';
    octx.font = '900 96px "Noto Serif SC", serif';
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.fillText('器', 60, 64);

    const img = octx.getImageData(0, 0, 120, 120).data;
    const rand = mulberry32(20260909);   // 固定种子：残缺图样稳定
    cells = [];
    for (let y = 0; y < 120; y += GAP) {
      for (let x = 0; x < 120; x += GAP) {
        const alpha = img[(y * 120 + x) * 4 + 3];
        if (alpha < 100) continue;       // 字形之外不铺块
        const r = rand();
        // 12% 缺块 / 8% 米黄 / 其余锈红 —— 缺块在下缘概率略增（做旧剥落感）
        const edgeBias = y / 120 * 0.08;
        const tone = r < 0.12 + edgeBias ? 0 : (r > 0.92 ? 2 : 1);
        cells.push({ x, y, tone });
      }
    }
  }

  /** 按 cells 重绘整个像素器字（含黑影底层与少量随机闪块） */
  function draw() {
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);

    const flick = mulberry32((Math.random() * 1e9) | 0);  // 本次闪烁源
    // 每次重绘随机翻转 4 格的显示状态 → 印刷品上的信号噪声
    const flickSet = new Set(
      Array.from({ length: 4 }, () => (flick() * cells.length) | 0)
    );

    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      // flick 逻辑：被翻到的格"缺/不缺"状态取反，其余格维持原判
      const visible = flickSet.has(i) ? isMissing(c) : !isMissing(c);
      if (!visible) continue;

      const px = (c.x / GAP) * CELL;
      const py = (c.y / GAP) * CELL;
      const tone = flickSet.has(i) ? (c.tone === 2 ? 1 : 2) : c.tone;

      // 黑影底层：整体偏移 2px，模拟海报硬阴影
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ctx.fillRect(px + 2, py + 2, CELL - 1, CELL - 1);
      // 正色层：锈红 / 米黄，留 1px 缝隙保持颗粒
      ctx.fillStyle = tone === 2 ? '#e8dcc0' : '#d24a32';
      ctx.fillRect(px, py, CELL - 1, CELL - 1);
    }
  }

  /** 该格是否属于固定残缺（tone 0） */
  const isMissing = (c) => c.tone === 0;

  /** 布点后先画一版 fallback（serif 兜底），字体就绪再重画正稿 */
  function boot() {
    rasterize();
    draw();
  }
  boot();
  if (document.fonts?.ready) document.fonts.ready.then(boot);

  /* 微量闪烁：420ms 一帧，reduced-motion 用户不闪（静如印刷品） */
  if (!reduced) {
    setInterval(() => { if (!document.hidden && cells.length) draw(); }, 420);
  }
})();
