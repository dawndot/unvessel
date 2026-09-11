/* ============================================================
   main.js — 页面交互层（Astro 适配版）
   ============================================================
   六件事，都不依赖任何库：
   1. 字体就绪后才触发 Hero 入场（避免字体交换时的跳动/FOUT）；
   2. IntersectionObserver 滚动显现（Hero 之外的 [data-rv]）；
   3. 自定义光标（仅精确指针设备：朱砂点 + 滞后圆环）；
   4. Hero 巨字鼠标视差（幅度克制在 14px 内，是「衬」不是「炫」）；
   5. 站内搜索浮层（Pagefind 索引，Ctrl/⌘+K 唤起）；
   6. 明暗主题切换（翻转 html[data-theme] + 记忆 + unv:theme 事件广播）。

   Astro 适配说明：
   站点启用 <ClientRouter />，Base.astro 在 astro:page-load 时调用
   initPage()。因此本模块必须可重复执行且幂等：
   - 显现：每次都为新页面的 [data-rv] 重新建 IO（旧元素已随页换掉）；
   - 光标：.cursor 元素在布局中 transition:persist，只初始化一次；
   - 视差：Hero 只在首页存在，按元素记忆去重绑定；
   - 搜索 / 主题：全局监听只绑一次（事件委托，元素在回调里实时查询），
     Pagefind 实例跨页复用。

   运行时多语言说明（2026-09-11 双语改造）：
   JS 动态生成的文案（搜索状态行、复制按钮、锚点 aria、主题 aria）
   不走构建期字典（src/i18n/ui.ts），而是自带 RT 双语表，按
   <html data-lang> 现取——原因：main.js 是纯浏览器脚本，构建期
   拿不到 Astro 的 lang prop；data-lang 由 Base.astro SSR 写死，
   一页之内不会变，故无需响应语言切换事件。
   ============================================================ */

import { navigate } from 'astro:transitions/client';

/* ---------- 模块级状态（跨页面持久） ---------- */
let cursorInit = false;        // 光标是否已初始化
let cursor = { dot: null, ring: null }; // 光标元素引用（persist 元素，跨页有效）
let parallaxHero = null;       // 已绑定视差的 hero 元素（去重）
let pagefind = null;           // Pagefind 实例（首次唤起时懒加载，跨页复用）
let pagefindLoading = false;   // Pagefind 是否正在加载（防并发重复 import）
let searchSeq = 0;             // 搜索请求代际号：丢弃过期请求返回的旧结果
let searchActive = -1;         // 当前选中的结果下标（-1 = 未选中）
let searchInit = false;        // 搜索全局监听是否已绑定（幂等标记）
let themeInit = false;         // 主题全局监听是否已绑定（幂等标记）

/* ---------- 运行时文案表 ----------
   与 src/i18n/ui.ts 的 key 无关（那是构建期模板用的），此处只收
   「JS 在浏览器里现造的字符串」。当前语言 = <html data-lang>。
   注意：键改动时需同步 SearchModal.astro 的静态初始态与
   ui.ts 对应条目，三处语义必须一致（维护规范见 docs/AI-OPS.md）。 */
const RT = {
  zh: {
    searchHint: '输入关键词，检索全部文章',
    searchUnavailable: '索引不可用 — 请先 npm run build 并 preview',
    searchEmpty: '渊中无此物 — 换个关键词试试',
    copy: '复制',
    copied: '已复制',
    copyFail: '复制失败',
    anchorAria: '链接到「{t}」一节',
    themeToLight: '切换到亮色',
    themeToDark: '切换到暗色',
  },
  en: {
    searchHint: 'Type to search all posts',
    searchUnavailable: 'Index unavailable — run "npm run build" and preview first',
    searchEmpty: 'Nothing in the abyss — try another keyword',
    copy: 'Copy',
    copied: 'Copied',
    copyFail: 'Copy failed',
    anchorAria: 'Link to section "{t}"',
    themeToLight: 'Switch to light',
    themeToDark: 'Switch to dark',
  },
};
/** 运行时文案：按当前页 <html data-lang> 取列（未知值兜底中文主站） */
function rt() {
  return document.documentElement.dataset.lang === 'en' ? RT.en : RT.zh;
}

/* ---------- 1. 字体就绪 → Hero 入场 ----------
   CSS 里 Hero 的 [data-rv] 等待 body.is-live；
   document.fonts.ready 有极小概率挂着不来，用 900ms 兜底赛跑。
   每页调用都安全：class 重复添加无副作用，字体已就绪则立即 resolve。 */
