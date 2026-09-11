// ============================================================
// ui.ts — 界面文案字典（zh / en 双列，全站唯一文案来源）
// ============================================================
// 【设计】
// 1. zh 是「源语言」：`const zh` 定义全部文案，结构按页面/区域分组；
// 2. en 用 `satisfies Dictionary` 显式类型标注 —— zh 有而 en 没有的 key
//    在编辑器里当场红线报错（漏译不必等构建才发现）；
// 3. 页面用法：`const t = ui[lang]` 之后 `t.nav.posts` —— 全程类型安全，
//    拼错 key 或漏 key 都是编译期错误；
// 4. 运行时脚本（main.js 等）同样 import 本字典：
//    `<html data-lang="…">` 由 Base.astro 写入，脚本读它选列。
//
// 【原则】
// - 「界面跟语言走，内容跟稿子走」：本字典只收界面文案；
//   文章正文 / works / garden 的内容性文字不在此处（英文站回退显示中文原稿）。
// - 品牌视觉元素（巨字「不器」、朱砂印、garden 书房题字）不译——
//   它们是图形而非文案，任何语言下保持原样。
// ============================================================

/** 支持的语言集合（key 同时是 URL 前缀：en → /en/） */
export const languages = {
  zh: '中文',
  en: 'English',
} as const;

export type Lang = keyof typeof languages;

/** 默认语言（中文 = 无 URL 前缀） */
export const defaultLang: Lang = 'zh';

/** <html lang> 属性值（zh → zh-CN；en → en） */
export const htmlLang: Record<Lang, string> = {
  zh: 'zh-CN',
  en: 'en',
};

/** og:locale 值 */
export const ogLocale: Record<Lang, string> = {
  zh: 'zh_CN',
  en: 'en_US',
};

/** giscus 评论界面语言 */
export const giscusLocale: Record<Lang, string> = {
  zh: 'zh-CN',
  en: 'en',
};

/** RSS <language> 声明 */
export const rssLocale: Record<Lang, string> = {
  zh: 'zh-CN',
  en: 'en',
};

