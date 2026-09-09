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
  }),
});

export const collections = { posts };
