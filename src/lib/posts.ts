// ============================================================
// posts.ts — 文章数据层：查询 / 排序 / 双语配对 / 档案号
// ============================================================
// 【为什么要有这一层】
// 全站读文章的地方有六处：首页（精选 + 最新）、/posts/ 列表、文章详情、
// RSS、关于页统计、热力图计数。此前各自 getCollection + sort，口径
// 写死在页面里；叠加多语言后还要多一层「双语配对 + 缺稿回退」，
// 再散落各处必然漂移。本模块把三个全局口径收拢为唯一实现：
//   1. 排序口径：置顶（pinned）永远最前，其后按发布日期倒序；
//   2. 档案号口径：按发布日期正序编号（001 = 最旧），跨页连续、
//      跨语言一致——中英两站的同一篇文章永远挂着同一个号；
//   3. 双语配对口径：同一篇文章 = 中文稿 + 英文稿（文件名 <名>.en.md），
//      经 postUid 配对（显式 uid 优先；哈希兜底时英文稿先剥掉 .en
//      后缀再算，因此即使忘了写 uid 也会与中文稿自动配对）。
//
// 【缺稿回退规则】
// 英文站每篇文章的位置以中文稿为底：有英文配稿就换成英文稿（标题 /
// 描述 / 正文全英文），没有就回退中文稿——页面层据
// `post.data.lang !== 站点语言` 识别回退稿并标注「〔in Chinese〕」。
// 反向同理（纯英文投稿在中文站以英文稿露出），任一语言站都不漏文章。
//
// 【一致性约定】（写入 docs/AI-OPS.md 的维护规范）
// 双语稿的 pubDate / pinned / tags / uid 应保持一致（以中文稿为准）。
// 排序与档案号取 pair 主稿（zh 优先）的元数据，所以即使英文稿的
// 日期手滑写错，中英两站的列表顺序与档案号也不会分叉。
// ============================================================

import { getCollection, type CollectionEntry } from 'astro:content';
import { postUid } from './utils';
import type { Lang } from '../i18n/ui';

/** posts 集合条目（页面组件间传值的统一类型） */
export type PostEntry = CollectionEntry<'posts'>;

/** 同一篇文章的双语稿对：uid 相同即同一篇；zh / en 至少存在一支 */
export interface PostPair {
  /** 文章短链 ID（列表 / 详情 / RSS 链接与阅读计数共用，见 utils.postUid） */
  uid: string;
  /** 中文稿（源语言；纯英文投稿时为 null） */
  zh: PostEntry | null;
  /** 英文稿（无译文时为 null） */
  en: PostEntry | null;
}

/**
 * 读取全部非草稿文章，按 uid 配对成双语对。
 * 配对规则与 utils.postUid 严格同源：
 *   - frontmatter 显式 uid 相同 → 同一篇；
 *   - 未写 uid 时文件名哈希兜底（英文稿 <名>.en 先剥后缀再哈希，
 *     与中文稿 <名> 结果天然一致 → 忘写 uid 也自动配对）。
 * 草稿无论哪支是草稿，整对都不出现（一篇文章不搞「英文可读中文草稿」
 * 的中间态——要改就整篇一起改）。
 */
export async function getPostPairs(): Promise<PostPair[]> {
  // 草稿过滤取「任意一支草稿即整对隐藏」：先按 uid 聚合，再整体剔除
  const posts = await getCollection('posts');

  // 桶：uid → 半成品 pair（插入顺序无关，排序统一在后做）
  const buckets = new Map<string, PostPair>();
  for (const post of posts) {
    const uid = postUid(post);
    const pair = buckets.get(uid) ?? { uid, zh: null, en: null };
    if (post.data.lang === 'en') pair.en = post;
    else pair.zh = post;
    buckets.set(uid, pair);
  }

  // 整对剔除：任一支是草稿 → 整篇下架（见上注释）
  return [...buckets.values()].filter((p) => {
    const drafts = [p.zh, p.en].filter((x) => x?.data.draft);
    return drafts.length === 0;
  });
}

/**
 * pair 主稿：排序与档案号取元数据用的「代表稿」。
 * 中文是源语言 → zh 优先；纯英文投稿回退 en。
 */
function primaryOf(pair: PostPair): PostEntry {
  return (pair.zh ?? pair.en)!;
}

/**
 * 列表口径排序（就地修改）：置顶优先，其后发布日期倒序。
 * 元数据取 pair 主稿而非展示稿，保证中英列表位次永远一一对应。
 */
function sortPairsByListOrder(pairs: PostPair[]): void {
  pairs.sort((a, b) => {
    const pa = primaryOf(a);
    const pb = primaryOf(b);
    if (pa.data.pinned !== pb.data.pinned) return pa.data.pinned ? -1 : 1;
    return pb.data.pubDate.valueOf() - pa.data.pubDate.valueOf();
  });
}

/**
 * 展示列表：列表页 / 首页 / RSS 共用的取数入口。
 * @param lang 站点语言。返回的每一篇都是「该语言优先的展示稿」：
 *   - zh 站：中文稿（纯英文投稿回退英文稿）；
 *   - en 站：英文稿，无译文则回退中文稿（页面层标注「〔in Chinese〕」）。
 * 顺序 = 置顶优先 + 日期倒序；中英两站同一位次是同一篇文章。
 */
export async function getDisplayPosts(lang: Lang): Promise<PostEntry[]> {
  const pairs = await getPostPairs();
  sortPairsByListOrder(pairs);
  return pairs.map((p) => (lang === 'en' ? (p.en ?? p.zh) : (p.zh ?? p.en))!);
}

/**
 * 档案号表：按发布日期正序编号（001 = 最旧）。
 * 返回 Map<uid, 序号> —— key 用 uid 而非集合 id，因为同一篇文章的中英
 * 两支稿 id 不同（<名> 与 <名>.en），只有 uid 全站唯一。
 * 全站编号（列表页 FILE 001 / 详情页 FILE 003 / RSS）一律查这张表。
 */
export async function getChronoNos(): Promise<Map<string, number>> {
  const pairs = await getPostPairs();
  // 编号只看日期正序位次，与置顶无关（置顶只影响显示位，不改号）
  const chrono = [...pairs].sort(
    (a, b) => primaryOf(a).data.pubDate.valueOf() - primaryOf(b).data.pubDate.valueOf(),
  );
  return new Map(chrono.map((p, i) => [p.uid, i + 1]));
}

/**
 * 详情页上一篇 / 下一篇：在展示列表（日期倒序）里找当前文章的左右邻。
 * @param list 展示列表（getDisplayPosts 的返回值，已是倒序）
 * @param uid  当前文章 uid
 * @returns newer = 更新一篇（列表左邻）；older = 更早一篇（列表右邻）。
 *          首末篇缺侧返回 null，页面层据此省略对应导航卡。
 */
export function neighborsOf(
  list: PostEntry[],
  uid: string,
): { newer: PostEntry | null; older: PostEntry | null } {
  const pos = list.findIndex((p) => postUid(p) === uid);
  if (pos < 0) return { newer: null, older: null };
  return {
    newer: pos > 0 ? list[pos - 1] : null,
    older: pos < list.length - 1 ? list[pos + 1] : null,
  };
}
