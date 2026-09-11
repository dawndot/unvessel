/**
 * ============================================================
 * garden-room.ts — 「不器书房」P1+P2：房间壳体与四物件（自留地第一屏）
 * ============================================================
 * 职责：
 *   1. 程序化水墨纹理：Canvas 2D 现场绘制宣纸墙 / 墨石地板
 *      ——零图片资产、零网络请求，每次访问随机微不同（「每次都是新的一张纸」）；
 *   2. 平面几何房间壳体：地板 + 四墙 + 天花，墨渊色板；
 *   3. 机位系统：REST 全景（入房运镜 + 呼吸微动）+ CLOSEUPS 推近特写
 *      （goto/back：easeInOutCubic 一条曲线走完 push，见状态机段）；
 *   4. 降级链路：无 WebGL → canvas 不出现，stage 的 CSS 宣纸底自然露出
 *      （cue 保持深墨）；WebGL 可用 → stage 加 .is-live，cue 换骨白；
 *      prefers-reduced-motion → 跳过所有运镜，只渲染一帧。
 *
 * 设计决策（为何这样做）：
 *   - 光照全部「烘」进纹理：全场景 MeshBasicMaterial（不参与光照计算），
 *     亮度衰减 / vignette / 墨晕都画在 Canvas 上——精致感来自材质统一，
 *     而不是几何复杂（27 章拍板的混合路线）。
 *   - 程序化而非图片资产：AI 生图通道不可用是导火索，但真正理由是
 *     零失败路径（无网络依赖）+ 色板参数化（与 global.css 令牌同源）+
 *     访客间纹理互不相同（每访问都是新的一张纸）。
 *   - 幂等生命周期：站点启用 <ClientRouter />（视图过渡），
 *     astro:page-load 在首载与每次换页后都会触发，
 *     故导出 mount / unmount 幂等入口（装配见 garden.astro 尾部脚本）；
 *     换页前必须拆除 RAF 与 ResizeObserver，否则泄漏到下一页。
 *   - 分层不替换：canvas 只是叠加在 CSS 宣纸底之上的一层——
 *     WebGL 失败 = canvas 不出现，宣纸底与题字构成静态画面，
 *     下方 2D 内容永远可达（无 JS 同理）。
 *
 * P2 已进场（物件工厂见 garden-props.ts）：
 *   - 四物件全程序化几何 + 墨渊材质（模型路线论证见 props 头注释）；
 *   - 推近机位 goto/back：easeInOutCubic 一条曲线走完 push 动画，
 *     P4 的 raycaster 点击将消费同一对入口与 CLOSEUPS 表；
 * 后续扩展（P3/P4 留好的缝）：
 *   - 内容管线：便签墙 CanvasTexture 由 ideas 集合驱动重绘（P3），
 *     书脊换真数据（P3），放映机幕布 = HTML overlay（P4）；
 *   - 交互闭环：点击物件 → goto(id) → overlay 浮现 → back()（P4）。
 * ============================================================
 */

import * as THREE from 'three';
import { buildProps, CLOSEUPS, type PropId } from './garden-props';

/* ---------- 墨渊色板（与 global.css 令牌同源，改动需两边同步） ---------- */
const PAL = {
  void: '#070707',    // 渊底：场景背景 / 清屏色
  bone: '#f2f0ea',    // 骨白：宣纸底色
  smoke: '#8a8781',   // 烟灰：纤维 / 墨云
  inkWell: '#101010', // 近黑：天花（几乎不入画，只负责封顶防穿帮）
} as const;

/* ---------- 房间尺寸（米） ----------
   面北而立：北墙（正对机位）是 P2+ 的主展墙（便签墙/书架/留声机都挂它），
   进深取大些，给物件推近时的机位走位留空间。 */
const ROOM = { w: 10, d: 12, h: 4.2 } as const;

/* ---------- 机位 ----------
   REST：常驻机位（呼吸运镜围绕它摆动）——站姿眼高，离北墙约 10.9m，
   垂直视场 42° 时北墙完整入画且留有前景地板与天花一线；
   FROM：入场机位（略高略后），运镜 = 从门口退一步走进房间。 */
