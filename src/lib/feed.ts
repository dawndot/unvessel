// ============================================================
// feed.ts — RSS 订阅源共享构建器（中英双语各产一份）
// ============================================================
// 设计：RSS / 列表 / 搜索索引三者必须同源同步——feed 与列表页共用
// 同一个数据入口 getDisplayPosts(lang)，收录口径永远一致：
//   - 收录范围：全部非草稿文章（与列表页同序，置顶优先 + 日期倒序）；
//   - 标题 / 描述：该语言的展示稿（en 站无译文的文章回退中文标题，
//     与 en 站页面行为一致，订阅端看到什么语言一目了然）；
//   - 链接：指向对应语言站的详情页（zh → /posts/<uid>/，
//     en → /en/posts/<uid>/），短链 ID 双语一致（postUid）。
// 页面层只写两行端点（feed.xml.ts / en/feed.xml.ts），逻辑全在此处，
// 避免双份实现漂移。
// ============================================================

import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getDisplayPosts } from './posts';
import { postUid } from './utils';
import { ui, rssLocale, localePath, type Lang } from '../i18n/ui';

/**
 * 构建一份 RSS 响应。
 * @param context Astro 端点上下文（提供 site 域名，@astrojs/rss 据此补全绝对链接）
 * @param lang    feed 语言（决定标题 / 描述 / 链接前缀 / <language> 声明）
 */
export async function buildFeed(context: APIContext, lang: Lang) {
  const t = ui[lang];
  // 与列表页完全同一份倒序逻辑（getDisplayPosts 内部处理配对 + 回退）
  const posts = await getDisplayPosts(lang);

  return rss({
    // 站点标识：与 Base.astro / package.json 的品牌信息一致（跟语言走）
    title: t.brand.siteName,
    description: `${t.brand.slogan} — ${t.brand.siteName}`,
    // 正式域名，来自 astro.config.mjs 的 site（@astrojs/rss 据此补全链接）
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      // 链接口径与详情页一致：语言前缀 + /posts/<uid>/（短链 ID，同源 postUid）
      link: localePath(lang, `/posts/${postUid(post)}/`),
      categories: post.data.tags,
    })),
    // 声明主语言（阅读器据此决定排版/翻译提示）：zh-CN / en
    customData: `<language>${rssLocale[lang]}</language>`,
  });
}
