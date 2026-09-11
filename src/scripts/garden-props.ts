/**
 * ============================================================
 * garden-props.ts — 「不器书房」P2：四物件进场
 * ============================================================
 * 职责（P2 范围）：
 *   1. 四件内容物件的程序化几何 + 墨渊材质：
 *        书架     —— 读书（P3 接 garden.ts 读书条目换真书脊）
 *        便签墙   —— 灵感 ideas（P2 为占位便签，P3 接 ideas 集合重绘）
 *        书桌     —— 灵感承载面（留声机的桌面）
 *        留声机   —— 音乐（LatheGeometry 旋转曲面喇叭）
 *        放映机   —— 影像 / 日志（三脚架 + 双片盘箱体）
 *   2. 推近特写机位表 CLOSEUPS——P4 的 raycaster 点击直接消费
 *      这张表；本阶段先用 garden-room.ts 挂的 DEV 调试句柄
 *      （window.__gardenRoom.goto(id)）截图验收。
 *
 * 模型路线（为何全程序化——27 章拍板的执行修正，归档 29 章论证）：
 *   27 章原案「复杂件用 CC0 low-poly 现成模型」，实际核验后改判：
 *   - CC0 单体留声机不可得：Sketchfab 现成件为 Free Standard 许可
 *     （需署名 + NoAI），CGTrader 免费件许可各异；
 *   - 唯一 CC0 整包（polyyai Retro Tech Pack）为 AI 生成 + synthwave
 *     PBR 风格，60MB 下载只为两件模型，且其 PBR 贴图与水墨美学冲突，
 *     统一材质化后会被整体替换——只剩几何价值；
 *   - 27 章真正的定调是「几何不重要，材质统一才重要」：程序化件与
 *     P1 房间共享同一套语言（MeshBasicMaterial / 烘焙明暗 / 墨渊色板），
 *     零网络依赖（P1 的「零失败路径」原则），面数完全可控。
 *   古典曲面件（喇叭）恰是 LatheGeometry 旋转曲面最擅长的形状。
 *
 * 布局（北墙 z=-6 为主展墙，x∈[-5,5]）：
 *
 *      [书架]      [便签墙        ]      [放映机]
 *                [书桌 + 留声机]
 *      x=-3.5      x=-0.9                x=3.1
 * ============================================================
 */

import * as THREE from 'three';

/* ---------- 推近特写机位表（P4 raycaster 点击消费） ----------
   pos = 眼睛位置，look = 注视点；数值以 REST 站姿为参照手工调校，
   P2 截图验收后如有构图问题在此改参数即可。 */
export type PropId = 'desk' | 'shelf' | 'notes' | 'gramophone' | 'projector';

export const CLOSEUPS: Record<PropId, { pos: THREE.Vector3; look: THREE.Vector3 }> = {
  // 便签墙：站在桌前抬头看墙——视线落在墙面便签群上
  notes: {
    pos: new THREE.Vector3(0.15, 1.95, -2.5),
    look: new THREE.Vector3(-0.7, 2.4, -6),
  },
  // 书桌：俯身看桌面（含桌面上的留声机）
  desk: {
    pos: new THREE.Vector3(-0.55, 1.5, -3.1),
    look: new THREE.Vector3(-1.05, 0.82, -5.2),
  },
  // 书架：正面平视书脊群
  shelf: {
    // 首版 (z=-3.4) 离架太近，书脊群在画面里顶天立地；退到 z=-2.55 留出呼吸边
    pos: new THREE.Vector3(-3.5, 1.42, -2.55),
    look: new THREE.Vector3(-3.5, 1.2, -5.9),
  },
  // 留声机：蹲下平视喇叭（特写中最近的一档，离物件约 1.2m）
  // 首版 (z=-4.28, look.y=0.88) 喇叭占幅过大且偏上；退远 + 抬注视点让主体落回画面中带
  gramophone: {
    pos: new THREE.Vector3(-0.66, 1.06, -3.9),
    look: new THREE.Vector3(-1.05, 1.0, -5.42),
  },
  // 放映机：侧前方看箱体与片盘
  projector: {
    pos: new THREE.Vector3(2.1, 1.5, -3.15),
    look: new THREE.Vector3(3.2, 1.32, -4.8),
  },
};

/* ============================================================
 * 墨渊材质小工具
 * 与 P1 房间同语言：MeshBasicMaterial 不参与光照，
 * 明暗靠色阶与纹理本身承担。所有资源统一推入 disposables。
 * ============================================================ */

type Disposable = { dispose(): void };

