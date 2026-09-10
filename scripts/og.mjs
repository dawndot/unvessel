// ============================================================
// og.mjs — 全站默认 OG 分享图生成器
// ============================================================
// 产出：public/og-default.png（1200×630，微信/Twitter/Telegram 转链卡片用）。
// 实现方式：手写 SVG（站点视觉：渊底黑 + 骨白巨字 + 朱砂唯一彩色）
// → sharp 栅格化为 PNG。
//
// 用法：node scripts/og.mjs
// 何时跑：仅在品牌视觉（文案/配色/排版）变更时手动执行一次，
// 产物 og-default.png 直接入库——构建流水线不依赖本脚本，
// 也不依赖生成机器上的字体（一次生成，永久定格）。
//
// 字体说明：SVG 内按「Noto Serif SC → SimSun（宋体）→ serif」降级，
// 在本机生成时即由系统字体栅格化，之后与运行环境无关。
// ============================================================

import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** 项目根（scripts/ 的上一级） */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 画布尺寸：OG 图业界标准 1200×630（与 Base.astro 里的 og:image:width/height 对应） */
const W = 1200;
const H = 630;

/** 色板：与 src/styles/global.css 的 :root 变量保持一致 */
const VOID = '#070707'; // 渊底：页面背景色
const BONE = '#f2f0ea'; // 骨白：主文字色
const SMOKE = '#8a8781'; // 烟灰：次级文字色
const ACCENT = '#ff3b2f'; // 朱砂：全站唯一彩色

// —— SVG 稿：竖向三段式（锚点行 → 巨字 → 底部信息），网格与站内顶栏同源 ——
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <!-- 渊底 -->
  <rect width="${W}" height="${H}" fill="${VOID}"/>

  <!-- 顶部：朱砂方点（顶栏品牌锚同款）+ 等宽元信息行 -->
  <rect x="84" y="92" width="18" height="18" fill="${ACCENT}"/>
  <text x="118" y="108" font-family="'JetBrains Mono','Cascadia Mono',Consolas,monospace"
        font-size="22" letter-spacing="6" fill="${SMOKE}">UNVESSEL — EST.2026</text>

  <!-- 巨字：不器（宋体重墨，与站内沉底巨字同气质） -->
  <text x="70" y="420" font-family="'Noto Serif SC','SimSun',serif"
        font-weight="900" font-size="290" fill="${BONE}">不器</text>

  <!-- 右下：朱砂竖杆（站内「不被定义」删除线的同款元素） -->
  <rect x="1104" y="330" width="6" height="224" fill="${ACCENT}"/>

  <!-- 底部：系列名 + slogan -->
  <text x="84" y="520" font-family="'JetBrains Mono','Cascadia Mono',Consolas,monospace"
        font-size="26" letter-spacing="12" fill="${BONE}">UNVESSEL / 不器</text>
  <text x="84" y="566" font-family="'Microsoft YaHei','PingFang SC',sans-serif"
        font-size="22" fill="${SMOKE}">愿被看见，不被定义</text>
</svg>`;

// 栅格化并写盘（dense 适配：SVG 文字渲染保持锐利）
await sharp(Buffer.from(svg), { density: 72 })
  .png()
  .toFile(path.join(ROOT, 'public', 'og-default.png'));

console.log('✓ 已生成 public/og-default.png（1200×630，站点视觉）');
