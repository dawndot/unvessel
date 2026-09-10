/* ============================================================
   ink.js — 流体墨背景（Astro 适配版）
   ============================================================
   原生 WebGL1 片元着色器实现，零依赖。为什么不用 Three.js：
   一个全屏三角形 + 一段 fbm 噪声就够了，library 反而拖慢首屏。

   视觉原理（一句话）：
   用「三层域扭曲 fbm」把噪声拉成墨丝，靠近指针处把坐标
   旋转搅动——墨被搅开时，朱砂从渊底泛上来。

   Astro 适配说明：
   站点启用 <ClientRouter /> 视图过渡，#ink-canvas 加了
   transition:persist——跨页时画布是同一个元素，GL 上下文
   连续不断帧。因此 startInk() 做了幂等守卫：同一画布已在
   跑就跳过；画布被整体替换（理论情形）则停旧实例再启新。

   工程细节：
   - DPR 钳制 1.5：全屏 fragment shader 是逐像素开销，颗粒噪点
     会掩盖 1.5x 与 2x 的差别，换取稳定帧率；
   - 页签隐藏（visibilitychange）暂停 RAF；
   - prefers-reduced-motion：只渲染一帧静帧，不监听指针；
   - WebGL 不可用：移除画布，页面退化为纯色渊底（仍然成立）；
   - 上下文丢失/恢复：停帧 → 重建 → 续播。
   ============================================================ */

/** 全局句柄：记录当前活实例与其画布，用于幂等与旧实例清理 */
let live = null;

