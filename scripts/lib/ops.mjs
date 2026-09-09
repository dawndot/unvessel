// ============================================================
// ops.mjs — unvessel 运营核心逻辑（单一实现源）
// ============================================================
// 这是「AI 自动运营接口」的第二层：核心函数。
// 三类调用方共享这里的实现，保证行为一致：
//   1. CLI      scripts/new-post.mjs（npm run new）
//   2. MCP      scripts/mcp-server.mjs（AI Agent 工具面）
//   3. 人肉     直接写 markdown 文件（文件即接口，第一层）
//
// 设计原则：
//   - 本文件不做任何交互（无 readline / console 提问），
//     只提供可被编程调用的纯函数，错误一律 throw（带中文说明）；
//   - frontmatter 解析用 gray-matter，与 Astro 的 zod 校验互补：
//     这里负责「操作前的读写」，astro build 负责「最终校验」。
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import matter from 'gray-matter';

/** 项目根（scripts/lib/ops.mjs → 上两级） */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 文章目录：文件即接口的第一层 */
export const POSTS_DIR = path.join(ROOT, 'src', 'content', 'posts');

/**
 * 列出全部文章（含草稿）。
 * @returns {{ file: string, slug: string, title: string, description: string,
 *   pubDate: string, tags: string[], draft: boolean }[]} 按发布日期倒序
 */
export function listPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  const posts = fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const filePath = path.join(POSTS_DIR, file);
      const { data } = matter(fs.readFileSync(filePath, 'utf-8'));
      return {
        file,
        slug: file.replace(/\.md$/, ''),
        title: String(data.title ?? '(无标题)'),
        description: String(data.description ?? ''),
        pubDate: data.pubDate ? new Date(data.pubDate).toISOString().slice(0, 10) : '',
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        draft: Boolean(data.draft),
      };
    });
  // 倒序：最新的在前
  return posts.sort((a, b) => (a.pubDate < b.pubDate ? 1 : -1));
}

/**
 * 生成 URL slug：
 * ASCII 标题 → 小写连字符；含中文 → 时间戳兜底（不引拼音依赖）。
 * @param {string} title
 */
export function slugify(title) {
  if (/^[\x20-\x7E]+$/.test(title)) {
    return (
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || `post-${Date.now()}`
    );
  }
  // 中文标题：用日期时间做 slug，保证可读且不冲突
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `post-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/**
 * 创建一篇新文章（默认草稿）。
 * @param {{ title: string, description?: string, tags?: string[],
 *   draft?: boolean, slug?: string }} input
 * @returns {{ file: string, path: string }} 生成的文件名与绝对路径
 */
export function createPost({ title, description = '', tags = [], draft = true, slug }) {
  // ---- 必填校验（MCP/CLI 共用同一套报错文案） ----
  if (!title || !String(title).trim()) {
    throw new Error('缺少 title：文章必须有标题');
  }
  const finalSlug = slug || slugify(title);

  // ---- 文件名：日期前缀保证按名排序即按时间排序 ----
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const datePrefix = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const fileName = `${datePrefix}-${finalSlug}.md`;
  const filePath = path.join(POSTS_DIR, fileName);
  if (fs.existsSync(filePath)) {
    throw new Error(`文件已存在：${fileName}（换一个 slug，或直接编辑该文件）`);
  }

  // ---- frontmatter：与 src/content.config.ts 的 zod schema 对齐 ----
  const front = matter.stringify(
    '\n在这里开始写作。这一段会成为列表页的摘要预览。\n\n## 小标题\n\n正文……\n',
    {
      title: String(title),
      // description 为空时给占位文案，避免 zod min(1) 校验失败
      description: String(description || '（一句话摘要：写完记得替换）'),
      pubDate: `${datePrefix}T12:00:00+08:00`,
      tags: tags.map(String),
      draft: Boolean(draft),
    }
  );

  fs.mkdirSync(POSTS_DIR, { recursive: true });
  fs.writeFileSync(filePath, front, 'utf-8');
  return { file: fileName, path: filePath };
}

/**
 * 构建站点（同步）。
 * astro build 会用 content.config.ts 的 zod schema 校验全部文章，
 * 校验失败 = 构建失败——这是 AI 运营的最终校验闭环。
 * @param {{ timeout?: number }} [opts]
 * @returns {{ ok: boolean, output: string }} 结果与合并输出（截断到尾部 8KB）
 */
export function buildSite({ timeout = 180_000 } = {}) {
  const res = spawnSync('npm', ['run', 'build'], {
    cwd: ROOT,
    shell: true, // Windows 下 npm 需要 shell
    encoding: 'utf-8',
    timeout,
  });
  const output = `${res.stdout ?? ''}\n${res.stderr ?? ''}`.trim();
  return { ok: res.status === 0, output: output.slice(-8000) };
}
