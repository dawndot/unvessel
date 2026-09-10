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
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import matter from 'gray-matter';

/**
 * 包根（本文件位于 scripts/lib/，上两级即包根）。
 * npm link 全局安装时，Node 默认解析 symlink 真实路径，
 * 此值仍指向项目本体，可作为项目根的兜底来源。
 */
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * 从指定目录向上探测 unvessel 项目根（Hexo 同款机制）。
 * 全局命令不知道博客在哪，靠「当前工作目录」定位：
 * 逐级向上查找标志文件 astro.config.mjs，找到即项目根；到顶都没有则返回 null。
 * @param {string} [start] 起始目录，默认 process.cwd()
 * @returns {string | null}
 */
export function resolveRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'astro.config.mjs'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null; // 已到文件系统根
    dir = parent;
  }
}

/**
 * 项目根，三级取值：
 *   1. 环境变量 UNVESSEL_ROOT（MCP/CI 显式指定，最高优先）
 *   2. cwd 向上探测（全局 unv 命令的主路径：在博客任意子目录内都能用）
 *   3. 包相对路径兜底（npm run 项目内脚本 / npm link symlink 解析）
 */
export const ROOT = process.env.UNVESSEL_ROOT || resolveRoot() || PKG_ROOT;

/** 文章目录：文件即接口的第一层 */
export const POSTS_DIR = path.join(ROOT, 'src', 'content', 'posts');

/** 灵感目录：自留地「念头」区，与 posts 同层（文件即接口） */
export const IDEAS_DIR = path.join(ROOT, 'src', 'content', 'ideas');

/**
 * 生成 6 位短链 ID（文章 URL = /posts/<uid>/）。
 * 字符集：小写字母 + 数字去掉易混淆的 0/1/l/o（口述与手抄不出错）。
 * 空间：32^6 ≈ 10^9，个人博客量级碰撞概率可忽略；createPost 会再查重。
 * @returns {string} 如 'k7m2xq'
 */
export function genUid() {
  const alphabet = '23456789abcdefghjkmnpqrstuvwxyz';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += alphabet[randomBytes(1)[0] % alphabet.length];
  }
  return out;
}

/**
 * 列出全部文章（含草稿）。
 * @returns {{ file: string, slug: string, uid: string, title: string, description: string,
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
        // 短链 ID：发布后的 URL = /posts/<uid>/（无 uid 的老文构建期哈希兜底）
        uid: String(data.uid ?? '(构建期哈希)'),
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
  // uid：短链 ID，发布链接 = /posts/<uid>/，与文件名解耦（改名不断链）。
  // 查重：与既有文章 uid 撞了就重生成（个人博客量级几乎不会发生，防御性兜底）。
  const existingUids = new Set(
    fs.existsSync(POSTS_DIR)
      ? fs
          .readdirSync(POSTS_DIR)
          .filter((f) => f.endsWith('.md'))
          .flatMap((f) => {
            const { data } = matter(fs.readFileSync(path.join(POSTS_DIR, f), 'utf-8'));
            return data.uid ? [String(data.uid)] : [];
          })
      : []
  );
  let uid = genUid();
  while (existingUids.has(uid)) uid = genUid();

  const front = matter.stringify(
    '\n在这里开始写作。这一段会成为列表页的摘要预览。\n\n## 小标题\n\n正文……\n',
    {
      title: String(title),
      // description 为空时给占位文案，避免 zod min(1) 校验失败
      description: String(description || '（一句话摘要：写完记得替换）'),
      pubDate: `${datePrefix}T12:00:00+08:00`,
      tags: tags.map(String),
      draft: Boolean(draft),
      uid,
    }
  );

  fs.mkdirSync(POSTS_DIR, { recursive: true });
  fs.writeFileSync(filePath, front, 'utf-8');
  return { file: fileName, path: filePath, uid };
}

/**
 * 记一条灵感（自留地「念头」区，落盘即上线）。
 * 与 createPost 的差异：
 *   - 无标题/正文之分：text 是唯一内容，存 frontmatter（页面按纯文本渲染，不走 markdown）；
 *   - 文件名 = 精确到秒的时间戳（灵感没有标题可做 slug，时间即名字）；
 *     同一秒连记多条时自动追加 -2/-3 后缀而非报错——秒记不应被打断。
 * @param {{ text: string, mood?: string, image?: string, link?: string,
 *   draft?: boolean }} input
 * @returns {{ file: string, path: string }} 生成的文件名与绝对路径
 */
export function createIdea({ text, mood = '', image = '', link = '', draft = false }) {
  // ---- 必填校验（MCP/CLI 共用同一套报错文案） ----
  if (!text || !String(text).trim()) {
    throw new Error('缺少 text：灵感必须有内容');
  }

  // ---- 文件名：YYYY-MM-DD-HHmmss.md（按文件名排序即按时间排序） ----
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  let fileName = `${stamp}.md`;
  let seq = 2;
  while (fs.existsSync(path.join(IDEAS_DIR, fileName))) {
    fileName = `${stamp}-${seq++}.md`;
  }

  // ---- frontmatter：与 src/content.config.ts 的 ideas zod schema 对齐 ----
  // 可选字段仅在传值时写入，空字段不落盘，保持文件干净；
  // date 用 UTC ISO 时刻（绝对时间无歧义），页面渲染时转本地时区。
  const front = matter.stringify(
    '', // 正文留空：灵感内容全部在 frontmatter.text
    {
      text: String(text),
      date: d.toISOString(),
      ...(mood && { mood: String(mood) }),
      ...(image && { image: String(image) }),
      ...(link && { link: String(link) }),
      draft: Boolean(draft),
    }
  );

  fs.mkdirSync(IDEAS_DIR, { recursive: true });
  const filePath = path.join(IDEAS_DIR, fileName);
  fs.writeFileSync(filePath, front, 'utf-8');
  return { file: fileName, path: filePath };
}

/**
 * 草稿转发布：把目标文章的 frontmatter `draft: true` 改为 `false`。
 * 匹配策略（宽松，方便人肉输入）：
 *   1. 完整 slug 精确匹配（文件名去掉 .md，如 2026-09-10-my-note）
 *   2. 短 slug 后缀匹配（只输入 my-note，匹配日期前缀文件名）
 *   3. 子串包含匹配（最后兜底）
 * @param {string} slug 用户输入的 slug 或文件名片段
 * @returns {{ file: string, changed: boolean }} 命中的文件名与是否发生改动
 */
export function publishPost(slug) {
  if (!slug || !String(slug).trim()) {
    throw new Error('用法：unv publish <slug>（用 unv list 查看文章 slug）');
  }
  const key = String(slug).trim();
  const files = fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();
  const stem = (f) => f.replace(/\.md$/, '');
  const hit =
    files.find((f) => stem(f) === key) ||
    files.find((f) => stem(f).endsWith(`-${key}`)) ||
    files.find((f) => f.includes(key));
  if (!hit) {
    throw new Error(`找不到文章：${key}（用 unv list 查看现有文章的 slug）`);
  }

  const filePath = path.join(POSTS_DIR, hit);
  const parsed = matter(fs.readFileSync(filePath, 'utf-8'));
  if (!parsed.data.draft) {
    return { file: hit, changed: false }; // 本就是发布态：幂等返回
  }
  parsed.data.draft = false;
  // gray-matter stringify：正文原样保留，仅更新 frontmatter
  fs.writeFileSync(filePath, matter.stringify(parsed.content, parsed.data), 'utf-8');
  return { file: hit, changed: true };
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
