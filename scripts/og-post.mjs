// ============================================================
// og-post.mjs — 逐文章动态 OG 分享图生成器
// ============================================================
// 产出：public/og/<uid>.png（1200×630，每篇文章一张分享卡，
//       URL = /og/<uid>.png —— uid 与文章 URL 同源，永不失配）。
// 实现方式：与 scripts/og.mjs（全站默认图）同一条管线——
//       手写 SVG（渊底黑 + 骨白巨字 + 朱砂唯一彩色）→ sharp 栅格化。
//       不引入 satori：字体切片 woff→ttf 转换链路重，且本机生成
//       （系统字体栅格化）已由 og.mjs 验证可行，产物入库后与
//       运行环境无关，两条管线共用同一套视觉语言。
//
// 用法：node scripts/og-post.mjs
// 何时跑：构建前自动执行（package.json build 首段），文章增删改后
//       重跑 build 即同步；也可单独手动执行。
//
// 版式说明（与 og-default 同源的三段式，纵向密度更大）：
//   顶部  朱砂方点 + mono 元信息行（UNVESSEL — EST.2026）
//   上部  mono 档案行（FILE NNN — YYYY.MM.DD）
//   中部  文章标题（宋体 900 巨字，按长度自适应缩放 + 换行，最多 3 行）
//   右下  朱砂竖杆（站内「不被定义」删除线同款元素）
//   底部  mono 品牌行 + slogan
//
// 双语口径（与 src/lib/posts.ts 严格同源）：
//   - uid：frontmatter 显式 uid 优先；哈希兜底 = md5(文件名去 .en) 前 8 位；
//   - 一篇文章 = 一个 uid = 一张图（中英两站 og:image 共用），
//     标题取「主稿」——zh 稿优先，纯英文投稿回退 en 稿；
//   - 配对内任一支是草稿 → 整篇跳过（与展示口径一致）。
// ============================================================

import sharp from 'sharp';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

/** 项目根（scripts/ 的上一级） */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** 文章内容目录（Astro content collections 约定位置） */
const POSTS_DIR = path.join(ROOT, 'src', 'content', 'posts');
/** 产物目录 */
const OUT_DIR = path.join(ROOT, 'public', 'og');

/** 画布尺寸：OG 图业界标准 1200×630（与 Base.astro 的 og:image:width/height 对应） */
const W = 1200;
const H = 630;

/** 色板：与 src/styles/global.css 的 :root 变量、scripts/og.mjs 保持一致 */
const VOID = '#070707'; // 渊底：页面背景色
const BONE = '#f2f0ea'; // 骨白：主文字色
const SMOKE = '#8a8781'; // 烟灰：次级文字色
const ACCENT = '#ff3b2f'; // 朱砂：全站唯一彩色

// ------------------------------------------------------------
// 小工具
// ------------------------------------------------------------

/** XML 文本节点转义（标题 / slogan 里可能含 & < >） */
function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * 短哈希：与 src/lib/utils.ts 的 shortHash 严格同源
 * （md5 前 8 位小写 hex——稳定性要求，不承载安全语义）。
 */
function shortHash(s) {
  return createHash('md5').update(s).digest('hex').slice(0, 8);
}

/** 日期 → 「2026.09.09」（与 formatDate 同口径） */
function fmtDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

/**
 * 单字符渲染宽度（em 比例）：Noto Serif SC 900 的近似度量。
 * CJK 及全形 = 1.0；拉丁按大写 / 小写分档；其余标点取保守值。
 * 估计只用于「避免溢出」的排版决策，宁可略宽不可超界。
 */
function charEm(ch) {
  const cp = ch.codePointAt(0);
  if (cp >= 0x2e80 && cp <= 0x9fff) return 1.0; // CJK 部首/汉字
  if (cp >= 0x3000 && cp <= 0x303f) return 1.0; // CJK 标点
  if (cp >= 0xff00 && cp <= 0xffef) return 1.0; // 全形字符
  if (ch === ' ') return 0.3;
  if (/[A-Z0-9]/.test(ch)) return 0.72;
  if (/[a-z]/.test(ch)) return 0.56;
  return 0.46; // 半角标点等
}

/** 行首禁则字符：这些标点不落在行首（命中则整 token 回退到上一行末） */
const NO_LINE_START = new Set([...'，。：；、！？」』）…．,.;:!?)]}']);

