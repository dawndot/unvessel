/* ============================================================
   ink.js — 流体墨背景（Astro 适配版）
   ============================================================
   原生 WebGL1 片元着色器实现，零依赖。为什么不用 Three.js：
   一个全屏三角形 + 一段 fbm 噪声就够了，library 反而拖慢首屏。

   视觉原理（一句话）：
   用「三层域扭曲 fbm」把噪声拉成墨丝，靠近指针处把坐标
   旋转搅动——墨被搅开时，朱砂从渊底泛上来。

   双主题（2026-09-11 明暗改造）：
   uniform u_light（0=渊墨暗色 / 1=宣纸亮色）驱动整段上色：
   - 底色 mix 渊黑 ↔ 宣纸米白，朱砂 ↔ 印泥深朱；
   - 所有「叠加」统一改写为 mix(col, target, k)：暗底下 col≈0，
     lerp 与旧版加法数值几乎一致（视觉不变）；亮底下自动变成
     「向墨色靠拢」——一套着色逻辑，两个主题同时物理正确。
   JS 侧监听 unv:theme（main.js 点切换时派发）与 astro:after-swap
   （ClientRouter 换页会丢 html 属性，main.js 兜底重设），
   两处都只需重发一次 uniform；reduced 静帧模式下还要重画一帧。

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
    'uniform float u_light;  // 主题：0=渊墨（暗） 1=宣纸（亮），由 JS 随 data-theme 更新',

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

    // —— 上色（双主题）：u_light 0=渊墨 1=宣纸 ——
    // 叠加一律 mix(col, target, k)：暗底下 col≈0，lerp 与旧版加法几乎
    // 等值（视觉零回归）；亮底下自动变为「向墨色靠拢」——一套逻辑两读。
    // 底色：渊黑 #040404ish ↔ 宣纸 #f4f1e8（与 global.css 令牌同源）
    '  vec3 col = mix(vec3(0.016, 0.016, 0.018), vec3(0.957, 0.945, 0.910), u_light);',
    '  float smoke = smoothstep(0.42, 0.92, f);',
    // 大片淡烟：暗=亮烟浮起 / 亮=淡墨晕开
    '  vec3 smokeCol = mix(vec3(0.62, 0.60, 0.56), vec3(0.16, 0.15, 0.13), u_light);',
    '  col = mix(col, smokeCol, smoke * smoke * 0.10);',
    // 细亮丝缕：暗=墨的「毫」（亮丝）/ 亮=纸上的浓墨毫
    '  float fil = 1.0 - smoothstep(0.0, 0.06, abs(f - 0.52));',
    '  vec3 filCol = mix(vec3(0.85, 0.83, 0.78), vec3(0.30, 0.28, 0.25), u_light);',
    '  col = mix(col, filCol, fil * 0.14);',

    // 朱砂：另一层低频噪声决定「哪里泛朱砂」；
    // 指针附近概率放大（fall 加权）——墨被搅动时朱砂才浮上来。
    // 暗色朱砂 #ff3b2f ↔ 亮色印泥深朱 #d43518（与 global.css --accent 同步）
    '  float veil = fbm(p * 0.8 - vec2(t * 0.5, t * 0.3) + 31.7);',
    '  float cinnabar = smoothstep(0.58, 0.86, veil) * (0.25 + 0.75 * fall);',
    '  vec3 cinnabarCol = mix(vec3(1.0, 0.23, 0.18), vec3(0.83, 0.21, 0.09), u_light);',
    '  col = mix(col, cinnabarCol, cinnabar * 0.32);',

    // 暗角：暗色=四周压进渊底聚焦视线；亮色=纸缘光影微沉。同一公式两读
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
    uni.light = gl.getUniformLocation(prog, 'u_light'); // 双主题开关（0 暗 / 1 亮）
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

  /** 画一帧定格静帧（reduced 模式专用）：t 固定，涡流停在默认偏置点 */
  function drawStill() {
    resize();
    gl.uniform2f(uni.res, canvas.width, canvas.height);
    gl.uniform1f(uni.time, 3.7); // 挑一个墨形好看的瞬间定格
    gl.uniform2f(uni.mouse, mouse.x, mouse.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * 主题同步：读 html[data-theme] → 重发 u_light uniform。
   * data-theme 由 Base.astro 内联脚本在首帧前定好（记忆 > 系统偏好 >
   * 暗色）；此后 main.js 点切换派发 unv:theme，ClientRouter 换页兜底
   * 触发 astro:after-swap——两个事件都会流到这里。动画模式下 uniform
   * 一改，下一帧 RAF 自动用新值；reduced 静帧模式没有 RAF，必须手动
   * 重画一帧才看得到变化。
   */
  function syncTheme() {
    gl.uniform1f(uni.light, document.documentElement.dataset.theme === 'light' ? 1 : 0);
    if (reduced) drawStill();
  }

  /** 停帧并解绑监听（供新实例替换旧画布时清理） */
  function destroy() {
    stop();
    window.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('visibilitychange', onVisChange);
    document.removeEventListener('unv:theme', syncTheme);
    document.removeEventListener('astro:after-swap', syncTheme);
  }
  function onVisChange() {
    document.hidden ? stop() : start();
  }

  // 主题事件跟随（reduced / 动画两种模式都要挂）：
  // - unv:theme：main.js 点切换按钮后派发到 document；
  // - astro:after-swap：ClientRouter 换页会重写 html 属性，main.js 从
  //   localStorage 兜底重设 data-theme 后，这里再读一次让画布跟上颜色。
  //   （main.js 的监听先于本文件注册，读到的必是已修正的值。）
  document.addEventListener('unv:theme', syncTheme);
  document.addEventListener('astro:after-swap', syncTheme);

  if (!reduced) {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('visibilitychange', onVisChange);
    start();
  }

  // 首次主题同步：u_light 的 GL 默认值是 0（暗色），亮色用户若不同步
  // 会先看到暗底闪一帧。动画模式下这行赶在第一帧 RAF 之前执行；
  // reduced 模式下它顺带画出定格静帧。
  syncTheme();

  // 上下文丢失/恢复（GPU 重置、驱动切换等）：停帧 → 重建 → 续播
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    stop();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    // 上下文重建后所有 uniform/缓冲全部失效：build() 重装程序，
    // syncTheme() 重发主题（reduced 下顺带重画静帧），start() 续播
    //（reduced 下 start 自身 no-op，静帧已由 syncTheme 画好）。
    if (build()) {
      syncTheme();
      start();
    }
  });

  live = { canvas, destroy };
}