function kickWhenReady(reduced) {
  if (reduced || document.body.classList.contains('is-live')) return;
  const kick = () => document.body.classList.add('is-live');
  Promise.race([
    document.fonts ? document.fonts.ready : Promise.resolve(),
    new Promise((r) => setTimeout(r, 900)),
  ]).then(kick);
}

/* ---------- 2. 滚动显现 ----------
   只观察 Hero 之外的 [data-rv]（Hero 的由 is-live 统一编排）。
   每次导航都重建：新页面的 DOM 元素是新的。 */
function initReveal(reduced) {
  const toReveal = Array.prototype.filter.call(
    document.querySelectorAll('[data-rv]'),
    (el) => !el.closest('.hero')
  );
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target); // 只播一次，滚回去不重播
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
    );
    toReveal.forEach((el) => io.observe(el));
  } else {
    // 无 IO / 减少动效：直接全部可见
    toReveal.forEach((el) => el.classList.add('is-in'));
  }
}

/* ---------- 3. 自定义光标 ----------
   仅 pointer:fine（鼠标/触控板）启用；触屏保持系统行为。
   结构：dot 贴手（插值 0.55）+ ring 滞后（插值 0.16）→ 有「拖拽感」。
   悬停可点元素：html.cursor-hover 让 ring 放大咬合（样式在 CSS）。
   整站只初始化一次：.cursor 元素 transition:persist，跨页同一元素。 */
function initCursor(reduced) {
  if (cursorInit || reduced) return;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  if (!finePointer) return;
  if (!document.querySelector('.cursor')) return; // 布局里没有光标元素

  cursorInit = true;
  document.documentElement.classList.add('has-cursor');
  cursor.dot = document.querySelector('.cursor__dot');
  cursor.ring = document.querySelector('.cursor__ring');

  let px = innerWidth / 2, py = innerHeight / 2; // ring 当前位置
  let tx = px, ty = py;                          // 指针目标
  let dx = px, dy = py;                          // dot 当前位置

  window.addEventListener('pointermove', (e) => {
    tx = e.clientX;
    ty = e.clientY;
  }, { passive: true });

  // pointerover 捕获阶段统一处理悬停态，不逐个绑事件
  window.addEventListener('pointerover', (e) => {
    const hit = e.target.closest && e.target.closest('a, button, .row');
    document.documentElement.classList.toggle('cursor-hover', !!hit);
  }, { passive: true });

  (function loop() {
    dx += (tx - dx) * 0.55;
    dy += (ty - dy) * 0.55;
    px += (tx - px) * 0.16;
    py += (ty - py) * 0.16;
    if (cursor.dot && cursor.ring) {
      cursor.dot.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0)';
      cursor.ring.style.transform = 'translate3d(' + px + 'px,' + py + 'px,0)';
    }
    requestAnimationFrame(loop);
  })();
}

/* ---------- 4. Hero 巨字视差 ----------
   指针在视口内的归一化偏移 → 巨字平移 ±14px（slogan 不参与，
   避免与入场动画的 transform 打架）。按 hero 元素记忆去重：
   首页反复导航回来也不重复绑定。 */
