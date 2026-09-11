// ============================================================
// feed.xml — RSS 订阅源（中文版，产出到站点根 /feed.xml）
// ============================================================
// 构建时渲染为静态 /feed.xml（中文站页脚「RSS」与 <head> alternate
// 都指向它；英文站对应 /en/feed.xml，两份产物同源 buildFeed）。
// 数据源：getDisplayPosts('zh') —— 与中文列表页同一份排序与配对口径，
// 这意味着文章的收录入口只有 src/content/posts/*.md 一处，双壳
// （CLI/MCP）与手工写作殊途同归，RSS / 列表 / 搜索索引三者天然同步。
// ============================================================

import type { APIContext } from 'astro';
import { buildFeed } from '../lib/feed';

export async function GET(context: APIContext) {
  return buildFeed(context, 'zh');
}