/** 造一个纯色墨渊材质并登记回收 */
function inkMat(disposables: Disposable[], color: number): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ color });
  disposables.push(mat);
  return mat;
}

/** 造一个 BoxGeometry 并登记回收 */
function boxGeo(disposables: Disposable[], w: number, h: number, d: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  disposables.push(geo);
  return geo;
}

/** 造一个 Box Mesh 并登记几何与材质 */
function box(
  parent: THREE.Object3D,
  disposables: Disposable[],
  w: number, h: number, d: number,
  mat: THREE.MeshBasicMaterial,
  x = 0, y = 0, z = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(boxGeo(disposables, w, h, d), mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

/* ============================================================
 * 各物件工厂
 * ============================================================ */

/**
 * 书桌：桌面 + 四腿。深墨木色，桌上承载留声机。
 * 位置：x=-0.9, z=-5.15（面北而放，离北墙留 0.4m 走位）
 */
function buildDesk(disposables: Disposable[]): THREE.Group {
  const g = new THREE.Group();
  g.userData.id = 'desk';
  const wood = inkMat(disposables, 0x211e19);   // 深墨木：比渊底略暖，近处可辨
  const woodDark = inkMat(disposables, 0x191713); // 腿用更沉一档

  // 桌面：1.7 × 0.85，厚 6cm，桌面顶面 y = 0.75 + 0.03 = 0.78
  box(g, disposables, 1.7, 0.06, 0.85, wood, 0, 0.75, 0);
  // 四腿：细方柱，桌面底面到地板
  const lx = 1.7 / 2 - 0.07;
  const lz = 0.85 / 2 - 0.07;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    box(g, disposables, 0.055, 0.72, 0.055, woodDark, sx * lx, 0.36, sz * lz);
  }

  g.position.set(-0.9, 0, -5.15);
  return g;
}

/**
 * 便签墙：一块透明底 CanvasTexture 平面，画若干占位便签纸。
 * P3 将由 ideas 集合驱动重绘（导出 redrawNotes 那一刻才接数据）。
 * 位置：北墙中段上方（书桌正上方偏右），z 贴墙留 1cm 防 z-fighting。
 */
function makeNotesCanvas(w = 1024, h = 480): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  if (!g) return cv;

  // 透明底：只画纸片本身，宣纸墙从透明区透出来——「贴在墙上」而不是「贴在纸上」

  // 4 张便签：位置 / 大小 / 微旋转随机，但都压在版心中部安全区
  const notes = [
    { x: 0.10, y: 0.16, w: 0.24, h: 0.62, rot: -0.045 },
    { x: 0.40, y: 0.30, w: 0.21, h: 0.50, rot: 0.06 },
    { x: 0.66, y: 0.12, w: 0.26, h: 0.66, rot: -0.02 },
    { x: 0.47, y: 0.72, w: 0.18, h: 0.22, rot: 0.09 },
  ] as const;
  // 上表用归一化坐标（相对画布比例），换算像素后绘制
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    const nx = n.x * w;
    const ny = n.y * h;
    const nw = n.w * w;
    const nh = n.h * h;

    g.save();
    g.translate(nx + nw / 2, ny + nh / 2);
    g.rotate(n.rot);

    // 纸影：纸片底部一条淡墨横影（贴墙的立体感，全部手画——零实时光照）
    g.fillStyle = 'rgba(7,7,7,0.18)';
    g.fillRect(-nw / 2 + 3, -nh / 2 + 5, nw, nh);

    // 纸片：比宣纸底更亮半档的骨白
    g.fillStyle = '#f6f4ee';
    g.fillRect(-nw / 2, -nh / 2, nw, nh);
    // 纸边：一圈极淡墨框
    g.strokeStyle = 'rgba(7,7,7,0.14)';
    g.lineWidth = 1.5;
    g.strokeRect(-nw / 2, -nh / 2, nw, nh);

    // 占位内容：3~4 条烟灰短线（P3 换成 ideas 标题与日期）
    const lines = 3 + (i % 2);
    g.strokeStyle = 'rgba(90,86,79,0.5)';
    g.lineWidth = 2;
    for (let li = 0; li < lines; li++) {
      const ly = -nh / 2 + nh * 0.22 + li * nh * 0.16;
      const lw = nw * (0.5 + ((i * 7 + li * 13) % 40) / 100);
      g.beginPath();
      g.moveTo(-nw / 2 + nw * 0.14, ly);
      g.lineTo(-nw / 2 + nw * 0.14 + lw, ly + ((li * 5) % 3) - 1);
      g.stroke();
    }
    // 第一张右下角点一枚小朱砂方印——整面墙唯一的暖色
    if (i === 0) {
      g.fillStyle = 'rgba(194,59,50,0.82)';
      const s = nw * 0.13;
      g.fillRect(nw / 2 - s - nw * 0.12, nh / 2 - s - nh * 0.12, s, s);
    }
    g.restore();
  }
  return cv;
}