/**
 * 标题 token 化：CJK 逐字一个 token（逐字可断），
 * 连续拉丁/数字/半角标点为一个 token（单词整体不可断）。
 * 末段做「数字词粘合」：连续数字（含汉字数字〇零一二…亿）与紧随其后的
 * 一个单字粘成原子单元——「一场」「两千年」「2026年」这类数量词
 * 不允许被断行拆散（无需词典，一条形态规则覆盖绝大多数标题词组）。
 */
function tokenize(title) {
  const tokens = [];
  let buf = '';
  for (const ch of title.replace(/\s+/g, ' ').trim()) {
    if (charEm(ch) >= 1.0) {
      if (buf) tokens.push(buf);
      buf = '';
      tokens.push(ch);
    } else {
      buf += ch;
    }
  }
  if (buf) tokens.push(buf);

  // 数字词粘合：run = 连续数字 token；run 后若跟单字 CJK token 则并入
  const NUM = /^[0-9〇零一二三四五六七八九十百千万亿两]+$/;
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!NUM.test(tokens[i])) {
      out.push(tokens[i]);
      continue;
    }
    let j = i;
    while (j < tokens.length && NUM.test(tokens[j])) j++;
    if (j < tokens.length && tokens[j].length === 1 && charEm(tokens[j]) >= 1.0) {
      out.push(tokens.slice(i, j + 1).join('')); // run + 后 1 字 → 原子单元
      i = j;
    } else {
      out.push(...tokens.slice(i, j)); // 无后继可粘（数字串收尾），原样保留
      i = j - 1;
    }
  }
  return out;
}

/** token 渲染宽度（em） */
function tokenEm(tk) {
  return [...tk].reduce((w, ch) => w + charEm(ch), 0);
}

/**
 * 均衡换行：把 tokens 分成 N 行，断点取「累计宽度最接近 k×总宽/N」的
 * token 边界（k = 1..N-1）——标题卡追求行间视觉均衡，而非正文式贪心填满；
 * 贪心会把「一场两 / 千年的抵抗」这类词组拦腰截断，均衡断行则倾向在
 * 「君子不器：一场 / 两千年的抵抗」这样的语义与几何双平衡点收行。
 * 随后做行首禁则修正：禁则标点整 token 并回上一行。
 * @returns string[] | null（任一行超宽或分不出 N 行 → null，调用方降档重排）
 */
function balancedWrap(tokens, nLines, maxWidthEm) {
  const n = tokens.length;
  if (n < nLines) return null;
  // prefix[i] = 前 i 个 token 的累计宽度
  const prefix = [0];
  for (let i = 0; i < n; i++) prefix.push(prefix[i] + tokenEm(tokens[i]));
  const total = prefix[n];

  // 逐行定断点：第 k 行起点 = 累计宽度最接近 k·aim 的边界
  //（约束：与上一断点严格递增，且给后续每行至少留 1 个 token）
  const aim = total / nLines;
  const starts = [0];
  for (let k = 1; k < nLines; k++) {
    let best = -1;
    let bestDiff = Infinity;
    for (let b = starts[k - 1] + 1; b <= n - (nLines - k); b++) {
      const diff = Math.abs(prefix[b] - aim * k);
      if (diff < bestDiff - 1e-9) {
        bestDiff = diff;
        best = b;
      }
    }
    if (best < 0) return null;
    starts.push(best);
  }
  starts.push(n);

  // 行首禁则修正：行首命中禁则的 token 挪回上一行末（最多回退 4 次）
  for (let k = 1; k < nLines; k++) {
    let guard = 0;
    while (
      starts[k] < starts[k + 1] &&
      NO_LINE_START.has(tokens[starts[k]][0]) &&
      starts[k] > starts[k - 1] + 1 &&
      guard++ < 4
    ) {
      starts[k]++;
    }
  }

  // 组行 + 宽度校验（禁则回退会使上一行变宽，必须统一复检）
  const lines = [];
  for (let k = 0; k < nLines; k++) {
    lines.push(tokens.slice(starts[k], starts[k + 1]).join(''));
    if (prefix[starts[k + 1]] - prefix[starts[k]] > maxWidthEm + 1e-9) return null;
  }
  return lines;
}

