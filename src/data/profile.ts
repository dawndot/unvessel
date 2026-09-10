// ============================================================
// profile.ts — 站点档案（关于页 / 页脚 / 统计面板的唯一数据源）
// ============================================================
// 与 site.ts 的分工：
//   site.ts    = 外部服务开关（Giscus / Upstash，未配置 = 功能不存在）
//   profile.ts = 站点自身的身份信息（建站日期、联络方式、社交链接）
// 修改联络方式只改这里，页脚、关于页、RSS 等全部同步。
// ============================================================

export const PROFILE = {
  /** 站名 / 中文名 / slogan（与 title 模板保持一致的口径） */
  name: 'unvessel',
  zhName: '不器',
  slogan: '愿被看见，不被定义',

  /** 建站日期（站点统计「已运行 N 天」的起点） */
  founded: '2026-09-09',

  /** 联络邮箱（页脚 / 关于页 / mailto 链接） */
  email: 'hi@unvessel.me',

  /**
   * 社交链接（可选）：留空字符串 = 该入口不渲染（同一「未配置即不存在」契约）。
   * 填入完整 URL 后页脚与关于页自动出现对应入口。
   */
  links: {
    github: '', // 例：'https://github.com/dawndot'
    rss: '/feed.xml', // RSS 恒定可用，不留空
  },
} as const;

/** 建站至今天数（含建站当天，最小为 1） */
export function daysSinceFounded(now: Date = new Date()): number {
  const start = new Date(`${PROFILE.founded}T00:00:00+08:00`);
  const ms = now.getTime() - start.getTime();
  return Math.max(1, Math.floor(ms / 86_400_000) + 1);
}
