// ============================================================
// feed.xml — RSS 订阅源
// ============================================================
// 构建时渲染为静态 /feed.xml（页脚「RSS」与 <head> alternate 都指向它）。
// 数据源：posts 集合（与列表页同一份倒序逻辑，草稿自动排除）——
// 这意味着文章的收录入口只有 src/content/posts/*.md 一处，双壳（CLI/MCP）
// 与手工写作殊途同归，RSS / 列表 / 搜索索引三者天然同步。
// ============================================================

import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  // 全部正式文章，倒序（与 posts/index.astro 保持同一排序口径）
  const posts = (await getCollection('posts', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
  );

  return rss({
    // 站点标识：与 Base.astro / package.json 的品牌信息一致
    title: 'unvessel / 不器',
    description: '愿被看见，不被定义 — INK VOID / 墨渊',
    // 正式域名，来自 astro.config.mjs 的 site（@astrojs/rss 据此补全链接）
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      // 链接口径与 posts/[...slug].astro 一致：/posts/<文件名>/
      link: `/posts/${post.id}/`,
      categories: post.data.tags,
    })),
    // 声明主语言为简体中文（阅读器据此决定排版/翻译提示）
    customData: '<language>zh-CN</language>',
  });
}
