// ============================================================
// 内容集合定义 — unvessel / 不器
// ============================================================
// 这是「AI 自动运营接口」的第一层：文件即接口。
// src/content/posts/ 下每篇 *.md 都是一篇文章，
// frontmatter 必须满足下面 zod schema——Astro 构建时自动校验，
// 写错字段会导致 build 失败并给出明确报错（这就是校验闭环）。
//
// AI Agent 有两条写文章的路径，殊途同归于本 schema：
//   1. MCP 工具 new_post / CLI `npm run new`（有模板兜底，推荐）
//   2. 直接写 markdown 文件（自由度高，build 校验兜底）
// 详见 docs/AI-OPS.md。
// ============================================================

import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  // glob loader：扫描 src/content/posts 下全部 markdown
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    /** 标题：列表页巨字 + <title> + RSS */
    title: z.string().min(1, '文章必须有标题'),
    /** 一句话摘要：列表行 sub + 文章页导语 + SEO description */
    description: z.string().min(1, '文章必须有一句话摘要'),
    /** 发布日期：ISO 字符串即可，zod 自动转 Date */
    pubDate: z.coerce.date(),
    /** 标签：可空；列表页与文章页展示用 */
    tags: z.array(z.string()).default([]),
    /** 草稿开关：true 时不出现在列表/RSS/构建产物 */
    draft: z.boolean().default(false),
    /** 语言标记：为将来中英双语留位（默认中文） */
    lang: z.enum(['zh', 'en']).default('zh'),
    /**
     * 精选标记：true 时进入首页「精选」区（FEATURED）。
     * 与「热门」的分工：精选是编辑意志（手动钉选），
     * 热门是阅读量排序（Upstash 计数点亮后接管排序位）；未配置计数时精选即头部位。
     */
    featured: z.boolean().default(false),
    /**
     * 置顶：true 时在首页「最新文章」与 /posts/ 列表置顶显示
     * （排序优先于发布日期；多篇置顶时彼此仍按日期倒序）。
     * 与精选（featured）的分工：置顶管「排序位」，精选管「首页大卡位」，
     * 两者互斥使用也可以同时命中——互不干扰。
     */
    pinned: z.boolean().default(false),
    /**
     * 头图：站点绝对路径（如 /covers/xxx.png，放 public/ 下即可）。
     * 三处共用：首页精选大卡背景、文章页头图、og:image（分享卡片）。
     * 省略时三处各自优雅退化：精选退化为排版卡、文章页无头图、og 用全站默认图。
     */
    cover: z.string().optional(),
    /**
     * 短链 ID：文章 URL = /posts/<uid>/（如 /posts/k7m2xq/）。
     * 为什么不用文件名：中文站没有自然的英文 slug，文件名带日期冗余；
     * 为什么不用日期路径：URL 里的日期会让旧文显得过时（SEO 与分享双重减分）。
     * 取向对齐中文内容平台惯例（知乎 /p/<id>、掘金雪花 ID、B 站 BV 号）：
     * 随机短 ID 与内容解耦，标题改名、文件重命名都不破坏已分享出去的链接。
     * 省略时构建期用文件名哈希兜底（文件名不变则 URL 不变，见 src/lib/utils.ts）。
     * `unv new` / MCP new_post 会自动生成并写入，手写文章可不填。
     */
    uid: z
      .string()
      .regex(/^[a-z0-9]{4,12}$/, 'uid 只能是小写字母数字，长度 4-12')
      .optional(),
  }),
});

/**
 * 网站日志集合（src/content/logs/*.md）
 * 与文章的区别：日志是「站点自身的编年史」——建站、改版、功能上线、修复记录，
 * 短则一两句，长可带正文；它同时是写作热力图的数据源之一。
 * 运营方式与文章一致：直接写 md（或将来给 CLI 加 log 子命令），build 强校验。
 */
const logs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/logs' }),
  schema: z.object({
    /** 日志标题（一行话概括这次变化） */
    title: z.string().min(1, '日志必须有标题'),
    /** 发生日期（日志用 date 而非 pubDate，语义是「事件发生日」） */
    date: z.coerce.date(),
    /** 日志类型：站点（结构/部署）/ 写作（内容）/ 实验（视觉与交互探索） */
    kind: z.enum(['站点', '写作', '实验']).default('站点'),
    /** 草稿：true 时不进时间线与热力图 */
    draft: z.boolean().default(false),
  }),
});

/**
 * 灵感碎片集合（src/content/ideas/*.md）
 * 自留地板块的灵感区数据源：随手记的一句话、看到的东西、想留下的片段。
 * 与日志的区别：日志是「站点的编年史」，灵感是「个人的意识流」——
 * 没有标题、没有结构，只有内容和时间。
 * 运营主路径：CLI `unv idea "一句话"` 秒记（生成文件即上线）；
 * 也可直接写 md（build 强校验兜底）。不进 RSS，进全站 Pagefind 索引。
 */
const ideas = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/ideas' }),
  schema: z.object({
    /** 灵感内容：一句话或几句话（\n 换行，页面按 pre-line 展示） */
    text: z.string().min(1, '灵感必须有内容'),
    /** 记录日期（语义是「闪念发生日」） */
    date: z.coerce.date(),
    /** 心情 / 类型标记（可选）：任意短词，如「念头」「摘抄」「quotation」 */
    mood: z.string().optional(),
    /** 配图（可选）：站点绝对路径（放 public/ 下），如 /covers/xxx.png */
    image: z.string().optional(),
    /** 来源链接（可选）：「看到的东西」的出处 */
    link: z.string().optional(),
    /** 草稿：true 时不出现在时间线上 */
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts, logs, ideas };