function buildNotesWall(disposables: Disposable[], maxAniso: number): THREE.Group {
  const g = new THREE.Group();
  g.userData.id = 'notes';

  const cv = makeNotesCanvas();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  disposables.push(tex);

  const geo = new THREE.PlaneGeometry(2.8, 1.31); // 比例与画布 1024×480 一致
  disposables.push(geo);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  disposables.push(mat);

  const plane = new THREE.Mesh(geo, mat);
  plane.position.set(-0.7, 2.4, -5.99); // 北墙面内 1cm，防 z-fighting
  g.add(plane);
  return g;
}

/**
 * 书架：外框 + 背板 + 3 层板 + 程序化书脊群。
 * 书脊颜色 = 墨渊衍生色阶 + 5% 概率朱砂点睛；厚度/高低随机错落。
 * P3 将由 garden.ts 读书条目驱动（书脊 = 数据的形状）。
 */
const SPINE_PALETTE = [
  '#1a1917', '#26231f', '#3a362f', '#4a463d',
  '#6b665a', '#8a8781', '#a8a49a', '#b9b5ab',
] as const;

function buildShelf(disposables: Disposable[]): THREE.Group {
  const g = new THREE.Group();
  g.userData.id = 'shelf';

  const frameMat = inkMat(disposables, 0x1f1c18);   // 框架深墨木
  const backMat = inkMat(disposables, 0x14120f);    // 背板近黑（像墙上的一个深窗洞）

  // 外框：W1.8 × H2.2 × D0.28，背板贴北墙
  const W = 1.8;
  const H = 2.2;
  const D = 0.28;
  const T = 0.045; // 板厚

  box(g, disposables, W, T, D, frameMat, 0, H - T / 2, 0);            // 顶板
  box(g, disposables, W, T, D, frameMat, 0, T / 2 + 0.04, 0);          // 底板（略离地防潮线）
  box(g, disposables, T, H, D, frameMat, -W / 2 + T / 2, H / 2, 0);    // 左立柱
  box(g, disposables, T, H, D, frameMat, W / 2 - T / 2, H / 2, 0);     // 右立柱
  box(g, disposables, W - T * 2, H, 0.015, backMat, 0, H / 2, -D / 2 + 0.01); // 背板

  // 3 层板 → 4 格：层间净空 ~0.5m
  const shelfYs = [0.04 + T / 2, 0.58, 1.12, 1.66]; // 底板顶 + 3 层板
  for (let i = 1; i < shelfYs.length; i++) {
    box(g, disposables, W - T * 2, T * 0.8, D - 0.03, frameMat, 0, shelfYs[i], 0.015);
  }

  // 书脊群：每格从左往右随机厚度塞书，放不下即止
  const spineMatCache = new Map<string, THREE.MeshBasicMaterial>();
  const spineMat = (hex: string) => {
    let m = spineMatCache.get(hex);
    if (!m) {
      m = inkMat(disposables, new THREE.Color(hex).getHex());
      spineMatCache.set(hex, m);
    }
    return m;
  };

  for (let s = 0; s < shelfYs.length; s++) {
    const baseY = shelfYs[s] + T * 0.4; // 本格书底
    let cursor = -W / 2 + T + 0.03;     // 左端起排
    while (cursor < W / 2 - T - 0.06) {
      const th = 0.028 + Math.random() * 0.03;            // 书厚
      if (cursor + th > W / 2 - T - 0.03) break;
      const bh = 0.17 + Math.random() * 0.07;             // 书高
      const isAccent = Math.random() < 0.05;              // 5% 朱砂点睛
      const hex = isAccent ? '#c23b32' : SPINE_PALETTE[Math.floor(Math.random() * SPINE_PALETTE.length)];
      box(
        g, disposables,
        th, bh, D - 0.09,
        spineMat(hex),
        cursor + th / 2, baseY + bh / 2, 0.02,
      );
      cursor += th + 0.004; // 书与书之间一线缝
    }
  }

  g.position.set(-3.5, 0, -5.84); // 贴北墙（背板面 z≈-5.98）
  return g;
}

/**
 * 留声机：墨箱 + 唱盘 + Torus 弯管 + LatheGeometry 花形喇叭。
 * 喇叭母线手工调校：从细颈经腰部弧线外翻到开口缘，18 段低模棱面
 * 在 MeshBasicMaterial 下反而带「版画刀口」感，贴水墨美学。
 * 放在书桌面（y=0.78）上。
 */
