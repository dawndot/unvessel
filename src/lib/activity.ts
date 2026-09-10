// ============================================================
// activity.ts — 写作活动聚合（热力图 + 站点统计的数据源）
// ============================================================
// 设计：博客的「贡献」就是写作本身。
// 文章（posts.pubDate）与日志（logs.date）的日期聚合成频次表，
// 再展开成 GitHub 式 53 周 × 7 天网格——每写一篇，对应格子自动点亮，
// 纯静态构建期计算，零脚本零请求。
// ============================================================

/** 单日活动数据 */
export interface ActivityDay {
  /** 本地日期键 YYYY-MM-DD */
  date: string;
  /** 当日产出数（文章 + 日志） */
  count: number;
  /** 强度等级 0-4（色阶用） */
  level: 0 | 1 | 2 | 3 | 4;
}

/** 一周（一列）：周一 → 周日 共 7 格；范围外的前导日为 null */
export type ActivityWeek = (ActivityDay | null)[];

export interface Activity {
  /** 网格列（每列一周） */
  weeks: ActivityWeek[];
  /** 总产出篇数 */
  total: number;
  /** 有产出的天数 */
  activeDays: number;
  /** 月份刻度：{ col: 列索引, label: '1月' }（每月第一个完整周标注） */
  monthLabels: { col: number; label: string }[];
}

/**
 * 本地时区日期键（手动拼接，避免 toISOString 的 UTC 偏移把晚上八点算成明天）
 */
export function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 计数 → 强度等级（绝对阈值，可解释：1 篇起亮，7 篇封顶朱砂） */
function levelOf(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

/**
 * 把一批日期聚合成最近 weeks 周的活动网格（周一开始，对齐中文习惯）。
 * @param dates 文章 pubDate + 日志 date 的并集
 * @param weeks 列数，默认 53（约一年）
 */
export function buildActivity(dates: Date[], weeks = 53, now: Date = new Date()): Activity {
  // 1. 频次表
  const freq = new Map<string, number>();
  for (const d of dates) {
    const k = dateKey(d);
    freq.set(k, (freq.get(k) ?? 0) + 1);
  }

  // 2. 窗口：今天所在周的周日为终点，往前推 weeks 周
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // getDay(): 周日=0 … 周六=6；周一为一周起点 → 偏移 (getDay()+6)%7
  const endOffset = (end.getDay() + 6) % 7; // 今天距本周一的天数
  const start = new Date(end);
  start.setDate(start.getDate() - endOffset - (weeks - 1) * 7); // 窗口首列的周一

  // 3. 展开网格
  const grid: ActivityWeek[] = [];
  const monthLabels: { col: number; label: string }[] = [];
  let total = 0;
  let activeDays = 0;
  let lastMonth = -1;

  for (let w = 0; w < weeks; w++) {
    const week: ActivityWeek = [];
    for (let dow = 0; dow < 7; dow++) {
      const cur = new Date(start);
      cur.setDate(start.getDate() + w * 7 + dow);
      if (cur > end) {
        week.push(null); // 未来日期：留空
        continue;
      }
      const k = dateKey(cur);
      const count = freq.get(k) ?? 0;
      total += count;
      if (count > 0) activeDays++;
      // 月份刻度：该列第一天（周一）进入新月时标注
      if (dow === 0 && cur.getMonth() !== lastMonth) {
        monthLabels.push({ col: w, label: `${cur.getMonth() + 1}月` });
        lastMonth = cur.getMonth();
      }
      week.push({ date: k, count, level: levelOf(count) });
    }
    grid.push(week);
  }

  return { weeks: grid, total, activeDays, monthLabels };
}

/**
 * 中文字数统计（站点统计面板用）：
 * CJK 字符逐字计 + 拉丁词按空白计；剔除 markdown 常见符号噪声。
 */
export function countWords(text: string): number {
  const stripped = text
    .replace(/```[\s\S]*?```/g, ' ') // 代码块不计入正文字数
    .replace(/[#>*`\-\[\]()!|]/g, ' '); // markdown 语法符
  const cjk = (stripped.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) ?? []).length;
  const latin = (stripped.match(/[a-zA-Z0-9]+/g) ?? []).length;
  return cjk + latin;
}