function initParallax(reduced) {
  if (reduced) return;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  if (!finePointer) return;

  const hero = document.querySelector('.hero');
  const title = document.querySelector('.hero__title');
  if (!hero || !title || hero === parallaxHero) return;
  parallaxHero = hero;

  let nx = 0, ny = 0, cx = 0, cy = 0;
  hero.addEventListener('pointermove', (e) => {
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

/* ---------- 5. 站内搜索（Pagefind） ----------
   索引来源：npm run build 末尾的 `pagefind --site dist`，产物在 /pagefind/。
   交互设计：
   - 唤起：Ctrl/⌘+K、「/」（非输入态）、顶栏「检索」按钮；
   - 关闭：ESC、点击遮罩/ESC 按钮；
   - 结果：↑↓ 移动选中，↵ 或点击经 navigate() 跳转（SPA 过渡，墨画布不断帧）；
   - 降级：dev 环境没有 /pagefind/（索引只在 build 后存在），
     动态 import 失败时静默置空，输入后显示「索引不可用」提示。
   幂等策略：所有 document 级监听只绑一次（searchInit 标记），
   元素一律在回调里实时查询（ClientRouter 换页后 modal 是新节点）。 */

/** 懒加载 Pagefind：只在首次唤起浮层时执行一次 */
async function ensurePagefind() {
  if (pagefind || pagefindLoading) return;
  pagefindLoading = true;
  try {
    // /pagefind/pagefind.js 是构建期才存在的产物，源码期必然解析不到。
    // 陷阱：字符串字面量的动态 import 即使带 @vite-ignore，Rollup 仍会静态解析并报错；
    // 必须改用变量承载路径，让 Rollup 无法在构建期静态分析目标模块。
    const pfPath = '/pagefind/pagefind.js';
    pagefind = await import(/* @vite-ignore */ pfPath);
  } catch {
    pagefind = null; // dev 模式或索引缺失：保持 null，UI 侧给出降级提示
  }
  pagefindLoading = false;
}

/** 搜索浮层是否处于打开态 */
function searchIsOpen() {
  const el = document.getElementById('search');
  return !!el && !el.hidden;
}

/** 打开浮层：解锁后聚焦输入框，并顺带预热 Pagefind */
function openSearch() {
  const el = document.getElementById('search');
  if (!el || !el.hidden) return;
  el.hidden = false;
  searchActive = -1;
  // 下一帧再加 is-open：让 opacity/translate 过渡生效
  requestAnimationFrame(() => el.classList.add('is-open'));
  document.body.style.overflow = 'hidden'; // 浮层打开期间锁正文滚动
  el.querySelector('.search__input')?.focus();
  ensurePagefind();
}

/** 关闭浮层：等退场动画播完再真正 hidden */
function closeSearch() {
  const el = document.getElementById('search');
  if (!el || el.hidden) return;
  el.classList.remove('is-open');
  document.body.style.overflow = '';
  setTimeout(() => { el.hidden = true; }, 150);
}

/** 渲染结果列表的公共状态行（空态 / 降级提示） */
function renderSearchNote(list, text) {
  list.innerHTML = '';
  const li = document.createElement('li');
  li.className = 'search__empty';
  li.textContent = text;
  list.appendChild(li);
}

/** 执行检索并渲染结果（带代际号防抖：过期请求的结果直接丢弃） */
async function runSearch(query) {
  const list = document.getElementById('search-results');
  if (!list) return;
  const seq = ++searchSeq;

  if (!query.trim()) {
    renderSearchNote(list, rt().searchHint);
    return;
  }
  if (!pagefind) {
    // ensurePagefind 失败后的输入会走到这里：dev 环境的预期表现
    renderSearchNote(list, rt().searchUnavailable);
    return;
  }

  const res = await pagefind.search(query);
  // 异步期间可能有更新的输入：过期结果丢弃
  if (seq !== searchSeq) return;

  if (!res.results.length) {
    renderSearchNote(list, rt().searchEmpty);
    return;
  }

  // 只展开前 8 条的详情（data() 会取回摘要与元信息）
  const top = res.results.slice(0, 8);
  const items = await Promise.all(top.map((r) => r.data()));
  if (seq !== searchSeq) return;

  list.innerHTML = '';
  searchActive = -1;
  items.forEach((item, i) => {
    const li = document.createElement('li');
    li.className = 'search__result';
    li.dataset.index = String(i);
    // excerpt 由 Pagefind 生成（来自我们自己索引的内容），内含 <mark> 高亮
    li.innerHTML =
      '<a href="' + item.url + '">' +
        '<span class="search__result-title">' + (item.meta?.title || item.url) + '</span>' +
        '<span class="search__result-meta">' + (item.meta?.date || '') + '</span>' +
        '<span class="search__result-excerpt">' + item.excerpt + '</span>' +
      '</a>';
    list.appendChild(li);
  });
}

/** 高亮选中项：滚动到可视区，供 ↑↓ 与 Enter 使用 */
function setActiveResult(list, index) {
  const items = list.querySelectorAll('.search__result');
  if (!items.length) return;
  searchActive = (index + items.length) % items.length; // 循环滚动
  items.forEach((el, i) => el.classList.toggle('is-active', i === searchActive));
  items[searchActive].scrollIntoView({ block: 'nearest' });
}

function initSearch() {
  if (searchInit) return;
  searchInit = true;

  /* 键盘：全局快捷键与浮层内导航 */
  document.addEventListener('keydown', (e) => {
    const open = searchIsOpen();
    // 唤起：Ctrl/⌘+K 任何时候可用；「/」仅在非输入态可用
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      open ? closeSearch() : openSearch();
      return;
    }
    if (!open && e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const tag = document.activeElement?.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        openSearch();
      }
      return;
    }
    if (!open) return;
    // 浮层内的按键
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearch();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const list = document.getElementById('search-results');
      if (list) {
        e.preventDefault();
        setActiveResult(list, searchActive + (e.key === 'ArrowDown' ? 1 : -1));
      }
    } else if (e.key === 'Enter') {
      const list = document.getElementById('search-results');
      const target = list?.querySelectorAll('.search__result')[Math.max(searchActive, 0)]?.querySelector('a');
      if (target) {
        e.preventDefault();
        closeSearch();
        navigate(target.getAttribute('href')); // SPA 过渡：墨画布不断帧
      }
    }
  });

  /* 点击（委托）：唤起按钮 / 关闭区 / 结果行 */
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-search-open]')) { openSearch(); return; }
    if (e.target.closest('[data-search-close]')) { closeSearch(); return; }
    const row = e.target.closest('.search__result a');
    if (row) { closeSearch(); } // 让浏览器按 href 走，ClientRouter 接管为 SPA 过渡
  });

  /* 输入（委托）：轻防抖后检索 */
  let debounce = 0;
  document.addEventListener('input', (e) => {
    if (!e.target.classList?.contains('search__input')) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => runSearch(e.target.value), 80);
  });
}

