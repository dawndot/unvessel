// ============================================================
// feed.xml — RSS 订阅源（英文版，产出到 /en/feed.xml）
// ============================================================
// 与中文版（src/pages/feed.xml.ts）共用同一构建器 buildFeed，
// 仅语言列不同：
//   - 标题 / 描述取 en 品牌文案（unvessel / Seen, not defined.）；
//   - 收录文章 = en 站展示列表（getDisplayPosts('en')）：有英文配稿的
//     用英文标题与描述，暂无译文的回退中文标题（与 en 站页面回退
//     行为一致，订阅端所见即所得）；
//   - 链接一律指向英文站详情页 /en/posts/<uid>/。
// <head> alternate 与英文站页脚的 RSS 入口指向本文件产物。
// ============================================================

import type { APIContext } from 'astro';
import { buildFeed } from '../../lib/feed';

export async function GET(context: APIContext) {
  return buildFeed(context, 'en');
}