/**
 * 兜底截断（极端长标题才会触达）：按宽度贪心装 2 行，装不下即截断加 …。
 * 只服务截断分支，不需要均衡与禁则——末行本来就要截。
 */
function truncateWrap(title, maxWidthEm) {
  const lines = [''];
  let li = 0;
  let w = 0;
  let truncated = false;
  for (const ch of title) {
    const cw = charEm(ch);
    if (w + cw > maxWidthEm - 1.0) {
      if (li === 0) {
        li++;
        lines.push('');
        w = 0;
      } else {
        truncated = true;
        break;
      }
    }
    lines[li] += ch;
    w += cw;
  }
  if (truncated) lines[1] = lines[1].replace(/\s+\S*$/, '') + '…';
  return lines;
}

/**
 * 标题自适应排版：从最大号起步逐档试排，两重约束——
 *   1. 几何：行块高度（行数 × 字号 × 行高）≤ 标题区可用高度；
 *   2. 行数：≤ 3 行。
 * 任一档位先试「最少行数」（视觉最大），均衡断行失败再试多一行；
 * 降到最小号仍放不下才走截断兜底。
 * @returns { lines: string[], size: number }
 */
function fitTitle(title) {
  const MAX_W_EM = 985; // 内容区宽（px）：x=84 起，右缘 ≤ 1084，避开朱砂竖杆
  const ZONE_H = 290; // 标题区可用高度（px）：y ∈ [200, 490]
  const LINE_H = 1.16; // 行高 = 字号 × 1.16（与 postSvg 保持一致）
  const SIZES = [150, 138, 126, 116, 106, 96, 88, 80, 72, 64]; // 降档阶梯
  const tokens = tokenize(title);

  for (let i = 0; i < SIZES.length; i++) {
    const size = SIZES[i];
    const maxWEm = MAX_W_EM / size;
    // 最少行数 = 总宽 ÷ 行宽向上取整（先试它，视觉最大）
    const minLines = Math.max(1, Math.ceil((tokens.reduce((w, tk) => w + tokenEm(tk), 0) / maxWEm) - 1e-9));
    for (let nLines = minLines; nLines <= Math.min(3, minLines + 1); nLines++) {
      const lines = balancedWrap(tokens, nLines, maxWEm);
      if (lines && nLines * size * LINE_H <= ZONE_H) return { lines, size };
    }
    // 最小号仍放不下：截断兜底（2 行贪心 + …）
    if (i === SIZES.length - 1) {
      return { lines: truncateWrap(title, maxWEm), size };
    }
  }
  return { lines: [title], size: SIZES[0] };
}

// ------------------------------------------------------------
// 数据层：扫描 → frontmatter → 双语配对 → 编号（与 lib/posts.ts 同口径）
// ------------------------------------------------------------

const files = fs.existsSync(POSTS_DIR)
  ? fs.readdirSync(POSTS_DIR).filter((f) => /\.(md|mdx)$/.test(f))
  : [];

/** uid → 双语稿对（与 getPostPairs 同构：zh/en 至少一支） */
const buckets = new Map();
for (const f of files) {
  const raw = fs.readFileSync(path.join(POSTS_DIR, f), 'utf8');
  const { data } = matter(raw);
  const id = f.replace(/\.(md|mdx)$/, '');
  // uid 与 utils.postUid 严格同源：显式 uid 优先，哈希兜底前剥 .en 后缀
  const uid = data.uid || shortHash(id.replace(/\.en$/, ''));
  // 语言判定：frontmatter lang 优先，文件名 .en 后缀兜底
  const lang = data.lang === 'en' || /\.en$/.test(id) ? 'en' : 'zh';
  const pair = buckets.get(uid) ?? { uid, zh: null, en: null };
  pair[lang] = { id, data };
  buckets.set(uid, pair);
}

/** 整对剔除草稿 → 主稿代表（zh 优先）→ 按发布日期正序编号（001 = 最旧） */
const articles = [...buckets.values()]
  .filter((p) => ![p.zh, p.en].some((x) => x?.data?.draft))
  .map((p) => ({ uid: p.uid, main: p.zh ?? p.en }))
  .sort((a, b) => new Date(a.main.data.pubDate) - new Date(b.main.data.pubDate))
  .map((a, i) => ({ ...a, no: String(i + 1).padStart(3, '0') }));