const REST = {
  pos: new THREE.Vector3(0, 1.55, 4.9),
  look: new THREE.Vector3(0, 1.35, -2.5), // 视线略压向地板，画面重心下沉
};
const FROM = {
  pos: new THREE.Vector3(0, 1.85, 6.05),
  look: new THREE.Vector3(0, 1.72, -1.2),
};
const FOV = 42;          // 常驻垂直视场角：全景但无广角畸变
const FOV_PORTRAIT = 55; // 竖屏（手机）拉大视场，保证北墙仍能入画
const INTRO_MS = 1800;   // 入房运镜时长
const PUSH_MS = 1400;    // 推近/返回运镜时长：距离比入房短，稍快一点保持节奏

/* ---------- 小工具 ---------- */

/** [min, max) 区间随机浮点 */
const rand = (min: number, max: number): number => min + Math.random() * (max - min);

/** easeInOutCubic —— 全站唯一运镜曲线（不引入 GSAP，理由见归档 27 章） */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/* ============================================================
 * 程序化纹理工厂
 * 全部用 Canvas 2D 绘制后交 THREE.CanvasTexture。
 * 每次调用随机数序列不同 → 每位访客拿到的纸/石独一无二。
 * ============================================================ */

/**
 * 宣纸墙纹理
 * 绘制层次（自底向上）：
 *   ① 骨白底 → ② 大块云斑（低频明度摆动，破「纯色塑料感」）
 *   → ③ 纸纤维（~900 根细短弧线，高频绒感）
 *   → ④ 帘纹（抄纸竹帘留下的平行竖纹，间距带抖动）
 *   → ⑤ 墙脚墨晕 + 渍痕（年代感的水平线）
 *   → ⑥ 四边 vignette（把灯光衰减直接画进贴图 = 零实时光照的关键）
 *   → ⑦ 侧墙压暗档（'dim'：等效于侧墙离「光源」更远）
 * @param tone 'bright' 正面主墙 | 'dim' 侧墙 / 背后墙
 */
function makePaperCanvas(w = 1024, h = 512, tone: 'bright' | 'dim' = 'bright'): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  if (!g) return cv; // 拿不到 2D 上下文就交空画布（纯色仍可工作，概率趋零）

  // ① 骨白底
  g.fillStyle = PAL.bone;
  g.fillRect(0, 0, w, h);

  // ② 大块云斑：低频不均匀感
  for (let i = 0; i < 14; i++) {
    const x = rand(0, w);
    const y = rand(0, h);
    const r = rand(w * 0.15, w * 0.45);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const a = rand(0.02, 0.055);
    grd.addColorStop(0, `rgba(138,135,129,${a.toFixed(3)})`); // smoke
    grd.addColorStop(1, 'rgba(138,135,129,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }

  // ③ 纸纤维：细短微弯弧线，两个灰阶、极低透明度
  g.lineWidth = 1;
  for (let i = 0; i < 900; i++) {
    const x = rand(-10, w + 10);
    const y = rand(-10, h + 10);
    const len = rand(6, 26);
    const ang = rand(0, Math.PI);
    const shade = Math.random() < 0.5 ? '190,186,176' : '120,116,108';
    g.strokeStyle = `rgba(${shade},${rand(0.05, 0.16).toFixed(3)})`;
    g.beginPath();
    g.moveTo(x, y);
    // 中点加随机偏移 → 微弯的纤维而不是僵硬直线
    g.quadraticCurveTo(
      x + Math.cos(ang) * len * 0.5 + rand(-3, 3),
      y + Math.sin(ang) * len * 0.5 + rand(-3, 3),
      x + Math.cos(ang) * len,
      y + Math.sin(ang) * len
    );
    g.stroke();
  }

  // ④ 帘纹：极淡竖向平行线，间距随机抖动避免「机器条纹」
  for (let x = rand(0, 4); x < w; x += rand(3.5, 7)) {
    g.strokeStyle = `rgba(138,135,129,${rand(0.02, 0.045).toFixed(3)})`;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + rand(-1, 1), h);
    g.stroke();
  }

  // ⑤ 墙脚墨晕：底部 18% 高度自下而上的墨色渐变
  const ink = g.createLinearGradient(0, h * 0.82, 0, h);
  ink.addColorStop(0, 'rgba(7,7,7,0)');
  ink.addColorStop(1, 'rgba(7,7,7,0.22)');
  g.fillStyle = ink;
  g.fillRect(0, h * 0.82, w, h * 0.18);
  // 渍痕：3~5 道短横向墨带，位置随机——不是均匀水线
  const streaks = 3 + Math.floor(rand(0, 3));
  for (let i = 0; i < streaks; i++) {
    const sx = rand(0, w * 0.8);
    const sw = rand(w * 0.08, w * 0.3);
    const sy = rand(h * 0.86, h * 0.99);
    const sh = rand(3, 9);
    const sg = g.createLinearGradient(0, sy - sh, 0, sy + sh);
    sg.addColorStop(0, 'rgba(7,7,7,0)');
    sg.addColorStop(0.5, `rgba(7,7,7,${rand(0.05, 0.12).toFixed(3)})`);
    sg.addColorStop(1, 'rgba(7,7,7,0)');
    g.fillStyle = sg;
    g.fillRect(sx, sy - sh, sw, sh * 2);
  }

  // ⑥ 四边 vignette：模拟烘焙环境光的边缘衰减
  const vg = g.createRadialGradient(
    w / 2, h / 2, Math.min(w, h) * 0.35,
    w / 2, h / 2, Math.max(w, h) * 0.72
  );
  vg.addColorStop(0, 'rgba(7,7,7,0)');
  vg.addColorStop(1, 'rgba(7,7,7,0.16)');
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);

  // ⑦ 侧墙压暗档
  if (tone === 'dim') {
    g.fillStyle = 'rgba(112,108,100,0.20)';
    g.fillRect(0, 0, w, h);
  }
  return cv;
}

