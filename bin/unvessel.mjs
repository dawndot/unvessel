#!/usr/bin/env node
// ============================================================
// unvessel.mjs — 全局命令行入口（Hexo 式人肉运营命令）
// ============================================================
// 注册两个命令名（package.json bin 字段双注册，同一程序）：
//   unvessel  品牌全名
//   unv       3 字母短命令（日常主力，对齐 npx/pnpm 短命令传统）
//
// 本文件是「薄壳」：只做参数解析、命令分发、人肉可读输出；
// 全部业务逻辑复用 scripts/lib/ops.mjs（与 MCP 壳、npm run 壳同一实现源）。
//
// 项目根定位（Hexo 同款）：从当前工作目录向上找 astro.config.mjs，
// 在博客目录（含其子目录）内才能运行；项目外执行直接中文报错退出，
// 避免在错误目录误建文件。
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  createPost,
  createIdea,
  listPosts,
  publishPost,
  resolveRoot,
  ROOT,
  IDEAS_DIR,
} from '../scripts/lib/ops.mjs';

// ---- 版本号：从 package.json 读（bin/ 的上一级） ----
const PKG = JSON.parse(
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf-8')
);

// ------------------------------------------------------------
// 辅助
// ------------------------------------------------------------

/** 项目根守卫：全局命令必须在博客目录内运行 */
function requireProjectRoot() {
  if (!resolveRoot()) {
    console.error(
      [
        '✗ 这里不是 unvessel 博客目录。',
        '  全局命令会从当前目录向上查找 astro.config.mjs 来定位博客，',
        '  请 cd 到 unvessel 项目目录（或其任意子目录）后再运行。',
      ].join('\n')
    );
    process.exit(1);
  }
}

/**
 * 零依赖 argv 解析（new 命令专用）。
 * 规则：第一个非 -- 开头的参数 = 标题；--desc/--tags/--slug 取其后的值；
 *       --publish 为布尔旗标。
 * @param {string[]} args
 */
function parseNewArgs(args) {
  const opts = { title: '', description: '', tags: [], slug: '', publish: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--desc') opts.description = args[++i] ?? '';
    // tags 分隔容错：同时接受英文逗号、中文逗号、空白。
    // 原因：Windows 下 unv.cmd 批处理 shim 经 cmd.exe 转发参数时，
    // 逗号会被 cmd 当作分隔符转成空格（「随笔,工具」→「随笔 工具」），
    // 按 /[,，\s]+/ 分割可兼容两种形态；标签约定不含空格。
    else if (a === '--tags') opts.tags = String(args[++i] ?? '').split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean);
    else if (a === '--slug') opts.slug = args[++i] ?? '';
    else if (a === '--publish') opts.publish = true;
    else if (!a.startsWith('--') && !opts.title) opts.title = a;
  }
  return opts;
}