if (articles.length === 0) {
  console.log('· 无非草稿文章，跳过动态 OG 生成');
  process.exit(0);
}

// ------------------------------------------------------------
// 渲染：单篇文章 → SVG → PNG
// ------------------------------------------------------------

/**
 * 单篇文章 SVG 稿：三段式版式（顶部锚点 / 档案行 + 巨字标题 / 底部品牌行）。
 * 固定元素与 og.mjs 完全同源；标题区按 fitTitle 结果动态布局。
 */
function postSvg({ no, date, title }) {
  const { lines, size } = fitTitle(title);
  // 标题块垂直居中于 y ∈ [200, 490] 区间（高 290，与 fitTitle 的 ZONE_H 一致）；
  // 行高 = 字号 × 1.16（与 fitTitle 的 LINE_H 一致）
  const lineH = size * 1.16;
  const blockH = lines.length * lineH;
  const top = 200 + (290 - blockH) / 2;

  const titleText = lines
    .map(
      (line, i) =>
        `<text x="84" y="${(top + size * 0.82 + i * lineH).toFixed(1)}" ` +
        `font-family="'Noto Serif SC','SimSun',serif" font-weight="900" ` +
        `font-size="${size}" fill="${BONE}">${esc(line)}</text>`,
    )
    .join('\n  ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <!-- 渊底 -->
  <rect width="${W}" height="${H}" fill="${VOID}"/>
  <!-- 顶部：朱砂方点（顶栏品牌锚同款）+ mono 元信息行 -->
  <rect x="84" y="92" width="18" height="18" fill="${ACCENT}"/>
  <text x="118" y="108" font-family="'JetBrains Mono','Cascadia Mono',Consolas,monospace"
        font-size="22" letter-spacing="6" fill="${SMOKE}">UNVESSEL — EST.2026</text>
  <!-- 档案行：FILE 编号（与列表页 / 详情页同源）+ 发布日期 -->
  <text x="84" y="178" font-family="'JetBrains Mono','Cascadia Mono',Consolas,monospace"
        font-size="24" letter-spacing="4" fill="${SMOKE}">FILE ${no} — ${date}</text>
  <!-- 巨字标题：宋体 900，自适应换行 -->
  ${titleText}
  <!-- 右下：朱砂竖杆（站内「不被定义」删除线的同款元素） -->
  <rect x="1104" y="330" width="6" height="224" fill="${ACCENT}"/>
  <!-- 底部：品牌行 + slogan -->
  <text x="84" y="520" font-family="'JetBrains Mono','Cascadia Mono',Consolas,monospace"
        font-size="26" letter-spacing="12" fill="${BONE}">UNVESSEL / 不器</text>
  <text x="84" y="566" font-family="'Microsoft YaHei','PingFang SC',sans-serif"
        font-size="22" fill="${SMOKE}">愿被看见，不被定义</text>
</svg>`;
}

// ------------------------------------------------------------
// 主流程：确保目录 → 逐篇生成 → 清理陈旧产物 → 汇报
// ------------------------------------------------------------

fs.mkdirSync(OUT_DIR, { recursive: true });

const generated = [];
for (const a of articles) {
  const title = String(a.main.data.title ?? '').trim() || '无题';
  const pub = new Date(a.main.data.pubDate);
  const svg = postSvg({ no: a.no, date: fmtDate(pub), title });
  const file = path.join(OUT_DIR, `${a.uid}.png`);
  await sharp(Buffer.from(svg), { density: 72 }).png().toFile(file);
  generated.push(a.uid);
}

// 清理陈旧产物：文章删除 / uid 变更后，目录里不再对应的 PNG 一并清掉，
// 避免 public 里积攒幽灵分享图
const stale = fs
  .readdirSync(OUT_DIR)
  .filter((f) => f.endsWith('.png') && !generated.includes(f.replace(/\.png$/, '')));
for (const f of stale) fs.unlinkSync(path.join(OUT_DIR, f));

console.log(`✓ 已生成 ${generated.length} 张动态 OG 分享图 → public/og/（${generated.join(', ')}）`);
if (stale.length) console.log(`· 清理陈旧产物 ${stale.length} 张（${stale.join(', ')}）`);
