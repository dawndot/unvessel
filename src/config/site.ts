// ============================================================
// config/site.ts — 可选外部服务的集中配置（占位开关）
// ============================================================
// 设计原则：
// 1. 所有需要人工申请 / 注册的外部服务（Giscus 评论、Upstash 阅读量…）
//    配置集中于此，一处申请、一处填入，组件零改动；
// 2. 未配置（字段为空串）= 功能不存在：对应组件在构建期直接不渲染，
//    产物里零 DOM、零脚本、零请求 —— 严格纯静态，而非运行时隐藏；
// 3. 启用步骤：填好本文件 → 重跑 npm run build 即生效（见 docs/AI-OPS.md）。
// ============================================================

/** Giscus 评论系统（基于 GitHub Discussions，配置生成器：giscus.app） */
export const GISCUS = {
  /** 仓库全名，如 'dawndot/unvessel'（仓库须已开启 Discussions 功能） */
  repo: '',
  /** giscus.app 生成的 repoId（data-repo-id） */
  repoId: '',
  /** Discussions 分类名，建议 'Announcements'（仅维护者可发帖，防灌水） */
  category: 'Announcements',
  /** giscus.app 生成的 categoryId（data-category-id） */
  categoryId: '',
  /** 评论与页面的映射方式：pathname = 按路径一一对应（文章路径即讨论锚点） */
  mapping: 'pathname',
  /** 主题：transparent_dark 透明底暗色，贴合站点纯黑画布 */
  theme: 'transparent_dark',
  /** 评论界面语言 */
  lang: 'zh-CN',
} as const;

/** Giscus 是否已配置：四要素齐全才启用（缺一即整站不渲染评论区） */
export const giscusEnabled = Boolean(
  GISCUS.repo && GISCUS.repoId && GISCUS.category && GISCUS.categoryId
);

/** 阅读量 / 点赞 API 端点（Vercel Serverless + Upstash Redis，实现见 /api/metrics.ts） */
export const METRICS_API = '/api/metrics';

/** 点赞本地记忆的 localStorage 键前缀（防重复点赞：前缀 + 文章 slug） */
export const METRICS_LS_PREFIX = 'unvessel:liked:';