/**
 * 墨石地板纹理：渊黑底 + 烟灰墨云（磨墨晕开的样子）+ 深墨负空间
 * + 石脉长弧 + 强 vignette（地板边缘沉入渊底，房间「没有边界」）。
 * 相机掠射角下地板占画面下方约 1/3，低频云纹足以撑住质感。
 */
function makeFloorCanvas(size = 1024): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d');
  if (!g) return cv;

  // ① 渊黑底（比 --void 略亮半档，与天花/背景拉开层次）
  g.fillStyle = '#0b0b0a';
  g.fillRect(0, 0, size, size);

  // ② 墨云：烟灰大径向渐变多层叠加
  for (let i = 0; i < 18; i++) {
    const x = rand(0, size);
    const y = rand(0, size);
    const r = rand(size * 0.12, size * 0.4);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const a = rand(0.02, 0.06);
    grd.addColorStop(0, `rgba(138,135,129,${a.toFixed(3)})`);
    grd.addColorStop(1, 'rgba(138,135,129,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  }
  // 深墨负空间：让云有浓淡呼吸
  for (let i = 0; i < 6; i++) {
    const x = rand(0, size);
    const y = rand(0, size);
    const r = rand(size * 0.1, size * 0.3);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(0,0,0,${rand(0.12, 0.25).toFixed(3)})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  }

  // ③ 石脉长弧：少量横贯画面的极淡曲线——石材打磨纹
  g.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    const y0 = rand(0, size);
    g.strokeStyle = `rgba(138,135,129,${rand(0.02, 0.05).toFixed(3)})`;
    g.beginPath();
    g.moveTo(-20, y0);
    g.quadraticCurveTo(size * rand(0.3, 0.7), y0 + rand(-60, 60), size + 20, rand(0, size));
    g.stroke();
  }

  // ④ 强 vignette
  const vg = g.createRadialGradient(size / 2, size / 2, size * 0.25, size / 2, size / 2, size * 0.72);
  vg.addColorStop(0, 'rgba(7,7,7,0)');
  vg.addColorStop(1, 'rgba(7,7,7,0.5)');
  g.fillStyle = vg;
  g.fillRect(0, 0, size, size);
  return cv;
}

/** Canvas → CanvasTexture：声明 sRGB（Canvas 2D 颜色即 sRGB，避免二次 gamma）+ 各向异性 */
function canvasTexture(cv: HTMLCanvasElement, aniso: number): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso; // 掠射角（地板）清晰度
  return tex;
}

/** WebGL 能力探测：先探后建，任何异常都视为不支持 */
function supportsWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