/* ---------- 6. 文章页工具（仅文章详情页生效，其他页面自动空跑） ----------
   四件事，全部靠「页面里有没有对应元素」守卫：
   ① 阅读进度条：顶栏下沿 2px 朱砂线，scaleX 随滚动推进；
   ② 目录滚动高亮：正文 h2/h3 进入视口上 1/3 时点亮目录对应项；
   ③ 代码块复制按钮：JS 把每个 pre 包进 .codeblock 并挂按钮（渐进增强）；
   ④ 标题锚点：给每个 h2/h3 追加「#」深链，悬停浮现，可复制分享。

   幂等策略：scroll/resize 监听挂 window，用 AbortController 做代际——
   每次进文章页先 abort 上一代的监听（旧页面元素已随视图过渡销毁），
   再为新 DOM 重挂；IO 与其余绑定只作用于本次新元素，无需去重。 */
let postToolsAbort = new AbortController();

function initPostTools() {
  // 代际推进：上一页文章的 window 监听全部作废
  postToolsAbort.abort();
  postToolsAbort = new AbortController();
  const signal = postToolsAbort.signal;

  const bar = document.querySelector('.read-progress i');
  const prose = document.querySelector('.prose');
  if (!bar && !prose) return; // 非文章页：整个模块空跑

  const heads = prose ? Array.from(prose.querySelectorAll('h2[id], h3[id]')) : [];
  const tocLinks = Array.from(document.querySelectorAll('.post-toc a, .post-toc-m a'));

  /* ① 进度条 + ② 目录高亮：同一个 rAF 节流的滚动处理器 */
  if (bar || (heads.length && tocLinks.length)) {
    let ticking = false;
    const update = () => {
      ticking = false;
      // 进度：已滚距离 / 可滚总距离 → scaleX 0..1（transform 不触发重排）
      if (bar) {
        const max = document.documentElement.scrollHeight - innerHeight;
        const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
        bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
      }
      // 高亮：取「顶线在视口 1/3 上方」的最后一个标题为当前节；
      // 滚到页尾时强制点亮最后一项（尾节往往撑不满 1/3 视口）
      if (heads.length && tocLinks.length) {
        let current = -1;
        const line = innerHeight * 0.33;
        for (let i = 0; i < heads.length; i++) {
          if (heads[i].getBoundingClientRect().top <= line) current = i;
        }
        if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) {
          current = heads.length - 1;
        }
        tocLinks.forEach((a) => {
          a.classList.toggle(
            'is-active',
            a.getAttribute('href') === '#' + heads[current]?.id
          );
        });
      }
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true, signal });
    window.addEventListener('resize', onScroll, { passive: true, signal });
    update(); // 首帧立即校准（含刷新后恢复滚动位的场景）
  }

  /* ③ 代码块复制按钮：把 pre 包进 .codeblock 定位容器，按钮挂在右上角；
     按钮文案走运行时表（rt()），语言随 <html data-lang> */
  prose && prose.querySelectorAll('pre').forEach((pre) => {
    if (pre.closest('.codeblock')) return; // 重复导航防御（DOM 每页全新，理论上不会中）
    const wrap = document.createElement('div');
    wrap.className = 'codeblock';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-copy';
    btn.textContent = rt().copy;
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.innerText);
        btn.textContent = rt().copied;
      } catch {
        btn.textContent = rt().copyFail; // 剪贴板权限拒绝 / 非安全上下文
      }
      setTimeout(() => { btn.textContent = rt().copy; }, 1600);
    });
    pre.replaceWith(wrap);
    wrap.appendChild(pre);
    wrap.appendChild(btn);
  });

  /* ④ 标题锚点：h2/h3 尾部追加「#」深链（slug 已由 markdown 渲染器生成）；
     悬停浮现（样式在 CSS），点击后 URL 带锚点，可直接分享定位 */
  heads.forEach((h) => {
    if (h.querySelector('.h-anchor')) return;
    const a = document.createElement('a');
    a.className = 'h-anchor';
    a.href = '#' + h.id;
    a.textContent = '#';
    a.setAttribute('aria-label', rt().anchorAria.replace('{t}', h.textContent));
    h.appendChild(a);
  });
}