function buildGramophone(disposables: Disposable[]): THREE.Group {
  const g = new THREE.Group();
  g.userData.id = 'gramophone';

  const boxMat = inkMat(disposables, 0x1a1713);  // 箱体：最深墨木
  const hornMat = inkMat(disposables, 0x121110); // 喇叭：近黑，棱面由受光面深浅体现
  const hornInner = inkMat(disposables, 0x0d0c0a); // 开口内衬盘：比喇叭壁更沉的近黑——首版 0x2e2a24 在暗环境里读作灰白「瞳孔」，压暗后整个开口融为深洞
  const discMat = inkMat(disposables, 0xc9c5bb); // 唱片：骨白灰——黑胶上唯一的亮
  const brassMat = inkMat(disposables, 0x6f6350); // 弯管：暗金灰（全场景唯一金属暗示）

  // —— 箱体 ——（0.5 × 0.17 × 0.4）
  box(g, disposables, 0.5, 0.17, 0.4, boxMat, 0, 0.085, 0);

  // —— 唱盘 + 唱片 ——（箱顶 y=0.17 起）
  const platter = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.018, 24), boxMat);
  disposables.push(platter.geometry);
  platter.position.set(0, 0.179, 0);
  g.add(platter);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.128, 0.006, 24), discMat);
  disposables.push(disc.geometry);
  disc.position.set(0, 0.19, 0);
  g.add(disc);
  // 唱片心孔小圆盖
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 10), boxMat);
  disposables.push(cap.geometry);
  cap.position.set(0, 0.196, 0);
  g.add(cap);

  // —— 喇叭（Lathe 旋转曲面）——
  // 母线：[半径, 高度] 自细颈向开口；开口缘略外翻。
  const profile: Array<[number, number]> = [
    [0.030, 0.000],
    [0.034, 0.045],
    [0.052, 0.105],
    [0.086, 0.170],
    [0.124, 0.222],
    [0.149, 0.252],
    [0.157, 0.262], // 开口缘
    [0.150, 0.264], // 缘内翻一点，让边缘有厚度
  ];
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const hornGeo = new THREE.LatheGeometry(pts, 18);
  disposables.push(hornGeo);
  const horn = new THREE.Mesh(hornGeo, hornMat);
  horn.material.side = THREE.DoubleSide; // 开口内壁可见
  horn.position.set(0.02, 0.24, 0.06);   // 颈部搭在箱顶右前方
  // 喇叭整体朝房中斜上：先立起再前倾 ~35°，再转向 +Z（观众方向）
  horn.rotation.order = 'YXZ';
  horn.rotation.y = 0.35;             // 略偏右，打破完全对称
  horn.rotation.x = -Math.PI / 2.55;  // 前倾（开口朝 +Z 斜上）
  g.add(horn);

  // 开口内衬盘：喇叭口内一枚略小的圆片，制造「深洞」层次。
  // 轴向教训（2026-09-11）：CircleGeometry 默认法线朝 +Z，而 Lathe 喇叭的轴是 +Y——
  // 首版给圆片套用喇叭同款欧拉角再 translateZ，法线与轴不同轴，圆片被推出喇叭口
  // 悬空成黑色「光环」。正解：先 rotateX 把法线转到 +Y 与轴对齐，再作 horn 子物体
  // 直接沿喇叭局部 +Y 沉入开口，位姿全部继承，不再手工复制欧拉角。
  const innerGeo = new THREE.CircleGeometry(0.118, 18);
  innerGeo.rotateX(-Math.PI / 2); // 法线 +Z → +Y，与喇叭 Lathe 轴同轴
  disposables.push(innerGeo);
  const inner = new THREE.Mesh(innerGeo, hornInner);
  inner.position.y = 0.22; // 喇叭局部高度：开口缘 0.262，沉入 0.042，边缘藏进喇叭壁内
  horn.add(inner);

  // —— 弯管（Torus 半段）：从箱后座起到喇叭颈 ——
  const arm = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.011, 8, 14, Math.PI * 0.6), brassMat);
  disposables.push(arm.geometry);
  arm.position.set(0.02, 0.205, 0.052);
  arm.rotation.set(0, Math.PI / 2, -0.5);
  g.add(arm);
  // 弯管底座
  const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.045, 10), brassMat);
  disposables.push(mount.geometry);
  mount.position.set(0.02, 0.195, 0.052);
  g.add(mount);

  g.position.set(-0.95, 0.78, -5.3); // 桌面顶上
  return g;
}