/** 启动流体墨（幂等：astro:page-load 每次导航都会调用） */
export function startInk() {
  const canvas = document.getElementById('ink-canvas');
  // 无画布（未来某页去掉背景）或同一画布已在跑 → 什么都不做
  if (!canvas || (live && live.canvas === canvas)) return;

  // 画布被替换了：先停掉旧实例的 RAF 与监听
  if (live) {
    live.destroy();
    live = null;
  }

  const gl =
    canvas.getContext('webgl', {
      alpha: false,          // 不需要透明合成，直接不透明输出
      antialias: false,      // 全屏三角形无需 MSAA
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    }) || canvas.getContext('experimental-webgl');
  if (!gl) {
    canvas.parentNode.removeChild(canvas); // 降级：纯色渊底
    return;
  }

  /* ---------- 着色器源码 ---------- */

  // 顶点着色器：一个覆盖全屏的大三角形（比两个三角形少一条对角线接缝）
  const VERT_SRC = [
    'attribute vec2 a_pos;',
    'void main() {',
    '  gl_Position = vec4(a_pos, 0.0, 1.0);',
    '}',
  ].join('\n');

  // 片元着色器：流体墨的全部视觉都在这里
  const FRAG_SRC = [
    'precision highp float;',
    'uniform vec2  u_res;    // 画布像素尺寸',
    'uniform float u_time;   // 累计时间（秒），切换页签不跳变',
    'uniform vec2  u_mouse;  // 平滑后的指针位置（0..1，y 已翻转为 GL 坐标）',

    // —— 基础工具：哈希 → 值噪声 → fbm ——
    'float hash(vec2 p) {',
    '  p = fract(p * vec2(123.34, 456.21));',
    '  p += dot(p, p + 45.32);',
    '  return fract(p.x * p.y);',
    '}',
    'float vnoise(vec2 p) {',
    '  vec2 i = floor(p);',
    '  vec2 f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);', // 平滑插值曲线
    '  float a = hash(i);',
    '  float b = hash(i + vec2(1.0, 0.0));',
    '  float c = hash(i + vec2(0.0, 1.0));',
    '  float d = hash(i + vec2(1.0, 1.0));',
    '  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);',
    '}',
    // 每层采样前旋转 + 错切：消除值噪声的网格轴对齐伪影
    'mat2 rot(float a) {',
    '  float c = cos(a);',
    '  float s = sin(a);',
    '  return mat2(c, -s, s, c);',
    '}',
    'float fbm(vec2 p) {',
    '  float v = 0.0;',
    '  float amp = 0.5;',
    '  for (int i = 0; i < 5; i++) {',
    '    v += amp * vnoise(p);',
    '    p = rot(0.62) * p * 2.02 + vec2(3.1, 7.7);',
    '    amp *= 0.5;',
    '  }',
    '  return v;',
    '}',

    'void main() {',
    // 以短边为基准归一化坐标，画面中心为原点（任何宽高比下墨形不拉伸）
    '  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);',
    '  float t = u_time * 0.055;', // 极慢的时间流速：墨是沉的，不是沸水

    // —— 指针涡流：距指针越近，坐标被旋转/外推得越狠 ——
    '  vec2 m = (u_mouse * u_res - 0.5 * u_res) / min(u_res.x, u_res.y);',
    '  vec2 d = uv - m;',
    '  float md = length(d);',
    '  float fall = exp(-md * 2.6);', // 高斯式影响衰减
    '  vec2 p = rot(fall * 1.6 + 0.15 * sin(t * 2.0)) * d + m;',
    '  p += normalize(d + 1e-3) * fall * 0.18;',

    // —— 三层域扭曲 fbm：q 扭 r，r 扭 f，层层相扣拉出墨的筋络 ——
    '  float q = fbm(p * 1.3 + vec2(t * 0.8, -t * 0.6));',
    '  float r = fbm(p * 1.3 + 3.2 * q + vec2(-t * 0.5, t * 0.7) + 11.3);',
    '  float f = fbm(p * 2.1 + 2.6 * r + vec2(t * 0.35, t * 0.2));',

    // —— 上色：渊底 → 淡烟 → 丝缕高光 → 朱砂 → 暗角 ——
    '  vec3 col = vec3(0.016, 0.016, 0.018);',          // 渊底（比纯黑亮一丝）
    '  float smoke = smoothstep(0.42, 0.92, f);',
    '  col += vec3(0.62, 0.60, 0.56) * smoke * smoke * 0.10;', // 大片淡烟（平方压暗）
    '  float fil = 1.0 - smoothstep(0.0, 0.06, abs(f - 0.52));',
    '  col += vec3(0.85, 0.83, 0.78) * fil * 0.14;',    // 细亮丝缕：墨的「毫」

    // 朱砂：另一层低频噪声决定「哪里泛朱砂」；
    // 指针附近概率放大（fall 加权）——墨被搅动时朱砂才浮上来
    '  float veil = fbm(p * 0.8 - vec2(t * 0.5, t * 0.3) + 31.7);',
    '  float cinnabar = smoothstep(0.58, 0.86, veil) * (0.25 + 0.75 * fall);',
    '  col += vec3(1.0, 0.23, 0.18) * cinnabar * 0.32;',

    // 暗角：四周压进渊底，视线聚焦中心，巨字更立体
    '  col *= 1.0 - dot(uv, uv) * 0.35;',

    '  gl_FragColor = vec4(col, 1.0);',
    '}',
  ].join('\n');

  /* ---------- 编译/链接工具 ---------- */
  function makeShader(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    // 编译失败：控制台留证 + 整体降级（不允许黑屏无解释）
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('[ink] shader 编译失败：', gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }

  /* ---------- 程序装配 ---------- */
  let prog = null;
  const uni = {};

  function build() {
    const vs = makeShader(gl.VERTEX_SHADER, VERT_SRC);
    const fs = makeShader(gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) return false;

    prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[ink] 程序链接失败：', gl.getProgramInfoLog(prog));
      return false;
    }
    gl.useProgram(prog);

    // 全屏大三角形：(-1,-1) → (3,-1) → (-1,3)，覆盖整个裁剪空间
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    uni.res = gl.getUniformLocation(prog, 'u_res');
    uni.time = gl.getUniformLocation(prog, 'u_time');
    uni.mouse = gl.getUniformLocation(prog, 'u_mouse');
    return true;
  }

  /* ---------- 尺寸 ---------- */
  // DPR 钳制 1.5：性能与锐度的折中（噪点覆层会掩盖细微差别）
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  /* ---------- 指针 ---------- */
  // 目标值（跟随指针）与当前值（每帧插值逼近）分离 → 墨的反应带「迟滞感」
  const mouse = { x: 0.62, y: 0.42 };          // 默认偏置点：避免开局涡流正对中心
  const target = { x: 0.62, y: 0.42 };

  function onPointerMove(e) {
    // CSS 的 y 向下，GL 的 y 向上：翻转
    target.x = e.clientX / window.innerWidth;
    target.y = 1 - e.clientY / window.innerHeight;
  }

  /* ---------- 主循环 ---------- */
  let running = false;
  let rafId = 0;
  let last = 0;
  let elapsed = 0;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function frame(now) {
    if (!running) return;
    // dt 钳制：页签切回来时不允许时间大跳（墨形会瞬移）
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    elapsed += dt;

    // 指针迟滞：每帧向目标靠拢 4%
    mouse.x += (target.x - mouse.x) * 0.04;
    mouse.y += (target.y - mouse.y) * 0.04;

    resize();
    gl.uniform2f(uni.res, canvas.width, canvas.height);
    gl.uniform1f(uni.time, elapsed);
    gl.uniform2f(uni.mouse, mouse.x, mouse.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduced) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  /* ---------- 启动 / 失败降级 ---------- */
  if (!build()) {
    canvas.parentNode.removeChild(canvas);
    return;
  }

  /** 停帧并解绑监听（供新实例替换旧画布时清理） */
  function destroy() {
    stop();
    window.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('visibilitychange', onVisChange);
  }
  function onVisChange() {
    document.hidden ? stop() : start();
  }

  if (reduced) {
    // 减少动效偏好：只画一帧静帧（t 固定，涡流在默认偏置点）
    resize();
    gl.uniform2f(uni.res, canvas.width, canvas.height);
    gl.uniform1f(uni.time, 3.7); // 挑一个墨形好看的瞬间定格
    gl.uniform2f(uni.mouse, mouse.x, mouse.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  } else {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('visibilitychange', onVisChange);
    start();
  }

  // 上下文丢失/恢复（GPU 重置、驱动切换等）：停帧 → 重建 → 续播
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    stop();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    if (build()) start();
  });

  live = { canvas, destroy };
}
