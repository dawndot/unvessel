// ============================================================
// utils.ts — 站点小工具
// ============================================================
// 只放真正被多处复用的函数；避免过早抽象。
// ============================================================

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
