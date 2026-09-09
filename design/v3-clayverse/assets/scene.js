/* ============================================================
   不器 unvessel — v3「未器之城 CLAYVERSE」3D 场景
   ------------------------------------------------------------
   技术选型：Three.js（CDN 动态 import，失败自动降级为纯排版）
   世界观：暖白雾色空间里漂浮着一群「未定型的器物」——
           没有一个是成形的容器，对应 unvessel = 未成之器
   交互：  ① 滚动 → 相机沿 z 轴穿越器物群（DOM 滚动距离驱动）
           ② 鼠标 hover → 器物轻微放大
           ③ 点击器物 → 弹簧脉冲弹跳
           ④ 鼠标移动 → 相机轻微视差偏移
   ============================================================ */

let THREE; // Three.js 命名空间（动态 import 后赋值）

(async function boot() {
  /* ---------- 0 · 加载与降级闸门 ---------- */
  try {
    // 用 jsdelivr CDN 动态 import；国内网络可用性优于 unpkg
    THREE = await import('https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js');
  } catch (err) {
    // CDN 加载失败：给 body 挂 no-3d，CSS 会隐藏画布并切静态渐变底
    document.body.classList.add('no-3d');
    return;
  }

  /* ---------- 1 · 尊重系统减动效偏好 ---------- */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 2 · 渲染器 ---------- */
  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // DPR 钳制 1.5：高分屏上省一半以上片元开销
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0xf4f1ec); // 与 CSS --paper 同源，画布与页面无缝

  /* ---------- 3 · 场景与雾 ---------- */
  const scene = new THREE.Scene();
  // 雾色 = 底色：远处的器物会慢慢"溶进雾里"，近处浮现，形成纵深呼吸
  scene.fog = new THREE.Fog(0xf4f1ec, 14, 46);

  /* ---------- 4 · 灯光（黏土质感的关键：柔天光 + 主定向光 + 补光） ---------- */
  // 半球光：天面暖白、地面浅灰，给黏土体均匀的环境过渡
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d4cc, 1.15));

  // 主定向光：从右上前方打亮，塑造体积
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(6, 10, 8);
  scene.add(key);

  // 冷蓝补光：从左下反向补一点克莱因蓝的环境反射，暗示强调色的存在
  const fill = new THREE.DirectionalLight(0x4a63ff, 0.35);
  fill.position.set(-8, -4, 6);
  scene.add(fill);

  /* ---------- 5 · 器物群（漂浮几何体清单） ---------- */
  // 调色板：低饱和软彩 + 克莱因蓝主角（黏土世界不含纯黑）
  const PALETTE = {
    clay:  0xf6f3ec, // 陶瓷白
    butter: 0xf2c94c, // 奶油黄
    mist:  0xa8c0ff, // 雾蓝
    terra: 0xe8956b, // 陶土橙
    sage:  0x9db5a0, // 灰绿
    klein: 0x2242ff, // 克莱因蓝（唯一饱和色）
  };

  // 声明式清单：type → 几何；p → 初始位姿；s → 尺寸
  // 布局原则：沿 z 轴疏散成一条"穿越走廊"，中央近区留白给 HERO 文字
  const SPEC = [
    { type: 'torusKnot', c: PALETTE.klein,  p: [ 4.6,  0.9, -11], s: 1.35 }, // 主角：蓝色扭结（hero 右侧）
    { type: 'sphere',    c: PALETTE.clay,   p: [-5.2,  1.6,  -8], s: 1.25 },
    { type: 'torus',     c: PALETTE.mist,   p: [-6.6, -0.6, -18], s: 1.15 },
    { type: 'capsule',   c: PALETTE.butter, p: [ 6.4, -1.3, -22], s: 1.1  },
    { type: 'ico',       c: PALETTE.terra,  p: [ 3.2,  2.6, -30], s: 1.05 },
    { type: 'sphere',    c: PALETTE.sage,   p: [-3.6, -2.1, -28], s: 1.0  },
    { type: 'octa',      c: PALETTE.clay,   p: [-7.0,  2.2, -38], s: 1.2  },
    { type: 'torus',     c: PALETTE.butter, p: [ 5.2, -2.6, -42], s: 1.0  },
    { type: 'sphere',    c: PALETTE.mist,   p: [ 0.5,  3.2, -50], s: 0.75 },
    { type: 'capsule',   c: PALETTE.clay,   p: [-4.8, -3.4, -55], s: 1.15 },
    { type: 'torusKnot', c: PALETTE.klein,  p: [ 0.0,  0.2, -62], s: 1.7  }, // 终点：宣言区正对的蓝色大扭结
  ];

  // 几何工厂：按清单 type 生成对应几何体
  const GEOS = {
    torusKnot: () => new THREE.TorusKnotGeometry(1, 0.32, 160, 24),
    sphere:    () => new THREE.SphereGeometry(1, 48, 32),
    torus:     () => new THREE.TorusGeometry(1, 0.38, 24, 72),
    capsule:   () => new THREE.CapsuleGeometry(0.7, 1.1, 8, 24),
    ico:       () => new THREE.IcosahedronGeometry(1.05, 0),
    octa:      () => new THREE.OctahedronGeometry(1.15, 0),
  };

  // 材质工厂：黏土 = 中低粗糙度 + 几乎无金属（高金属感会破坏"软"）
  const clayMat = (color) => new THREE.MeshStandardMaterial({
    color, roughness: 0.55, metalness: 0.05,
  });

  // 实例化清单：每个器物带上动画所需的随机参数（相位/幅度/自转速度）
  const items = SPEC.map((d, i) => {
    const mesh = new THREE.Mesh(GEOS[d.type](), clayMat(d.c));
    mesh.position.set(...d.p);
    mesh.scale.setScalar(d.s);
    scene.add(mesh);
    return {
      mesh,
      baseY: d.p[1],
      baseS: d.s,
      // 浮动参数：相位错开避免整齐划一的"群舞"，幅度与自转也各自随机
      phase: i * 1.7 + Math.random(),
      amp: 0.35 + Math.random() * 0.4,
      spin: { x: (Math.random() - .5) * 0.24, y: (Math.random() - .5) * 0.3 },
      hover: 0,   // hover 放大量（0~1，弹簧插值）
      pulse: 0,   // 点击脉冲量（1→0 指数衰减）
    };
  });

  /* ---------- 6 · 相机 ---------- */
  const camera = new THREE.PerspectiveCamera(
    55, window.innerWidth / window.innerHeight, 0.1, 100
  );
  camera.position.set(0, 0.5, 9); // 初始站在"走廊"入口

  // 穿越路径参数：滚动全程对应相机沿 z 前进的距离
  const TRAVEL = 70;

  /* ---------- 7 · 交互状态 ---------- */
  const pointer = new THREE.Vector2(0, 0);        // NDC 坐标（-1~1）
  const parallax = { x: 0, y: 0, tx: 0, ty: 0 };  // 相机视差：当前值/目标值
  const raycaster = new THREE.Raycaster();
  let hovered = null;
  let scrollP = 0; // 滚动进度 0~1

  // 鼠标移动：更新 NDC + 视差目标（Raycast 在帧循环里做，避免高频构造）
  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    parallax.tx = pointer.x * 0.6;   // 相机 x 视差 ±0.6
    parallax.ty = pointer.y * 0.35;  // 相机 y 视差 ±0.35
  }, { passive: true });

  // 点击：命中器物 → 给弹簧脉冲（DOM 链接在上层，命中前已被拦截，互不干扰）
  window.addEventListener('click', (e) => {
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(items.map(it => it.mesh))[0];
    if (hit) {
      const it = items.find(x => x.mesh === hit.object);
      it.pulse = 1;
    }
  });

  /* ---------- 8 · 滚动进度 ---------- */
  function readScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollP = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
  }
  window.addEventListener('scroll', readScroll, { passive: true });
  readScroll();

  /* ---------- 9 · 尺寸自适应 ---------- */
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // 页面切后台：停帧省电（visibilitychange 与 v2 同策略）
  let paused = false;
  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
    if (!paused && !reduceMotion) clock.getDelta(); // 恢复时丢弃积压的 dt
  });

  /* ---------- 10 · 主循环 ---------- */
  const clock = new THREE.Clock();
  const lookTarget = new THREE.Vector3();

  function frame() {
    requestAnimationFrame(frame);
    if (paused) return;
    const dt = Math.min(clock.getDelta(), 0.05); // dt 钳制：切回前台不跳变
    const t = clock.elapsedTime;

    // 相机：滚动驱动 z 前进 + 蛇形侧移 + 鼠标视差（全部慢插值，松弛的漂移感）
    parallax.x += (parallax.tx - parallax.x) * 0.04;
    parallax.y += (parallax.ty - parallax.y) * 0.04;
    const cz = 9 - scrollP * TRAVEL;
    camera.position.z += (cz - camera.position.z) * 0.07;
    const cx = Math.sin(scrollP * Math.PI * 2) * 1.2 + parallax.x;
    const cy = 0.5 + Math.sin(scrollP * Math.PI * 3) * 0.6 + parallax.y;
    camera.position.x += (cx - camera.position.x) * 0.06;
    camera.position.y += (cy - camera.position.y) * 0.06;
    // 视线看向前进方向偏下一点，器物从两侧和雾中掠过
    lookTarget.set(camera.position.x * 0.5, camera.position.y * 0.5, camera.position.z - 12);
    camera.lookAt(lookTarget);

    // 器物：自转 + sin 浮动 + hover 弹簧放大 + 点击脉冲衰减
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(items.map(it => it.mesh));
    const hitMesh = hits[0]?.object || null;

    for (const it of items) {
      const m = it.mesh;
      // 自转：慢速各自旋转
      m.rotation.x += it.spin.x * dt;
      m.rotation.y += it.spin.y * dt;
      // 浮动：以 baseY 为中心的正弦漂移
      m.position.y = it.baseY + Math.sin(t * 0.7 + it.phase) * it.amp;

      // hover 检测（本轮帧循环是否被指到）→ 弹簧趋近 1，否则回落 0
      const targetHover = m === hitMesh ? 1 : 0;
      it.hover += (targetHover - it.hover) * 0.12;

      // 脉冲：指数衰减（乘 0.90/帧），衰减期间叠加向上弹跳与缩放
      it.pulse *= 0.90;
      const bounce = Math.sin(it.pulse * Math.PI) * 0.9; // 脉冲中段抬升

      m.scale.setScalar(it.baseS * (1 + it.hover * 0.12 + it.pulse * 0.18));
      m.position.y += bounce;
      m.position.x += Math.sin(it.pulse * Math.PI) * 0.15 * (m.position.x > 0 ? 1 : -1);

      // hover 反馈进材质：克莱因蓝自发光微亮，像"被发现时眨了下眼"
      m.material.emissive.setHex(0x2242ff);
      m.material.emissiveIntensity = it.hover * 0.12;
    }

    // 指针悬停在 3D 物体上时，整页光标换成手型（提示"可以戳"）
    document.body.style.cursor = hitMesh ? 'pointer' : '';

    renderer.render(scene, camera);
  }

  /* ---------- 11 · 启动 ---------- */
  if (reduceMotion) {
    // 减动效偏好：只渲染一帧静态构图（相机停初始位，不进循环）
    renderer.render(scene, camera);
  } else {
    frame();
  }
})();