/** 流式转发 npm 脚本（dev/build/preview），stdout/stderr 直接继承当前终端 */
function runNpmScript(scriptName) {
  // shell:true 下把整条命令作为字符串传入（而非 args 数组），
  // 避免 Node 的 DEP0190 警告（args 不经转义拼接）；
  // scriptName 来自内部分发表的固定值（dev/build/preview），非用户输入，无注入面。
  // Windows 下 npm 是 npm.cmd，必须经 shell 执行。
  const child = spawn(`npm run ${scriptName}`, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

// ------------------------------------------------------------
// 命令实现
// ------------------------------------------------------------

const commands = {
  /** 新建文章（默认草稿，--publish 直接发布态） */
  new(args) {
    requireProjectRoot();
    const { title, description, tags, slug, publish } = parseNewArgs(args);
    try {
      const { file, uid } = createPost({ title, description, tags, slug, draft: !publish });
      console.log(`已创建：${file}`);
      console.log(`短链 ID：${uid}（发布后 URL = /posts/${uid}/）`);
      console.log(`目录：${path.join(ROOT, 'src', 'content', 'posts')}`);
      console.log(publish ? '状态：发布态（draft: false）' : '状态：草稿（draft: true，发布前不会出现在站点）');
      console.log('下一步：编辑正文 → unv publish <slug> 发布 → git push（Vercel 自动部署）');
    } catch (err) {
      console.error(`失败：${err.message}`);
      process.exit(1);
    }
  },

  /** 记一条灵感（自留地「念头」区，秒记不打断） */
  idea(args) {
    requireProjectRoot();
    // 解析规则：非 -- 开头的参数按序用空格拼接为灵感文本（带引号/不带引号都行）；
    // --mood/--link/--image 取其后的值。灵感讲究零摩擦，不做更多解析。
    const parts = [];
    const opts = { mood: '', link: '', image: '' };
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--mood') opts.mood = args[++i] ?? '';
      else if (a === '--link') opts.link = args[++i] ?? '';
      else if (a === '--image') opts.image = args[++i] ?? '';
      else parts.push(a);
    }
    try {
      const { file } = createIdea({ text: parts.join(' ').trim(), ...opts });
      console.log(`已记下：${file}`);
      console.log(`目录：${IDEAS_DIR}`);
      console.log('呈现：构建后出现在 /garden/ 灵感时间线（draft 条目不显示）');
    } catch (err) {
      console.error(`失败：${err.message}`);
      process.exit(1);
    }
  },

  /** 列出全部文章（含草稿） */
  list() {
    requireProjectRoot();
    const posts = listPosts();
    const published = posts.filter((p) => !p.draft).length;
    const drafts = posts.length - published;
    console.log(`共 ${posts.length} 篇（已发布 ${published} · 草稿 ${drafts}）\n`);
    for (const p of posts) {
      const flag = p.draft ? '草稿' : '发布';
      // uid 列：发布后的链接就是 /posts/<uid>/，列表里直接给全，免得再去查
      console.log(`[${flag}] ${p.pubDate}  ${String(p.uid).padEnd(10)} ${p.slug.padEnd(34)} ${p.title}`);
    }
  },

  /** 草稿转发布 */
  publish(args) {
    requireProjectRoot();
    const slug = args[0];
    try {
      const { file, changed } = publishPost(slug);
      console.log(changed ? `已发布：${file}（draft 已置为 false）` : `本就是发布态：${file}（未改动）`);
    } catch (err) {
      console.error(`失败：${err.message}`);
      process.exit(1);
    }
  },

  /** 起开发服务器（astro dev，热更新） */
  dev() {
    requireProjectRoot();
    runNpmScript('dev');
  },

  /** 构建静态产物 + Pagefind 索引 */
  build() {
    requireProjectRoot();
    runNpmScript('build');
  },

  /** 预览构建产物（搜索索引只在 build 后存在） */
  preview() {
    requireProjectRoot();
    runNpmScript('preview');
  },

  /** 帮助 */
  help() {
    console.log(
      [
        `unvessel v${PKG.version} — 不器博客运营命令（短命令：unv）`,
        '',
        '用法：unv <命令> [参数]',
        '',
        '文章：',
        '  unv new "标题" [--desc "摘要"] [--tags a,b] [--slug x] [--publish]',
        '      新建文章（默认草稿；--publish 直接发布态）',
        '  unv list              列出全部文章（含草稿）          别名：ls / l',
        '  unv publish <slug>    草稿转发布（draft: true→false）  别名：pub',
        '',
        '灵感：',
        '  unv idea "一句话"     记一条灵感（/garden/ 念头区）   别名：i',
        '      可选：--mood "心情" --link "URL" --image "URL"',
        '',
        '站点：',
        '  unv dev               起开发服务器（热更新）           别名：server / s',
        '  unv build             构建静态产物 + Pagefind 索引     别名：generate / g',
        '  unv preview           预览构建产物                     别名：p',
        '',
        '其他：',
        '  unv help              显示本帮助                       别名：-h / --help',
        '  unv version           版本号                           别名：-v / --version',
        '',
        '示例：',
        '  unv new "墨的第十一种死法" --tags 随笔,技术 --slug ink-11',
        '  unv list',
        '  unv publish ink-11',
        '  unv idea "灵感碎片很随意的" --mood 夜跑',
        '',
        '提示：命令须在 unvessel 博客目录（或其子目录）内运行；',
        '      AI 自动运营走 MCP（npm run mcp），配置见 docs/AI-OPS.md。',
      ].join('\n')
    );
  },

  /** 版本 */
  version() {
    console.log(`unvessel v${PKG.version}`);
  },
};

// 命令别名表（短命令 → 规范名）
const aliases = {
  n: 'new',
  i: 'idea',
  ls: 'list', l: 'list',
  pub: 'publish',
  server: 'dev', s: 'dev',
  generate: 'build', g: 'build',
  p: 'preview',
  '-h': 'help', '--help': 'help',
  '-v': 'version', '--version': 'version',
};

// ------------------------------------------------------------
// 分发
// ------------------------------------------------------------

const [rawCmd, ...restArgs] = process.argv.slice(2);
const cmd = aliases[rawCmd] || rawCmd || 'help';

if (commands[cmd]) {
  commands[cmd](restArgs);
} else {
  console.error(`未知命令：${rawCmd}\n运行 unv help 查看全部命令。`);
  process.exit(1);
}