// ------------------------------------------------------------
// 源语言字典（zh）
// ------------------------------------------------------------
const zh = {
  /** 品牌 / 全局 */
  brand: {
    /** <title> 后缀与 og:site_name */
    siteName: 'unvessel / 不器',
    /** 英文语境下的站名（og/site 介绍用） */
    siteNameEn: 'unvessel',
    slogan: '愿被看见，不被定义',
    sloganEn: 'Seen, not defined.',
    defaultDesc: 'unvessel / 不器 — 愿被看见，不被定义。',
  },

  /** 布局骨架（Base.astro：顶栏 / 页脚 / 无障碍） */
  base: {
    skipToContent: '跳到主要内容',
    navAria: '主导航',
    searchAria: '站内检索（快捷键 Ctrl+K）',
    themeToLight: '切换到亮色',
    themeToDark: '切换到暗色',
    langAria: '切换到英文',
    /** 语言切换按钮文字：显示「目标语言」 */
    langBtn: 'EN',
    contact: '联络 / CONTACT',
    sitemap: '站点地图 / SITEMAP',
    sitemapAria: '站点地图',
    fine1: '© 2026 UNVESSEL — BUILT WITH ASTRO',
    fine2: '愿被看见，不被定义',
  },

  /** 站内检索浮层 */
  search: {
    dialogAria: '站内检索',
    placeholder: '站内检索 …',
    inputAria: '检索关键词',
    escAria: '关闭检索',
    hintSelect: '↑↓ 选择',
    hintOpen: '↵ 打开',
    hintClose: 'ESC 关闭',
    /** 以下三条是 main.js 运行时用的状态文案 */
    idle: '输入关键词，检索全部文章',
    unavailable: '索引不可用 — 请先 npm run build 并 preview',
    empty: '渊中无此物 — 换个关键词试试',
  },

  /** 代码复制按钮（main.js 运行时） */
  copy: {
    idle: '复制',
    done: '已复制',
    fail: '复制失败',
  },

  /** 导航标签（顶栏 + 页脚共用，no 编号在 Base 里维护） */
  nav: {
    home: '首页',
    posts: '文章',
    works: '作品',
    photos: '相册',
    logs: '日志',
    about: '关于',
    garden: '自留地',
  },

  /** 首页 */
  home: {
    title: 'unvessel 不器 — 愿被看见，不被定义',
    desc: '不器的个人领地：写作、作品与实验。愿被看见，不被定义。',
    heroKicker: 'A PERSONAL VOID — SINCE 2026',
    /** hero 巨字保持「不器」不译；aria 供读屏 */
    heroAria: '不器',
    /** 竖排 slogan 两列（英文站沿用竖排排版，字母横躺属预期风格） */
    sloganA: '愿被看见',
    sloganB: '不被定义',
    heroMeta1: '君子不器',
    heroMeta2: '非容器 — UNVESSEL',
    heroMeta3: 'EST. 2026',
    marquee: [
      { t: '愿被看见' },
      { t: '不被定义', accent: true },
      { t: 'UNVESSEL' },
      { t: '不器' },
      { t: '非容器' },
    ],
    featured: '精选',
    featuredSub: '编辑钉选',
    latest: '最新文章',
    latestAll: '全部文章',
    manifesto: '宣言',
    /** manifesto 巨字保持「不器」不译；下方三个字段是逐行文案 */
    manifestoL1Prefix: '君子',
    manifestoL2: '《周易·系辞上》——形而上者谓之道，形而下者谓之器',
    manifestoL3Prefix: '愿被看见，',
    manifestoL3Em: '不被定义',
  },

  /** 文章列表页（/posts/） */
  list: {
    kicker: 'ARCHIVE — 全部文章',
    giant: ['文', '章'],
    giantAria: '文章',
    metaSub: 'UNVESSEL — 不器',
    title: '文章 — unvessel 不器',
    titlePage: '文章 · 第 {n} 页 — unvessel 不器',
    desc: '不器的全部文章，按时间倒序。',
    pagerAria: '分页',
    prevAria: '上一页',
    nextAria: '下一页',
  },

  /** 文章详情页 */
  detail: {
    minutes: '约 {n} 分钟',
    /**
     * 语言回退标注（PostRow / 详情页头共用）：展示稿语言 ≠ 站点语言时
     * 标注「内容语言」——中文站出现英文稿标〔英文〕，英文站出现
     * 中文稿（暂无译文）标〔in Chinese〕。
     */
    fallback: '〔英文〕',
    tocMobile: '目录 — {n} 节',
    tocLabel: '目录 / INDEX',
    tocAria: '目录',
    older: '← 上一篇 · 更早',
    newer: '下一篇 · 更新 →',
    back: '← 返回全部文章',
    /** 文末导航整体 aria（上一篇下一篇 + 返回链接所在的 nav） */
    navAria: '文章导航',
  },

  /** 文章行（PostRow） */
  row: {
    draftFlag: ' [草稿]',
  },

  /** 作品页 */
  works: {
    kicker: 'WORKS — 作品',
    giant: ['作', '品'],
    giantAria: '作品',
    metaSub: '做出来的，才算数',
    title: '作品 — unvessel 不器',
    desc: '不器的作品集：写作之外，做出来的东西。',
    listAria: '作品列表',
    status: { live: '上线', building: '在建', archive: '归档' } as Record<string, string>,
    noLinkSuffix: '，暂无链接',
  },

  /** 相册页 */
  photos: {
    kicker: 'PHOTOS — 相册',
    giant: ['相', '册'],
    giantAria: '相册',
    metaSub: '文字之外，光的痕迹',
    title: '相册 — unvessel 不器',
    desc: '不器的相册：文字之外，光的痕迹。',
    gridAria: '照片列表',
    emptyAria: '相册暂无照片',
    emptyTitle: '胶卷未装',
    emptyDesc: '相册等待第一批光。照片投放方式：',
    emptyStep1: '图片文件丢进 <code>public/photos/</code>（建议 .jpg / .webp，长边 ≤ 2000px）',
    emptyStep2: '文件名即图注：<code>YYYY-MM-DD-标题.jpg</code>（日期前缀可省，缺省取文件修改时间）',
    emptyStep3: '重新 build，照片自动上墙——无需改动任何代码',
  },

  /** 日志页 */
  logs: {
    kicker: 'CHANGELOG — 日志',
    giant: ['日', '志'],
    giantAria: '日志',
    metaSub: '站点自身的编年史',
    title: '日志 — unvessel 不器',
    desc: '不器的站点日志：建站、改版、实验与修复的编年史。',
    timelineAria: '日志时间线',
    activity: '写作活动 · 近一年',
    /** 日志 kind 的英文显示（zh 直接用原值） */
    kindEn: { 站点: 'Site', 写作: 'Writing', 实验: 'Experiment' } as Record<string, string>,
  },

  /** 自留地页 */
  garden: {
    kicker: 'GARDEN — 自留地',
    giant: ['自', '留', '地'],
    giantAria: '自留地',
    metaSub: '种花的，也种念头',
    title: '自留地 — unvessel 不器',
    desc: '不器的自留地：读书、音乐，和随手种下的念头。',
    stageAria: '书房——自留地的三维门面',
    /** 书房题字保持中文（视觉装饰，不译） */
    cue: '向下 · 进自留地',
    groupsAria: '爱好记录',
    sparksLabel: '灵感 · 随手记 · unv idea',
    sparksAria: '灵感碎片',
    sparksEmpty: '还没有念头落进这里。',
    status: { doing: '进行中', done: '记录', wish: '想' } as Record<string, string>,
    externalSuffix: '，站外链接',
  },

  /** 关于页 */
  about: {
    kicker: 'ABOUT — 关于',
    giant: ['关', '于'],
    giantAria: '关于',
    title: '关于 — unvessel 不器',
    desc: '不器的自留地：愿被看见，不被定义。',
    /** 自介正文（HTML 片段占位符：{name} {en} {zhName}） */
    intro1: '这里是<strong>{zhName}（{name}）</strong>的自留地。名字取自《周易·系辞上》那句「君子不器」——不被装进格子，不被一种手艺定型；unvessel 的字面意思是「非容器」，同一个意思的英文写法。',
    intro2Prefix: '写技术与随笔，做东西，也拍照片。这里的一切都长在明面上：',
    introH2: '怎么建的',
    intro3: 'Astro 纯静态输出，无追踪脚本、无访客画像；视觉是自研的纯黑系统——纯黑画布、流体墨与朱砂一点。站点为 AI 协作留有完整运营接口，也许你读到的某一篇，正是一次人机协作的痕迹。',
    statsLabel: '站点统计 · 数据随每次构建实算',
    stats: {
      posts: '文章',
      logs: '日志',
      works: '作品',
      photos: '照片',
      words: '字数',
      days: '建站',
    } as Record<string, string>,
    daysUnit: '天',
    statsNote: '本站不放置追踪脚本、不采集访客画像。「访客记录」只有这些由内容自身长出的数字。',
    contactH2: '联络',
    contactP1: '邮件：',
    contactP2: '。不闲聊，但认真回复每一封认真的信。订阅更新：',
    contactP3: '。',
    contactP4: '代码与日常：',
  },

  /**
   * 版权页（/colophon/）——技术构成清单。
   * 出版书籍末页的「版权页」记录字体、纸张与印次；本页是它的数字同义：
   * 书房由什么建成，一一列明。分组 key 与模板循环解耦（Object.entries），
   * 增删分组只改字典，模板自动跟上。
   * groups 各条目为 [名称, 说明] 二元组——名称是专有名词（字体/框架名）不译，
   * 说明随语言走。
   */
  colophon: {
    kicker: 'COLOPHON — 版权页',
    giant: ['版', '页'],
    giantAria: '版权页',
    title: '版权页 — unvessel 不器',
    desc: '本站的字体、工具与设计规格——一间书房的家底，一一列明。',
    intro:
      '出版书籍末页会附一页「版权页」，记录字体、纸张与印次。这是它的数字同义：这间书房由什么建成，每一件都摆在明面上。',
    groups: {
      type: {
        label: '字体 / TYPE',
        items: [
          ['Noto Serif SC', '沉底巨字与引文，宋体重墨'],
          ['Noto Sans SC', '正文与界面，黑体清爽'],
          ['JetBrains Mono', '元信息、代码与编号'],
          ['Anton', '英文巨字，与宋体同框'],
          ['@fontsource 自托管', '按 unicode-range 切片加载，不依赖第三方 CDN'],
        ],
      },
      build: {
        label: '构建 / BUILD',
        items: [
          ['Astro 5', '纯静态输出，零客户端框架'],
          ['TypeScript', '全站严格类型，字典结构编译期兜底'],
          ['Sharp', '分享图（OG）构建期由 SVG 逐文章渲染'],
          ['Pagefind', '构建期索引的纯静态站内检索'],
        ],
      },
      features: {
        label: '功能 / FEATURES',
        items: [
          ['RSS', '中英双语 feed，构建期生成'],
          ['giscus', '评论基于 GitHub Discussions，未配置即不渲染'],
          ['sitemap + JSON-LD', 'hreflang 中英互指，文章页 BlogPosting 结构化数据'],
          ['阅读量与点赞', 'Upstash 计数，未配置即静默隐藏'],
        ],
      },
      design: {
        label: '设计 / DESIGN',
        items: [
          ['墨渊 × 朱砂', '#070707 深渊底色，#ff3b2f 唯一强调'],
          ['直角与发丝线', '无圆角、无阴影、无渐变按钮'],
          ['明暗双主题', '暗「渊」/ 亮「宣纸」，同一套令牌翻转'],
          ['流体墨', 'WebGL 画布，视图过渡间跨页持久'],
        ],
      },
      deploy: {
        label: '部署 / DEPLOY',
        items: [
          ['Vercel', '零配置托管，构建即上线'],
          ['GitHub', '源码与版本，提交即历史'],
        ],
      },
    },
    outroPrefix: '以上皆器，',
    outroEm: '用器者不器',
    outroSuffix: '。',
  },

  /** 404 页 */
  nf: {
    title: '404 — unvessel 不器',
    desc: '你要找的页面不在任何容器里。',
    line: '器未成，路已失。',
    sub: '你要找的页面不在任何容器里——它可能从未成形，也可能已经改名迁移。',
    back: '← 回到首页',
    posts: '文章列表',
    logs: '站点日志',
    navAria: '404 导航',
  },

  /** 评论组件 */
  comments: {
    label: '附录 · 议论',
    sectionAria: '文章评论',
    unlitAria: '评论区尚未启用',
    unlitTitle: '议论未点亮',
    unlitDesc: '评论区基于 GitHub Discussions（giscus），当前站点尚未配置。点亮步骤：',
    step1: 'GitHub 仓库 Settings → General → 开启 Discussions',
    step2: '到 giscus.app 生成 repoId / categoryId 四要素',
    step3: '填入 <code>src/config/site.ts</code> 的 GISCUS 配置',
    step4: '重新 build，评论区在此处亮起',
  },

  /** 阅读量 / 点赞（Metrics） */
  metrics: {
    views: '阅读',
    like: '点赞',
  },

  /** 热力图（Heatmap） */
  heat: {
    /** 星期刻度：只标 一/三/五/日（与 GitHub 同理） */
    dayTicks: ['一', '', '三', '', '五', '', '日'],
    less: '少',
    more: '多',
    figAria: '写作活动热力图：近一年活跃 {days} 天，共 {total} 篇',
    gridAria: '活跃 {days} 天，共 {total} 篇产出',
    legend: '活跃 {days} 天 · 共 {total} 篇',
    cellZero: '{date} · 无产出',
    cellSome: '{date} · {count} 篇产出',
  },

  /** 月份刻度格式（activity.monthLabels 渲染用） */
  month: {
    /** zh: 「9月」；en: 「Sep」（经 MONTHS_EN 取值） */
    zh: '{n}月',
  },
};

