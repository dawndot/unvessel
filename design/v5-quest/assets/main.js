/* ═══════════════════════════════════════════════════════════════════
   UNVESSEL v5「不器 QUEST」交互脚本
   炫彩像素 RPG —— 让游戏"开机"的全部生命迹象

   模块清单（自上而下）：
     0. 公共工具：像素画绘制器 paint()（字符矩阵 → canvas 色块）
     1. 彩色星空 #sky：低分辨率画布 + 三层视差星 + RGB 星云
     2. 果冻主角：#jelly（HUD 28px）与 #hero-jelly（标题 96px）
        同一 12×12 双帧矩阵 —— 2 帧呼吸，未定形本体的 Q 弹
     3. 关卡精灵：16×16 字符矩阵（火箭 / 星球 / 宝箱），
        主色取自关卡卡的 --clr，三卡三色
     4. NPC 头像：村口老者 12×12（草帽 / 白须 / 紫袍）
     5. 打字机：对话框逐字输出宣言，标点处停顿
     6. 显现系统：IO 观察	data-rv，进屏"刷"现（steps 跳帧）
     7. 开机序列：字体赛跑 → body.is-live → 血条充能 +
        金币计数 + 打字机启动
   缓动哲学：全站 steps() 跳帧 —— 像素世界没有丝滑，
   闪烁用离散相位（floor(t/周期)）而非连续 sin。
   ═══════════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  /* 低动效偏好：所有循环动画降级为静帧（星空画一帧、果冻不呼吸、
     打字机直接出全文、金币不滚动）—— 内容不受损，只是世界静止 */
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 彩虹六色 + 白 —— 星星与精灵共用的 16-bit 调色板 */
  const RAINBOW = ['#2ecbff', '#ff2e88', '#ffd23f', '#35ff8d', '#7b2ff7', '#ff7a2e'];

  /* ═══════════ 0. 公共工具：像素画绘制器 ═══════════
     把字符矩阵一笔一笔盖到 canvas 上：
       - '.' 与未映射字符 = 透明，跳过
       - canvas 后备分辨率被强制设为矩阵边长（正方形），
         由 CSS width/height + image-rendering:pixelated 放大 ——
         这样每个"像素"都是严格整数倍缩放，绝无抗锯齿糊边
     canvas：目标画布（会被重设后备尺寸）
     matrix：字符串数组，每字符串一行
     palette：{ 字符: 颜色 } 映射表 */
  function paint(canvas, matrix, palette) {
    const n = matrix.length;                 // 矩阵行数 = 逻辑边长
    canvas.width = n;                        // 重设后备分辨率（顺带清空画布）
    canvas.height = n;
    const ctx = canvas.getContext('2d');
    matrix.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const color = palette[row[x]];
        if (!color) continue;                // '.' 等透明字符
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);            // 1 逻辑格 = 1 后备像素
      }
    });
  }

  /* ═══════════ 1. 彩色星空 #sky ═══════════
     关键手法：后备分辨率只有屏幕的 1/3（如 1920→640），
     再被 CSS 拉伸到全屏 —— 每颗星自然是 3px 的"大像素"，
     16-bit 时代的颗粒感，同时把绘制成本压到 1/9。
     组成：3 团星云（径向渐变，紫/青/粉）+ 三层星（z 1~3）
     运动：星向右慢漂（z 越大越快）+ 滚动视差（z 越大越敏感）
     闪烁：离散三态（0.25 / 0.6 / 1.0 透明度）硬切，不用 sin 渐变 */
  const sky = document.getElementById('sky');
  const sctx = sky.getContext('2d');
  let SW = 0, SH = 0;                        // 后备画布尺寸（1/3 屏）
  let stars = [];                            // 星星对象池
  const NEBULAS = [                          // 星云：屏幕比例坐标 + rgb 串
    { x: .24, y: .32, r: .30, c: '123, 47, 247' },   // 紫
    { x: .76, y: .62, r: .26, c: '46, 203, 255' },   // 青
    { x: .55, y: .12, r: .20, c: '255, 46, 136' },   // 粉
  ];

  /* 按当前视口重建星空：1/3 分辨率 + 星星按面积密度随机播撒 */
  function buildSky() {
    SW = Math.ceil(innerWidth / 3);
    SH = Math.ceil(innerHeight / 3);
    sky.width = SW;
    sky.height = SH;
    const count = Math.round((SW * SH) / 85);          // 密度：约每 85px² 一颗
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * SW,                           // 初始位置
      y: Math.random() * SH,
      z: 1 + (Math.random() * 3 | 0),                  // 层 1~3：速度/视差系数
      // 55% 白星 + 45% 彩星（六色随机）—— 炫彩但不闹
      c: Math.random() < .55 ? '#eef2ff' : RAINBOW[Math.random() * 6 | 0],
      p: Math.random() * 3 | 0,                        // 闪烁相位 0~2（三态错开）
    }));
  }

  /* 画一帧星空：底色 → 星云 → 星。t 为 rAF 时间戳（ms） */
  function drawSky(t) {
    sctx.globalAlpha = 1;
    sctx.fillStyle = '#0b0b1a';                        // 深空底
    sctx.fillRect(0, 0, SW, SH);

    /* 星云：径向渐变，中心 16% 透明度向外归零（叠色自然） */
    for (const n of NEBULAS) {
      const cx = n.x * SW, cy = n.y * SH, r = n.r * SW;
      const g = sctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${n.c}, .16)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      sctx.fillStyle = g;
      sctx.fillRect(0, 0, SW, SH);
    }

    /* 星：漂移 + 视差 + 三态硬闪 */
    const scroll = scrollY;                            // 读一次，循环内复用
    for (const s of stars) {
      // 漂移：向右，速度随层 z 增大；模宽回绕
      let x = (s.x + t * 0.004 * s.z) % SW;
      // 视差：向上滚动时，近层（z 大）位移更大；模高回绕
      let y = (s.y - scroll * 0.12 * s.z) % SH;
      if (y < 0) y += SH;
      // 三态闪烁：400ms 一切，相位错开 —— steps 美学
      const tw = REDUCED ? 2 : (Math.floor(t / 400) + s.p) % 3;
      sctx.globalAlpha = [0.25, 0.6, 1][tw] * (s.z / 3); // 远层更暗
      sctx.fillStyle = s.c;
      sctx.fillRect(x | 0, y | 0, 1, 1);               // 位或取整，避免半像素
    }
    sctx.globalAlpha = 1;
  }

  /* 星空循环：rAF 常驻，页签隐藏即停帧省电 */
  let raf = 0;
  function skyLoop(t) {
    drawSky(t);
    raf = requestAnimationFrame(skyLoop);
  }
  buildSky();
  if (REDUCED) {
    drawSky(0);                                        // 静帧星空
  } else {
    raf = requestAnimationFrame(skyLoop);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancelAnimationFrame(raf);  // 离开页签：停
      else raf = requestAnimationFrame(skyLoop);       // 回来：续
    });
  }
  addEventListener('resize', () => {                   // 视口变化：重建再补帧
    buildSky();
    if (REDUCED) drawSky(0);
  });

  /* ═══════════ 2. 果冻主角（12×12 双帧） ═══════════
     「不器」本体：未定形的果冻方块。
     帧 A 常规站立，帧 B 横向压扁（Q 弹）——
     HUD 头像与标题主角共用同一组矩阵，只有 CSS 尺寸不同。
     色板：h 高光白 / b 主体青 / d 底部沉淀紫（果冻的"渊"） */
  const JELLY_PALETTE = { h: '#eef2ff', b: '#2ecbff', d: '#7b2ff7' };
  const JELLY_A = [
    '............',
    '...hbbbbb...',
    '..bhbbbbbb..',
    '.bhbbbbbbbb.',
    '.bbbbbbbbbb.',
    'bbbbbbbbbbbb',
    'bbbbbbbbbbdd',
    'bbbbbbbbbddd',
    '.bbbbbbbdddd',
    '.bbbbddddddd',
    '.bbdddddddd.',
    '............',
  ];
  const JELLY_B = [                                    // 压扁帧：矮一截宽一圈
    '............',
    '............',
    '..hbbbbbbb..',
    '.bhbbbbbbbb.',
    'bhbbbbbbbbb.',
    'bbbbbbbbbbbb',
    'bbbbbbbbbbbb',
    'bbbbbbbbbddd',
    'bbbbbbbbbddd',
    '.bbbbddddddd',
    '.bdddddddddd',
    '..ddddddddd.',
  ];

  /* 两个果冻画布一起画；低动效只画 A 帧不再切换 */
  const jellyCans = [document.getElementById('jelly'), document.getElementById('hero-jelly')]
    .filter(Boolean);
  function drawJelly(frame) {
    for (const c of jellyCans) paint(c, frame ? JELLY_B : JELLY_A, JELLY_PALETTE);
  }
  drawJelly(0);
  if (!REDUCED && jellyCans.length) {
    let f = 0;
    setInterval(() => drawJelly(f = 1 - f), 550);      // 550ms 两帧呼吸
  }

  /* ═══════════ 3. 关卡精灵（16×16） ═══════════
     每关一枚像素图标，主色 c 由关卡卡内联 --clr 注入 ——
     换主题色即换整套精灵配色（数据驱动的炫彩）。
     rocket：手写引擎 → 火箭（引擎即火箭，窗 = 观察者之眼） */
  function clrOf(canvas) {
    // 从所属关卡卡读取 --clr；读不到则回退青色
    const card = canvas.closest('.level');
    return (card && getComputedStyle(card).getPropertyValue('--clr').trim()) || '#2ecbff';
  }
  const ROCKET = [
    '.......cc.......',
    '......cccc......',
    '......cccc......',
    '.....cbbbbc.....',
    '.....cbbbbc.....',
    '.....cboobc.....',
    '.....cboobc.....',
    '.....cbbbbc.....',
    '.....cbbbbc.....',
    '..c..cbbbbc..c..',
    '.cc..cbbbbc..cc.',
    '.ccc.cbbbbc.ccc.',
    '.ccccbbbbbbcccc.',
    '......fFFf......',
    '.......F........',
    '................',
  ];
  /* planet：墨渊档案 → 环状星球（环用金色，撞色出 16-bit 味） */
  const PLANET = [
    '................',
    '................',
    '.....pppppp.....',
    '....pppppppp....',
    '...pppppppppp...',
    '...ppdppppppp...',
    'rrrpppppppppprrr',
    'rrrrpppppppprrrr',
    '.rrrpppppppprrr.',
    '...pppppppppp...',
    '...pppdpppppp...',
    '....pppppppp....',
    '.....pppppp.....',
    '................',
    '................',
    '................',
  ];
  /* chest：未器之城 → 宝箱（金箱粉宝石 —— 藏起来的器物） */
  const CHEST = [
    '................',
    '................',
    '................',
    '..GGGGGGGGGGGG..',
    '.GGGGGGGGGGGGGG.',
    '.GDDDDDDDDDDDDG.',
    '.GGGGGGGGGGGGGG.',
    '.DDDDDDDDDDDDDD.',
    '.GGGGGpppGGGGGG.',
    '.GGGGGpppGGGGGG.',
    '.GGGGGGGGGGGGGG.',
    '.GDDDDDDDDDDDDG.',
    '.GGGGGGGGGGGGGG.',
    '..GGGGGGGGGGGG..',
    '................',
    '................',
  ];
  /* 逐卡绘制：色板里的 c 用当前卡的 --clr 实时填充 */
  document.querySelectorAll('canvas.sprite[data-sprite]').forEach((c) => {
    const clr = clrOf(c);
    const table = {
      rocket: [ROCKET, { c: clr, b: '#eef2ff', o: '#0b0b1a', f: '#ffd23f', F: '#ff7a2e' }],
      planet: [PLANET, { p: clr, d: '#c21d63', r: '#ffd23f' }],
      chest:  [CHEST,  { G: clr, D: '#c9971f', p: '#ff2e88' }],
    }[c.dataset.sprite];
    if (table) paint(c, table[0], table[1]);
  });

  /* ═══════════ 4. NPC 头像：村口老者（12×12） ═══════════
     草帽金 g / 皮肤 s / 眼睛 e / 白须 w / 紫袍 p / 袍摆深 d
     —— RPG 里说出核心宣言的那位 NPC */
  const SAGE = [
    '....gggg....',
    '..gggggggg..',
    '.gggggggggg.',
    '...ssssss...',
    '...sesess...',
    '..wssssssw..',
    '..wwwwwwww..',
    '...wwwwww...',
    '.pppppppppp.',
    '.ppgppppgpp.',
    '.pppppppppp.',
    '.dddddddddd.',
  ];
  const npc = document.getElementById('npc-avatar');
  if (npc) {
    paint(npc, SAGE, {
      g: '#ffd23f', s: '#f2c992', e: '#1a1030',
      w: '#eef2ff', p: '#7b2ff7', d: '#5a1fd0',
    });
  }

  /* ═══════════ 5. 打字机 ═══════════
     对话框逐字输出；标点（。，：——）停 320ms 模拟"念台词"，
     其余 62ms/字。低动效直接出全文。
     ▼ 续行符与光标闪烁由 CSS 常驻，无需 JS 管理 */
  function typewriter(el, text) {
    if (!el) return;
    if (REDUCED) { el.textContent = text; return; }
    let i = 0;
    (function step() {
      if (i >= text.length) return;      // 全文出完，光标交给 CSS 继续闪
      const ch = text[i++];
      el.textContent += ch;
      setTimeout(step, '。，：——'.includes(ch) ? 320 : 62);
    })();
  }
  const TW_TEXT = '愿被看见，不被定义。主角「不器」已加入队伍 —— 职业：？？？ 攻击：好奇心 防御：∞';

  /* ═══════════ 6. 显现系统 ═══════════
     data-rv 元素进视口 15% 即加 .is-in"刷"现；
     data-d="1" 这类序号换算成 --d 级联延迟（0.12s 步进），
     三张关卡卡依次落位 = 关卡列表的仪式感 */
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      io.unobserve(e.target);            // 只演一次
    }
  }, { threshold: 0.15 });
  document.querySelectorAll('[data-rv]').forEach((el) => {
    if (el.dataset.d) el.style.setProperty('--d', `${el.dataset.d * 0.12}s`);
    io.observe(el);
  });

  /* ═══════════ 7. 开机序列 ═══════════
     ① 字体赛跑：fonts.ready 与 900ms 计时器取先到 ——
        字体被墙时不至于白屏等太久
     ② is-live 加上 body：CSS 接管 —— 血条 steps(20) 充能、
        首屏元素刷现
     ③ 400ms 后打字机开始念台词；金币从 0000 滚到 9999
        （+333/40ms ≈ 1.2s，像素游戏的爽快节奏） */
  function countCoin() {
    const el = document.getElementById('coin');
    if (!el || REDUCED) return;          // 低动效保持静态 9999
    const goal = +el.textContent || 0;
    let v = 0;
    el.textContent = '0';
    const timer = setInterval(() => {
      v = Math.min(goal, v + 333);
      el.textContent = String(v).padStart(4, '0');
      if (v >= goal) clearInterval(timer);
    }, 40);
  }

  const fontsReady = Promise.race([
    (document.fonts && document.fonts.ready) || Promise.resolve(),
    new Promise((r) => setTimeout(r, 900)),
  ]);
  fontsReady.then(() => {
    setTimeout(() => {
      document.body.classList.add('is-live');        // ← 开机瞬间
      setTimeout(() => {
        typewriter(document.getElementById('typewriter'), TW_TEXT);
        countCoin();
      }, 400);
    }, 120);
  });
})();
