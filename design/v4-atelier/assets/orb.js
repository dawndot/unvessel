/* ═══════════════════════════════════════════════════════════════════
   UNVESSEL v4 · orb.js —— 线框球体（复古未来正统 3D 元素）
   对应海报左上的线框地球仪：不用 Three.js，纯 canvas 2D 手写
   3D 旋转投影 —— 零依赖、零加载，印刷品上的"机械仪表"质感。

   组成：
   - 经纬线球体（5 条纬环 × 10 条经线）：前半亮米黄、后半淡 —— 线框景深
   - 赤道环 + 一条倾斜轨道环用锈红：双色套印
   - 一枚像素小方块沿轨道运行：卫星 = 博客里滚动更新的文章
   交互：拖拽旋转（带惯性），松手回到自转。
   ═══════════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const cv = document.getElementById('orb');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ───────────── 状态 ───────────── */
  let W = 300, H = 220;          // CSS 像素尺寸（resize 时随容器）
  let yaw = 0.6, pitch = -0.22;  // 当前姿态（弧度）
  let vy = 0.0032, vx = 0;       // 角速度：自转 + 拖拽惯性
  let dragging = false, lx = 0, ly = 0;
  let orbit = 0;                 // 卫星沿轨道的相位
  let raf = null, last = 0;

  /* ───────────── 尺寸：跟随容器宽 × 固定宽高比，含 DPR ───────────── */
  function resize() {
    const cssW = cv.clientWidth || 300;
    const cssH = Math.round(cssW * 220 / 300);
    const dpr = Math.min(devicePixelRatio || 1, 2);   // DPR 钳 2
    W = cssW; H = cssH;
    cv.width = cssW * dpr;
    cv.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  addEventListener('resize', () => { resize(); if (reduced) render(performance.now()); });

  /* ───────────── 3D 投影：旋转(yaw→pitch) + 透视 ─────────────
     输入单位球面点 (x,y,z)∈[-1,1]，输出画布坐标与朝向深度 */
  const PERSP = 3.2;             // 透视距离（球半径倍数），越大越平
  function project(x, y, z) {
    // 绕 Y 轴（自转）
    const x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
    const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
    // 绕 X 轴（俯仰）
    const y2 = y * Math.cos(pitch) - z1 * Math.sin(pitch);
    const z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch);
    // 透视：z2 越大（朝向屏幕外）越放大
    const s = PERSP / (PERSP - z2);
    return {
      x: W / 2 + x1 * R() * s,
      y: H / 2 - y2 * R() * s,
      z: z2,                     // 保留深度用于前后分色
    };
  }
  const R = () => Math.min(W, H) * 0.34;   // 球半径（随容器）

  /* ───────────── 绘制一帧 ───────────── */
  const CREAM = '232, 220, 192';
  const RUST = '210, 74, 50';
  const SEG = 48;                // 每条环线的段数
  const LATS = [-60, -30, 0, 30, 60].map((d) => (d * Math.PI) / 180);
  const LONS = 10;

  function render(now) {
    ctx.clearRect(0, 0, W, H);
    const rr = R();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    /* 轨道环（半径 1.35 球）：斜置平面，先画后半再画前半，
       保证卫星和环能正确地"穿过"球体前后 */
    const orbitR = 1.38;
    const drawOrbit = (front) => {
      ctx.beginPath();
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * Math.PI * 2;
        // 轨道平面：先绕 Z 倾斜 0.42，再绕 X 倾斜 0.5 → 斜十字环
        let x = Math.cos(a) * orbitR, y = Math.sin(a) * orbitR, z = 0;
        let y1 = y * Math.cos(0.42) - z * Math.sin(0.42);
        let z1 = y * Math.sin(0.42) + z * Math.cos(0.42);
        let y2 = y1 * Math.cos(0.5) - z1 * Math.sin(0.5);
        let z2 = y1 * Math.sin(0.5) + z1 * Math.cos(0.5);
        // 与球体共用姿态（yaw/pitch）→ 拖拽时整体联动
        const p = project(x, y2, z2);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = `rgba(${RUST},${front ? 0.85 : 0.25})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    /* 经纬线球体：每段独立 stroke，按深度 z 分前（亮）后（淡） */
    const strokeLine = (pts, color, front) => {
      ctx.beginPath();
      let started = false;
      for (const p of pts) {
        const isFront = p.z >= 0;
        if (isFront !== front) { started = false; continue; }
        if (!started) { ctx.moveTo(p.x, p.y); started = true; }
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    // 纬环：固定 lat，lon 扫 2π
    for (const lat of LATS) {
      const cy = Math.sin(lat), cr = Math.cos(lat);
      const pts = [];
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * Math.PI * 2;
        pts.push(project(cr * Math.cos(a), cy, cr * Math.sin(a)));
      }
      // 赤道用锈红（套印），其余纬线用米黄
      const c = Math.abs(lat) < 0.01 ? `rgba(${RUST},` : `rgba(${CREAM},`;
      strokeLine(pts, `${c}${0.28})`, false);   // 后半：淡
      strokeLine(pts, `${c}${Math.abs(lat) < 0.01 ? 0.9 : 0.62})`, true); // 前半：亮
    }

    // 经线：过两极的大圆
    for (let j = 0; j < LONS; j++) {
      const lon = (j / LONS) * Math.PI * 2;
      const pts = [];
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * Math.PI - Math.PI / 2;   // -π/2 → π/2
        pts.push(project(Math.cos(a) * Math.cos(lon), Math.sin(a), Math.cos(a) * Math.sin(lon)));
      }
      strokeLine(pts, `rgba(${CREAM},0.26)`, false);
      strokeLine(pts, `rgba(${CREAM},0.55)`, true);
    }

    drawOrbit(false);   // 轨道后半
    drawOrbit(true);    // 轨道前半

    /* 卫星：轨道上的一枚锈红像素方块（4px），相位随时间推进 */
    orbit += dt * 0.9;
    {
      const a = orbit;
      let x = Math.cos(a) * orbitR, y = Math.sin(a) * orbitR, z = 0;
      const y1 = y * Math.cos(0.42) - z * Math.sin(0.42);
      const z1 = y * Math.sin(0.42) + z * Math.cos(0.42);
      const y2 = y1 * Math.cos(0.5) - z1 * Math.sin(0.5);
      const z2 = y1 * Math.sin(0.5) + z1 * Math.cos(0.5);
      const p = project(x, y2, z2);
      ctx.fillStyle = p.z >= 0 ? `rgba(${RUST},0.95)` : `rgba(${RUST},0.4)`;
      const s = 5;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }

    /* 两极小十字标记：仪表盘上的"校准点"仪式感 */
    for (const [x, y, z] of [[0, 1, 0], [0, -1, 0]]) {
      const p = project(x, y, z);
      ctx.strokeStyle = `rgba(${CREAM},${p.z >= 0 ? 0.8 : 0.3})`;
      ctx.beginPath();
      ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x + 4, p.y);
      ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x, p.y + 4);
      ctx.stroke();
    }
  }

  /* ───────────── 主循环：惯性衰减 + 回归自转 ───────────── */
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!dragging) {
      yaw += vy;
      pitch += vx;
      vx *= 0.94;                          // 俯仰惯性快速衰减
      vy += (0.0032 - vy) * 0.02;          // 缓慢回归基础自转速率
      pitch += (-0.22 - pitch) * 0.015;    // 姿态缓慢回正
    }
    render(now);
  }

  /* ───────────── 拖拽：pointer 事件 + 速度采样 ───────────── */
  cv.addEventListener('pointerdown', (e) => {
    dragging = true; lx = e.clientX; ly = e.clientY;
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    yaw += dx * 0.008;
    pitch += dy * 0.006;
    vy = dx * 0.008;                       // 松手速度 = 最后一次拖速
    vx = dy * 0.006;
  });
  const drop = () => { dragging = false; };
  cv.addEventListener('pointerup', drop);
  cv.addEventListener('pointercancel', drop);

  /* ───────────── 启停：reduced-motion 静帧一版 / 标签页隐藏停帧 ───────────── */
  if (reduced) {
    render(performance.now());             // 只画一帧：印刷品完全静止
  } else {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = null; }
      else if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
    });
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
})();