/* ============================================================
 * 幂等生命周期（装配见 garden.astro 尾部脚本）
 * ============================================================ */

/** 当前场景的拆除函数；null = 未挂载 */
let teardown: (() => void) | null = null;

/**
 * 挂载书房场景（幂等：重复调用直接返回）。
 * 任何失败路径（WebGL 探测失败 / Renderer 构造抛错）都不创建 canvas，
 * stage 的 CSS 宣纸底与题字自然构成静态画面。
 */
export function mountGardenRoom(): void {
  if (teardown) return; // 已挂载
  const host = document.getElementById('garden-stage-canvas');
  if (!host) return; // 脚本残留监听在其他页触发：无事可做

  // —— WebGL 能力检测 ——
  // 失败路径什么都不加不做：stage 的 CSS 宣纸底与深墨 cue 自然构成静态画面
  if (!supportsWebGL()) {
    console.info('[garden-room] WebGL 不可用，已降级为静态宣纸底。');
    return;
  }

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
  } catch {
    console.info('[garden-room] WebGL Renderer 创建失败，已降级为静态宣纸底。');
    return;
  }

  // 3D 成功接管画面：给舞台加 is-live，CSS 据此把「向下」引导从深墨换成骨白
  // （3D 态的地板是墨渊黑，深墨 cue 会隐形；无 JS / 降级态保持深墨在宣纸上可见）
  const stage = host.closest('#garden-stage');
  stage?.classList.add('is-live');

  // DPR 锁 2：低端高分屏不翻倍，保帧率（27 章降级预案）
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(new THREE.Color(PAL.void), 1);
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAL.void);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);

  // —— 纹理：Canvas 2D 现场绘制（每次访问随机微不同）——
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const wallTex = canvasTexture(makePaperCanvas(1024, 512, 'bright'), maxAniso);
  const floorTex = canvasTexture(makeFloorCanvas(1024), maxAniso);

  // —— 房间壳体：六个面拼一个盒子，法线全部朝房内 ——
  // MeshBasicMaterial：不参与光照，明暗全部由贴图承担。
  const disposables: Array<{ dispose(): void }> = [wallTex, floorTex];
  const room = new THREE.Group();

  // 地板：默认平面立着朝 +Z，绕 X 转 -90° 放平朝上
  const floorGeo = new THREE.PlaneGeometry(ROOM.w, ROOM.d);
  const floorMat = new THREE.MeshBasicMaterial({ map: floorTex });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  room.add(floor);
  disposables.push(floorGeo, floorMat);

  // 天花：近黑平色（几乎不入画，封顶防穿帮）
  const ceilGeo = new THREE.PlaneGeometry(ROOM.w, ROOM.d);
  const ceilMat = new THREE.MeshBasicMaterial({ color: PAL.inkWell });
  const ceil = new THREE.Mesh(ceilGeo, ceilMat);
  ceil.rotation.x = Math.PI / 2; // 法线朝下
  ceil.position.y = ROOM.h;
  room.add(ceil);
  disposables.push(ceilGeo, ceilMat);

  // 北墙（主展墙）：最亮，P2+ 的便签墙/书架/留声机都在它面前
  const wallGeoN = new THREE.PlaneGeometry(ROOM.w, ROOM.h);
  const wallMatN = new THREE.MeshBasicMaterial({ map: wallTex });
  const wallN = new THREE.Mesh(wallGeoN, wallMatN);
  wallN.position.set(0, ROOM.h / 2, -ROOM.d / 2); // 默认法线 +Z，正对机位
  room.add(wallN);
  disposables.push(wallGeoN, wallMatN);

  // 东西侧墙：同一张纸，color 乘 map = 整体压暗（等效烘焙的侧光衰减）
  const sideGeo = new THREE.PlaneGeometry(ROOM.d, ROOM.h);
  disposables.push(sideGeo);
  const mkSide = (x: number, rotY: number, tint: number) => {
    const mat = new THREE.MeshBasicMaterial({ map: wallTex, color: tint });
    const mesh = new THREE.Mesh(sideGeo, mat);
    mesh.position.set(x, ROOM.h / 2, 0);
    mesh.rotation.y = rotY;
    room.add(mesh);
    disposables.push(mat);
  };
  mkSide(-ROOM.w / 2, Math.PI / 2, 0xb9b5ab);  // 西墙：法线转向 +X
  mkSide(ROOM.w / 2, -Math.PI / 2, 0xb9b5ab);  // 东墙：法线转向 -X

  // 南墙（机位背后）：压得更暗，只在超宽屏等极端纵横比下可能入画
  const wallGeoS = new THREE.PlaneGeometry(ROOM.w, ROOM.h);
  const wallMatS = new THREE.MeshBasicMaterial({ map: wallTex, color: 0xa8a49a });
  const wallS = new THREE.Mesh(wallGeoS, wallMatS);
  wallS.position.set(0, ROOM.h / 2, ROOM.d / 2);
  wallS.rotation.y = Math.PI; // 法线转向 -Z
  room.add(wallS);
  disposables.push(wallGeoS, wallMatS);

  scene.add(room);

  // —— P2 四物件进场：书架 / 便签墙 / 书桌 / 留声机 / 放映机 ——
  // 全程序化几何 + 墨渊材质（模型路线论证见 garden-props.ts 头注释），
  // 资源登记进同一份 disposables，teardown 时一起回收。
  scene.add(buildProps(disposables, maxAniso));

  // —— 尺寸跟随：以宿主元素实际大小为准（100dvh 布局），RO 监听变化 ——
  const sizeTo = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (w === 0 || h === 0) return; // 舞台被隐藏/换页中：跳过
    renderer.setSize(w, h, false);  // false：外观由 CSS 100% 控制，不写内联样式
    camera.aspect = w / h;
    camera.fov = camera.aspect < 0.75 ? FOV_PORTRAIT : FOV; // 竖屏拉大视场
    camera.updateProjectionMatrix();
  };
  sizeTo();

  // —— 运镜状态机：intro（入房）→ breath（呼吸）⇄ push（推近/返回）→ closeup（特写呼吸）——
  // goto/back 是 P2 的 DEV 调试入口（window.__gardenRoom），
  // P4 的 raycaster 点击将消费同一对入口与 CLOSEUPS 表（接口先于交互定型）。
  // prefers-reduced-motion：跳过全部运镜与推近动画，机位直接切换只渲染一帧。
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lookAt = new THREE.Vector3(); // 插值 / 呼吸共用的临时视线点
  let mode: 'intro' | 'breath' | 'push' | 'closeup' = 'intro';
  let t0 = 0; // 首帧时间戳（requestAnimationFrame 传入的是绝对时间）
  let raf = 0;

  // push 动画的起止与去向：from = 触发瞬间的机位快照（从真实位置出发，避免跳变），
  // after = 动画完成后进入的模式（推近 → closeup，返回 → breath）。
  const pushFrom = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const pushTarget = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  let pushT0 = 0;
  let afterPush: 'breath' | 'closeup' = 'breath';
  // 特写呼吸的基准机位：goto 的落点被记住，closeup 呼吸与 back() 都以它为锚
  const closeupBase = { pos: new THREE.Vector3(), look: new THREE.Vector3() };

  /** 呼吸：三个不同周期的正弦叠加，围绕基准机位厘米级微动——「有人住」而不是「摄像机」。
   *  REST 与特写机位共用同一套波形，只差幅度系数。
   *  @param amp 幅度系数：REST 全景用 1；特写离墙近、同幅度视觉摆动更大，用 0.5 */
  const breathe = (now: number, basePos: THREE.Vector3, baseLook: THREE.Vector3, amp: number) => {
    const s = now / 1000;
    camera.position.set(
      basePos.x + Math.sin(s * 0.31) * 0.045 * amp,      // ~20s 一摆（横向）
      basePos.y + Math.sin(s * 0.53 + 1.3) * 0.02 * amp, // ~12s 一浮（纵向）
      basePos.z
    );
    lookAt.set(
      baseLook.x,
      baseLook.y + Math.sin(s * 0.41 + 0.5) * 0.012 * amp, // 视线也轻轻漂
      baseLook.z
    );
    camera.lookAt(lookAt);
  };

  /** 推近/返回共用入口：快照当前机位为起点 → 设定终点与去向 → 进入 push 态 */
  const startPush = (to: { pos: THREE.Vector3; look: THREE.Vector3 }, after: 'breath' | 'closeup') => {
    pushFrom.pos.copy(camera.position);
    pushFrom.look.copy(lookAt);
    pushTarget.pos.copy(to.pos);
    pushTarget.look.copy(to.look);
    pushT0 = performance.now(); // 触发发生在事件回调里，不在帧回调内，取当下时钟
    afterPush = after;
    mode = 'push';
  };

  /** 推近到物件特写机位（CLOSEUPS 表见 garden-props.ts）；未知 id 静默忽略 */
  const goto = (id: PropId) => {
    const cu = CLOSEUPS[id];
    if (!cu) return;
    closeupBase.pos.copy(cu.pos);
    closeupBase.look.copy(cu.look);
    if (reduced) {
      // reduced：无 RAF 在跑，跳过动画直接切机位，补渲染一帧
      camera.position.copy(cu.pos);
      lookAt.copy(cu.look);
      camera.lookAt(lookAt);
      renderer.render(scene, camera);
      return;
    }
    startPush(cu, 'closeup');
  };

  /** 返回常驻全景机位（REST）；非特写态调用 = 从当前位置平滑归位，无害 */
  const back = () => {
    if (reduced) {
      camera.position.copy(REST.pos);
      lookAt.copy(REST.look);
      camera.lookAt(lookAt);
      renderer.render(scene, camera);
      return;
    }
    startPush(REST, 'breath');
  };

  const frame = (now: number) => {
    if (!t0) t0 = now;
    if (mode === 'intro') {
      const k = Math.min((now - t0) / INTRO_MS, 1);
      const e = easeInOutCubic(k);
      camera.position.lerpVectors(FROM.pos, REST.pos, e);
      lookAt.lerpVectors(FROM.look, REST.look, e);
      camera.lookAt(lookAt);
      if (k >= 1) mode = 'breath';
    } else if (mode === 'push') {
      // 推近/返回：easeInOutCubic 一条曲线走完（与入房同曲线，全站唯一运镜手感）
      const k = Math.min((now - pushT0) / PUSH_MS, 1);
      const e = easeInOutCubic(k);
      camera.position.lerpVectors(pushFrom.pos, pushTarget.pos, e);
      lookAt.lerpVectors(pushFrom.look, pushTarget.look, e);
      camera.lookAt(lookAt);
      if (k >= 1) mode = afterPush;
    } else if (mode === 'closeup') {
      breathe(now, closeupBase.pos, closeupBase.look, 0.5);
    } else {
      breathe(now, REST.pos, REST.look, 1);
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };

  if (reduced) {
    camera.position.copy(REST.pos);
    camera.lookAt(REST.look);
    renderer.render(scene, camera); // 静态一帧；窗口变化时由 RO 补渲染
  } else {
    raf = requestAnimationFrame(frame);
  }

  // —— DEV 调试句柄：控制台 window.__gardenRoom.goto('gramophone') 逐机位推近验收；
  // P4 换成 raycaster 点击消费同一对入口。teardown 时随场景一起注销。 ——
  type GardenRoomHandle = { goto: (id: PropId) => void; back: () => void };
  const handle: GardenRoomHandle = { goto, back };
  (window as unknown as { __gardenRoom?: GardenRoomHandle }).__gardenRoom = handle;

  // —— Resize：尺寸变化时重设画布；静态模式下补渲染一帧 ——
  const ro = new ResizeObserver(() => {
    sizeTo();
    if (reduced) renderer.render(scene, camera);
  });
  ro.observe(host);

  // —— 拆除：换页（astro:before-swap）时回收一切 ——
  teardown = () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    disposables.forEach((d) => d.dispose());
    renderer.dispose();
    renderer.domElement.remove();
    // DEV 句柄随场景注销：防换页后悬挂引用已拆除的 renderer/scene
    delete (window as unknown as { __gardenRoom?: GardenRoomHandle }).__gardenRoom;
    stage?.classList.remove('is-live'); // 状态类随场景一起拆，重挂时干净
    teardown = null;
  };
}

/** 拆除书房场景（未挂载时调用是安全的空操作） */
export function unmountGardenRoom(): void {
  teardown?.();
}