/* ---------- 6. 明暗主题切换（2026-09-11 双语改造新增） ----------
   职责边界：Base.astro 的 is:inline 脚本已在首帧前定好 data-theme，
   这里不做初始判定，只做三件事：
   a. 点击 [data-theme-toggle]：翻转 data-theme + 写 localStorage('unv-theme')
      + 派发 unv:theme 事件——Comments.astro 监听它，把主题 postMessage
      给 giscus iframe（评论配色跟随站点）。事件契约：detail.theme = 'light'|'dark'。
   b. astro:after-swap：ClientRouter 换页会用新文档的 <html> 属性覆盖旧值
      （SSR 的 html 标签不带 data-theme），主题会「跳回默认」——换页完成后
      从 localStorage 重读一次（口径与 Base.astro 内联脚本一致：
      记忆 > 系统偏好 > 暗色），保证跨页主题连续。
   c. syncThemeAria：按钮 aria-label 由 SSR 固定渲染「切到亮色」语境，
      实际主题相反时要校正；换页后按钮是新节点，每次都要重校。
   委托绑定只做一次（themeInit 标记），元素一律回调内实时查询。 */

/* ---------- 主题口径解析 ----------
   与 Base.astro <head> 内联防闪脚本完全一致：localStorage 记忆 >
   系统偏好 > 暗色（站点品牌基调）。内联脚本因必须在首帧前同步执行，
   无法复用本函数而必然重复一份口径——两处改动必须同步。
   使用场景：视图过渡换页后重定主题（见 initTheme 的 b 段）。 */
function resolveTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem('unv-theme');
  } catch (e) {
    /* 隐私模式等读不到就算了，走系统偏好 */
  }
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

/** 应用主题：改 data-theme（CSS 换血）+ 记忆 + 广播（giscus 跟随） */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('unv-theme', theme);
  } catch (e) {
    /* 隐私模式存不进去就算了：本次会话内主题仍然生效 */
  }
  // 派发到 document（全站组件契约：Comments.astro / ink.js 统一在
  // document 上监听）。注意不能换成 window.dispatchEvent——直接派发
  // 到 window 的事件不经过 document，document 监听器收不到。
  document.dispatchEvent(new CustomEvent('unv:theme', { detail: { theme } }));
}

/** 按钮语义校正：亮色时按钮应读「切到暗色」，反之亦然 */
function syncThemeAria() {
  const btn = document.querySelector('[data-theme-toggle]');
  if (!btn) return;
  const light = document.documentElement.dataset.theme === 'light';
  btn.setAttribute('aria-label', light ? rt().themeToDark : rt().themeToLight);
}

function initTheme() {
  if (!themeInit) {
    themeInit = true;

    /* a. 点击切换（委托：换页后按钮是新节点，无需重绑） */
    document.addEventListener('click', (e) => {
      if (!e.target.closest('[data-theme-toggle]')) return;
      const next =
        document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      applyTheme(next);
      syncThemeAria();
    });

    /* b. 换页后主题连续性兜底（见模块注释 b）——
       必须走 applyTheme 而非只改 dataset：Astro 视图过渡在 swap 阶段会
       先移除 <html> 上所有属性再套用新文档的（SSR 输出不带 data-theme），
       而 #ink-canvas 是 transition:persist 的固定背景层、GL 上下文跨页
       连续，它的 astro:after-swap 监听注册先于本文件，此刻已读到
       undefined 并把 u_light 判成 0（暗色）——若不广播 unv:theme，
       亮色主题下整页背景会一直是黑墨（暗色下因 :root 默认即暗色而被掩盖，
       2026-09-11 修复）。applyTheme 里的 unv:theme 是 ink / giscus 的
       唯一同步通道，补发后同一任务内即完成纠正，不产生暗帧。 */
    document.addEventListener('astro:after-swap', () => {
      applyTheme(resolveTheme());
      syncThemeAria();
    });
  }

  /* c. 每页（含首次加载）校正一次按钮语义 */
  syncThemeAria();
}

/* ---------- 入口：每次页面加载（含视图过渡后）调用 ---------- */
export function initPage() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  kickWhenReady(reduced);
  initReveal(reduced);
  initCursor(reduced);
  initParallax(reduced);
  initSearch();
  initTheme();
  initPostTools();
}