/**
 * 放映机：三脚架 + 箱体 + 镜头 + 双片盘。
 * 三条腿绕顶台 120° 均布外倾；镜头朝房中（朝 REST 机位方向），
 * P3/P4 推近后由 HTML overlay 承接「幕布亮起」的内容浮现。
 */
function buildProjector(disposables: Disposable[]): THREE.Group {
  const g = new THREE.Group();
  g.userData.id = 'projector';

  const metal = inkMat(disposables, 0x1c1a16);   // 机身墨铁
  const dark = inkMat(disposables, 0x131110);    // 片盘更沉
  const lens = inkMat(disposables, 0x0c0c0c);    // 镜筒
  const lensGlass = inkMat(disposables, 0xb8b4aa); // 镜片：一点冷骨白

  // —— 三脚架 ——：顶台 y=1.22，三腿 120° 均布外倾 ~21°
  const topY = 1.22;
  box(g, disposables, 0.16, 0.03, 0.16, metal, 0, topY + 0.015, 0); // 顶台
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const legLen = 1.28;
    const tilt = 0.37; // 外倾角（弧度 ~21°）
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, legLen, 8), dark);
    disposables.push(leg.geometry);
    leg.position.set(
      Math.cos(ang) * Math.sin(tilt) * legLen * 0.5,
      topY - Math.cos(tilt) * legLen * 0.5,
      Math.sin(ang) * Math.sin(tilt) * legLen * 0.5,
    );
    // 让圆柱倾斜：先绕水平轴倒向方位角方向
    leg.rotation.z = -Math.cos(ang) * tilt;
    leg.rotation.x = Math.sin(ang) * tilt;
    g.add(leg);
  }

  // —— 箱体 ——（0.34 × 0.2 × 0.3，架在顶台上）
  const bodyY = topY + 0.03 + 0.1;
  box(g, disposables, 0.34, 0.2, 0.3, metal, 0, bodyY, 0);

  // —— 双片盘 ——：盘面立起、左右并排（首版轴沿 Y、前后错开，从推近机位
  // 侧看只剩薄边，两盘叠成一根横杆；rotation.x=PI/2 把圆柱轴转向 Z，
  // 圆盘正面朝向房中与 REST 机位，左右错开形成经典双片盘剪影）
  const reelGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.016, 20);
  disposables.push(reelGeo);
  const reelY = bodyY + 0.1 + 0.095;
  const reel1 = new THREE.Mesh(reelGeo, dark);
  reel1.rotation.x = Math.PI / 2;
  reel1.position.set(-0.1, reelY, -0.01); // 两盘心距 0.2 > 直径 0.19，留一线缝
  g.add(reel1);
  const reel2 = new THREE.Mesh(reelGeo, dark);
  reel2.rotation.x = Math.PI / 2;
  reel2.position.set(0.1, reelY, 0.01);
  g.add(reel2);
  // 片盘轴心：盘心小圆台（随盘面一起立起）
  const hubGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.024, 8);
  disposables.push(hubGeo);
  for (const rz of [reel1, reel2]) {
    const hub = new THREE.Mesh(hubGeo, metal);
    hub.rotation.x = Math.PI / 2;
    hub.position.copy(rz.position);
    g.add(hub);
  }

  // —— 镜头 ——：箱体前面（朝 +Z）突出镜筒 + 镜片
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.09, 14), lens);
  disposables.push(barrel.geometry);
  barrel.rotation.x = Math.PI / 2; // 圆柱轴转向 Z
  barrel.position.set(0, bodyY, 0.15 + 0.045);
  g.add(barrel);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.043, 14), lensGlass);
  disposables.push(glass.geometry);
  glass.position.set(0, bodyY, 0.15 + 0.091);
  g.add(glass);

  // 整组朝向：镜头对准房中偏左（朝 REST 机位方向），机身略斜
  g.position.set(3.1, 0, -4.65);
  g.rotation.y = -0.5;
  return g;
}

/* ============================================================
 * 装配入口
 * ============================================================ */

/**
 * 构建全部物件并返回一个 Group（挂到 scene 即可）。
 * 所有几何 / 材质 / 纹理统一登记进 disposables，
 * 由 garden-room.ts 的 teardown 统一 dispose。
 */
export function buildProps(disposables: Disposable[], maxAniso: number): THREE.Group {
  const props = new THREE.Group();
  props.name = 'garden-props';
  props.add(buildShelf(disposables));
  props.add(buildNotesWall(disposables, maxAniso));
  props.add(buildDesk(disposables));
  props.add(buildGramophone(disposables));
  props.add(buildProjector(disposables));
  return props;
}