/** 字典类型：以 zh 结构为契约（en 必须逐 key 对齐） */
export type Dictionary = typeof zh;

/** 英文月份缩写（热力图刻度） */
export const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ------------------------------------------------------------
// 英文字典（结构必须与 zh 完全一致 —— satisfies 在编译期兜底）
// ------------------------------------------------------------
const en = {
  brand: {
    siteName: 'unvessel',
    siteNameEn: 'unvessel',
    slogan: 'Seen, not defined.',
    sloganEn: 'Seen, not defined.',
    defaultDesc: 'unvessel — Seen, not defined.',
  },

  base: {
    skipToContent: 'Skip to content',
    navAria: 'Main navigation',
    searchAria: 'Search (Ctrl+K)',
    themeToLight: 'Switch to light',
    themeToDark: 'Switch to dark',
    langAria: 'Switch to Chinese',
    langBtn: '中',
    contact: 'CONTACT',
    sitemap: 'SITEMAP',
    sitemapAria: 'Sitemap',
    fine1: '© 2026 UNVESSEL — BUILT WITH ASTRO',
    fine2: 'Seen, not defined',
  },

  search: {
    dialogAria: 'Site search',
    placeholder: 'Search …',
    inputAria: 'Search keywords',
    escAria: 'Close search',
    hintSelect: '↑↓ navigate',
    hintOpen: '↵ open',
    hintClose: 'ESC close',
    idle: 'Type to search all posts',
    unavailable: 'Index unavailable — run npm run build && preview',
    empty: 'Nothing found — try another keyword',
  },

  copy: {
    idle: 'Copy',
    done: 'Copied',
    fail: 'Copy failed',
  },

  nav: {
    home: 'Home',
    posts: 'Posts',
    works: 'Works',
    photos: 'Photos',
    logs: 'Logs',
    about: 'About',
    garden: 'Garden',
  },

  home: {
    title: 'unvessel — Seen, not defined.',
    desc: 'A personal void by Buqi: writing, works and experiments. Seen, not defined.',
    heroKicker: 'A PERSONAL VOID — SINCE 2026',
    heroAria: '不器 (Buqi)',
    sloganA: 'Seen,',
    sloganB: 'not defined',
    heroMeta1: 'Junzi Buqi',
    heroMeta2: 'Not a vessel — UNVESSEL',
    heroMeta3: 'EST. 2026',
    marquee: [
      { t: 'Seen' },
      { t: 'Not defined', accent: true },
      { t: 'UNVESSEL' },
      { t: '不器' },
      { t: 'No vessel' },
    ],
    featured: 'Featured',
    featuredSub: "editor's picks",
    latest: 'Latest posts',
    latestAll: 'All posts',
    manifesto: 'Manifesto',
    manifestoL1Prefix: 'Junzi ',
    manifestoL2: 'I Ching — "The metaphysical is called the Way; the physical is called the vessel."',
    manifestoL3Prefix: 'To be seen, and ',
    manifestoL3Em: 'not defined',
  },

  list: {
    kicker: 'ARCHIVE — all posts',
    giant: ['POSTS'],
    giantAria: 'Posts',
    metaSub: 'UNVESSEL',
    title: 'Posts — unvessel',
    titlePage: 'Posts · page {n} — unvessel',
    desc: 'Every post on unvessel, newest first.',
    pagerAria: 'Pagination',
    prevAria: 'Previous page',
    nextAria: 'Next page',
  },

  detail: {
    minutes: '{n} min read',
    /** 展示稿语言 ≠ 站点语言时的内容语言标注（见 zh 列同名注释） */
    fallback: '〔in Chinese〕',
    tocMobile: 'Contents — {n} sections',
    tocLabel: 'Contents / INDEX',
    tocAria: 'Table of contents',
    older: '← Older post',
    newer: 'Newer post →',
    back: '← All posts',
    navAria: 'Post navigation',
  },

  row: {
    draftFlag: ' [draft]',
  },

  works: {
    kicker: 'WORKS',
    giant: ['WORKS'],
    giantAria: 'Works',
    metaSub: 'Built things count',
    title: 'Works — unvessel',
    desc: 'Things built beyond writing.',
    listAria: 'Works list',
    status: { live: 'Live', building: 'Building', archive: 'Archive' },
    noLinkSuffix: ' (no link)',
  },

  photos: {
    kicker: 'PHOTOS',
    giant: ['PHOTOS'],
    giantAria: 'Photos',
    metaSub: 'Traces of light beyond words',
    title: 'Photos — unvessel',
    desc: 'Traces of light beyond words.',
    gridAria: 'Photo grid',
    emptyAria: 'No photos yet',
    emptyTitle: 'No film loaded',
    emptyDesc: 'The album awaits its first light. How to add photos:',
    emptyStep1: 'Drop image files into <code>public/photos/</code> (.jpg / .webp recommended, long edge ≤ 2000px)',
    emptyStep2: 'The filename is the caption: <code>YYYY-MM-DD-title.jpg</code> (date prefix optional, falls back to file mtime)',
    emptyStep3: 'Rebuild — photos go up on the wall automatically, no code needed',
  },

  logs: {
    kicker: 'CHANGELOG',
    giant: ['LOGS'],
    giantAria: 'Logs',
    metaSub: "This site's own chronicle",
    title: 'Logs — unvessel',
    desc: 'A chronicle of building, rebuilding, experimenting and fixing.',
    timelineAria: 'Log timeline',
    activity: 'Writing activity · past year',
    kindEn: { 站点: 'Site', 写作: 'Writing', 实验: 'Experiment' },
  },

  garden: {
    kicker: 'GARDEN',
    giant: ['GARDEN'],
    giantAria: 'Garden',
    metaSub: 'Growing flowers, and thoughts',
    title: 'Garden — unvessel',
    desc: 'Reading, music, and sparks of thought.',
    stageAria: 'The study — 3D front of the garden',
    cue: 'Scroll · enter the garden',
    groupsAria: 'Reading log',
    sparksLabel: 'Fleeting notes · unv idea',
    sparksAria: 'Sparks',
    sparksEmpty: 'No sparks have landed here yet.',
    status: { doing: 'Doing', done: 'Done', wish: 'Wish' },
    externalSuffix: ' (external link)',
  },

  about: {
    kicker: 'ABOUT',
    giant: ['ABOUT'],
    giantAria: 'About',
    title: 'About — unvessel',
    desc: 'A personal void: seen, not defined.',
    intro1: 'This is the garden of <strong>{name}</strong>. The Chinese name 「不器」 comes from the I Ching — "a gentleman is not a vessel": not to be fitted into a slot, not to be shaped by a single craft. "unvessel" is the same idea in English.',
    intro2Prefix: 'Writing on tech and essays, making things, taking photos. Everything here grows in plain sight:',
    introH2: 'How it is built',
    intro3: 'Astro, fully static. No tracking scripts, no visitor profiling. The visuals are a self-made black system — pure black canvas, fluid ink, and a touch of vermilion. The site keeps a full operations interface for AI collaboration; perhaps the post you are reading is a trace of such a collaboration.',
    statsLabel: 'Site stats · computed at every build',
    stats: {
      posts: 'Posts',
      logs: 'Logs',
      works: 'Works',
      photos: 'Photos',
      words: 'Words',
      days: 'Days',
    },
    daysUnit: 'd',
    statsNote: 'No tracking scripts, no visitor profiling. The only "visitor records" are these numbers grown out of the content itself.',
    contactH2: 'Contact',
    contactP1: 'Email: ',
    contactP2: '. No small talk, but every serious letter gets a serious reply. Subscribe via ',
    contactP3: '.',
    contactP4: 'Code and daily notes: ',
  },

  colophon: {
    kicker: 'COLOPHON',
    giant: ['COLOPHON'],
    giantAria: 'Colophon',
    title: 'Colophon — unvessel',
    desc: 'The typefaces, tools and design specs of this site — listed in plain sight.',
    intro:
      'Printed books end with a colophon: typefaces, paper, print runs. This is its digital counterpart — what this study is built with, every piece in plain sight.',
    groups: {
      type: {
        label: 'TYPE',
        items: [
          ['Noto Serif SC', 'Giant characters & quotations, heavy Song-style ink'],
          ['Noto Sans SC', 'Body text & interface'],
          ['JetBrains Mono', 'Metadata, code & numbering'],
          ['Anton', 'English display type, set beside the Song serif'],
          ['@fontsource self-hosted', 'Loaded in unicode-range slices — no third-party CDN'],
        ],
      },
      build: {
        label: 'BUILD',
        items: [
          ['Astro 5', 'Fully static output, zero client framework'],
          ['TypeScript', 'Strict typing site-wide; dictionary shape checked at compile time'],
          ['Sharp', 'OG share images rendered from SVG per post at build time'],
          ['Pagefind', 'Static site search indexed at build time'],
        ],
      },
      features: {
        label: 'FEATURES',
        items: [
          ['RSS', 'Bilingual feeds generated at build time'],
          ['giscus', 'Comments via GitHub Discussions; not rendered until configured'],
          ['sitemap + JSON-LD', 'hreflang zh/en alternates; BlogPosting structured data on posts'],
          ['Views & likes', 'Upstash counters, silently hidden when unconfigured'],
        ],
      },
      design: {
        label: 'DESIGN',
        items: [
          ['Void × Vermilion', '#070707 abyss ground, #ff3b2f the only accent'],
          ['Right angles & hairlines', 'No rounding, no shadows, no gradient buttons'],
          ['Two themes', 'Dark "Yuan" / light "Xuan paper" — one set of tokens, flipped'],
          ['Fluid ink', 'WebGL canvas, persistent across page transitions'],
        ],
      },
      deploy: {
        label: 'DEPLOY',
        items: [
          ['Vercel', 'Zero-config hosting; build and it is live'],
          ['GitHub', 'Source and versions; every commit is history'],
        ],
      },
    },
    outroPrefix: 'All of these are vessels. ',
    outroEm: 'The one who wields them is not',
    outroSuffix: '.',
  },

  nf: {
    title: '404 — unvessel',
    desc: 'The page you want is not in any vessel.',
    line: 'The vessel never took shape; the road is lost.',
    sub: 'The page you are looking for is not in any vessel — it may never have taken shape, or it has been renamed and moved.',
    back: '← Back home',
    posts: 'All posts',
    logs: 'Site logs',
    navAria: '404 navigation',
  },

  comments: {
    label: 'Appendix · Discussion',
    sectionAria: 'Post comments',
    unlitAria: 'Comments not enabled',
    unlitTitle: 'Discussion not lit',
    unlitDesc: 'Comments are powered by GitHub Discussions (giscus) and are not configured yet. To light it up:',
    step1: 'GitHub repo Settings → General → enable Discussions',
    step2: 'Generate repoId / categoryId on giscus.app',
    step3: 'Fill them into GISCUS in <code>src/config/site.ts</code>',
    step4: 'Rebuild — the comment area lights up here',
  },

  metrics: {
    views: 'Views',
    like: 'Like',
  },

  heat: {
    dayTicks: ['M', '', 'W', '', 'F', '', 'S'],
    less: 'Less',
    more: 'More',
    figAria: 'Writing activity: {days} active days, {total} posts in the past year',
    gridAria: '{days} active days, {total} posts',
    legend: '{days} active days · {total} posts',
    cellZero: '{date} · no output',
    cellSome: '{date} · {count} posts',
  },

  month: {
    zh: '{n}月',
  },
} satisfies Dictionary;

