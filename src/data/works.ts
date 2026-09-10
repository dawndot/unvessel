// ============================================================
// works.ts — 作品集数据（/works 页面唯一数据源）
// ============================================================
// 「文件即接口」在作品集的体现：加一件作品 = 在 WORKS 数组加一条 + build。
// 状态机：building（在建，呼吸点）→ live（上线，朱砂 ◆）→ archive（归档，烟灰）。
//
// 链接纪律（重要）：卡片只在有「真实目标」时才可点。
//   - url：站外真实地址（GitHub 仓库、线上站点、发布会页…），新标签打开；
//   - href：站内真实页面（比如作品正好是本站的某个功能页）；
//   - 两者都没有 → 留空：卡片纯展示，绝不塞一个「随便什么文章」凑数——
//     点开作品却落到一篇不相干的文章，比点不开更糟糕。
// ============================================================

export type WorkStatus = 'live' | 'building' | 'archive';

export interface Work {
  /** 作品名 */
  title: string;
  /** 年份（等宽字展示） */
  year: string;
  /** 状态：live 上线 / building 在建 / archive 归档 */
  status: WorkStatus;
  /** 一句话说明（做了什么、技术要点） */
  desc: string;
  /** 技术 / 形式标签 */
  tags: string[];
  /** 站内链接（可选；与 url 二选一，只在指向真实页面时填） */
  href?: string;
  /** 站外链接（可选；与 href 二选一，只在有真实外链时填） */
  url?: string;
}

export const WORK_STATUS_LABEL: Record<WorkStatus, string> = {
  live: '上线',
  building: '在建',
  archive: '归档',
};

export const WORKS: Work[] = [
  {
    title: 'unvessel 不器',
    year: '2026',
    status: 'live',
    desc: '你正在看的这个博客。纯黑视觉系统、原生 WebGL 流体墨背景、ClientRouter 跨页不闪；三层一体 AI 运营接口（zod schema / ops.mjs 单一实现源 / CLI 全局命令 unv + MCP 双壳）；Pagefind 中文搜索、SEO 全套、字体自托管。',
    tags: ['Astro', 'WebGL', '设计系统', 'MCP'],
    // 无外链：作品即本站本身，卡片保持纯展示（站内点进来已经是它了）
  },
  {
    title: '五稿设计实验',
    year: '2026',
    status: 'archive',
    desc: '开建前的五套完全异质的概念稿：纸·墨·朱（宣纸文艺）、纯黑巨字稿（最终选定）、未器之城 CLAYVERSE（Three.js 黏土 3D）、不器工房 ATELIER（AE86 海报像素印刷）、不器 QUEST（炫彩 16-bit RPG）。全部零依赖静态活稿，归档于 design/。',
    tags: ['概念设计', '视觉', 'Three.js', '像素'],
    // 无外链：设计稿在仓库 design/ 目录内，未部署成线上页面
  },
  {
    title: 'unv 全局命令行',
    year: '2026',
    status: 'live',
    desc: 'Hexo 式博客运营命令：unv new / list / publish / dev / build / preview。项目根自动探测（任意子目录可用）、草稿状态机、幂等发布、短链 uid 自动生成；与 MCP 工具面共享同一核心实现，行为永远一致。',
    tags: ['Node.js', 'CLI', 'DX'],
    // 有仓库后在这里补：url: 'https://github.com/<you>/unvessel'
  },
  // ── 新作品按此格式追加（building 状态会先出现在作品集，标注「在建」）──
  // {
  //   title: '下一件作品',
  //   year: '2026',
  //   status: 'building',
  //   desc: '……',
  //   tags: ['...'],
  //   url: 'https://...',   // 有真实外链才填；没有就整条省略，卡片纯展示
  // },
];
