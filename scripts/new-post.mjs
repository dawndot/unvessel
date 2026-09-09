#!/usr/bin/env node
// ============================================================
// new-post.mjs — 新建文章 CLI（npm run new）
// ============================================================
// 用法：
//   npm run new "文章标题"
//   npm run new "文章标题" -- --desc "一句话摘要" --tags 随笔,读书 --slug my-post
//   npm run new "文章标题" -- --publish   （直接设为发布态，默认草稿）
//
// 薄壳原则：本文件只做参数解析与人类可读输出，
// 核心逻辑全部在 scripts/lib/ops.mjs（与 MCP 工具共享）。
// ============================================================

import { createPost } from './lib/ops.mjs';

// ---- 极简 argv 解析（不引依赖）----
// 形如：node new-post.mjs "标题" --desc x --tags a,b --slug y --publish
const args = process.argv.slice(2);
const title = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));

const getFlag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (!title) {
  console.log(`用法：
  npm run new "文章标题"
  npm run new "文章标题" -- --desc "一句话摘要" --tags 标签1,标签2 --slug 自定义slug
  npm run new "文章标题" -- --publish      # 直接发布态（默认草稿）
`);
  process.exit(1);
}

try {
  const { file, path } = createPost({
    title,
    description: getFlag('desc') || '',
    tags: (getFlag('tags') || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    draft: !args.includes('--publish'),
    slug: getFlag('slug'),
  });
  console.log(`已创建：${file}`);
  console.log(`路径：${path}`);
  console.log(`下一步：编辑内容 → npm run build 校验 → git push（Vercel 自动部署）`);
} catch (err) {
  console.error(`失败：${err.message}`);
  process.exit(1);
}