/** 双语字典（导出后页面经 ui[lang] 取列） */
export const ui: Record<Lang, Dictionary> = { zh, en };

// ------------------------------------------------------------
// 语言 / 路径工具
// ------------------------------------------------------------

/**
 * 从 URL pathname 解析语言：/en/… → 'en'，其余 → 'zh'。
 * 构建期（Astro.currentLocale）与运行时脚本都可用的同源实现。
 */
export function langFromPath(pathname: string): Lang {
  return pathname === '/en' || pathname.startsWith('/en/') ? 'en' : defaultLang;
}

/**
 * 语言相对路径：中文站内路径不加前缀，英文站加 /en 前缀。
 * @param lang 目标语言
 * @param path 中文站内路径（以 / 开头，如 /posts/）
 * @example localePath('en', '/posts/') === '/en/posts/'
 */
export function localePath(lang: Lang, path: string): string {
  if (lang === defaultLang) return path;
  // 已带前缀的不重复加
  if (path === '/en' || path.startsWith('/en/')) return path;
  return path === '/' ? '/en/' : `/en${path}`;
}

/**
 * 语言互译链接：给当前路径算出另一语言下的对应地址。
 * 用于 hreflang alternate 与语言切换按钮。
 * @example
 *   otherLocalePath('zh', '/en/posts/') === '/posts/'
 *   otherLocalePath('en', '/posts/')    === '/en/posts/'
 */
export function otherLocalePath(target: Lang, currentPath: string): string {
  if (target === 'en') return localePath('en', currentPath);
  // en → zh：剥掉 /en 前缀
  return currentPath.replace(/^\/en(?=\/|$)/, '') || '/';
}
