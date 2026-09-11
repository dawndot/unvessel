// ============================================================
// utils.ts — 站点小工具
// ============================================================
// 只放真正被多处复用的函数；避免过早抽象。
// ============================================================

import { createHash } from 'node:crypto';

/**
 * 日期 → 「2026.09.09」等宽展示格式
 * @param d 文章元数据里的 Date
 */
export function formatDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

/**
 * 日期 → 「2026-09-09」ISO 短格式（frontmatter 生成 / 归档用）
 */
export function isoDate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 短哈希：任意字符串 → 8 位小写 base36 摘要。
 * 只用于 uid 兜底（稳定性要求：同一输入永远同一输出），
 * 不承载安全语义，md5 足够。
 * @param s 输入字符串（文章场景 = 内容集合 id，即文件名）
 */
function shortHash(s: string): string {
  return createHash('md5').update(s).digest('hex').slice(0, 8);
}

/**
 * 文章 URL 片段：/posts/<这里>/。
 * 取值优先级：
 *   1. frontmatter 显式 uid（`unv new` 自动生成，或手写）；
 *   2. 文件名哈希兜底（无 uid 的手写文章也能拿到稳定短链，
 *      文件名不变则 URL 永不变——哈希输入是集合 id 而非正文）。
 * 全站所有链接生成处（列表/精选/RSS/计数）必须经此函数取值，
 * 保证路由（getStaticPaths）与各处锚点永远同源。
 *
 * 双语配对规则（2026-09-11 多语言改造）：
 * 英文稿文件名为 `<中文名>.en.md`，集合 id 是 `<中文名>.en`；
 * 哈希兜底前先剥掉 `.en` 后缀 —— 这样即使英文稿忘了显式写 uid，
 * 也与中文稿天然配对（同 uid → 同一篇文章的两个语言版本 → 同 URL 结构）。
 * @param post posts 集合条目
 */
export function postUid(post: { id: string; data: { uid?: string } }): string {
  if (post.data.uid) return post.data.uid;
  return shortHash(post.id.replace(/\.en$/, ''));
}
