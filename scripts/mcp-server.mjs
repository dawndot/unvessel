#!/usr/bin/env node
// ============================================================
// mcp-server.mjs — unvessel 运营 MCP 薄壳（AI Agent 工具面）
// ============================================================
// 这是「AI 自动运营接口」的第三层：把核心运营逻辑（ops.mjs）
// 封装为标准 MCP（Model Context Protocol）工具，供任何支持
// MCP 的 AI 客户端调用（Trae / Claude Desktop / Cursor 等）。
//
// 接入方法（以 Trae / Claude Desktop 为例，stdio 传输）：
//   {
//     "mcpServers": {
//       "unvessel-ops": {
//         "command": "node",
//         "args": ["D:/00_Workspace/02_Projects/OnHold/unvessel/scripts/mcp-server.mjs"]
//       }
//     }
//   }
//
// 薄壳原则：本文件只做「工具注册 + zod 入参描述」，
// 全部业务逻辑委托 scripts/lib/ops.mjs——CLI 与 MCP 行为永远一致。
//
// 工具面（刻意保持最小，详见 docs/AI-OPS.md）：
//   list_posts  列出全部文章（含草稿状态）
//   new_post    创建文章草稿（frontmatter 模板兜底）
//   build_site  构建站点 = 最终校验（zod schema 失败即构建失败）
// ============================================================

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { listPosts, createPost, buildSite, POSTS_DIR } from './lib/ops.mjs';

// ---- 服务器声明 ----
const server = new McpServer({
  name: 'unvessel-ops',
  version: '0.1.0',
});

// ---- 工具 1：list_posts ----
server.registerTool(
  'list_posts',
  {
    title: '列出文章',
    description:
      '列出 unvessel 博客的全部文章（含草稿），按发布日期倒序。返回 title/description/pubDate/tags/draft 与文件名。',
    inputSchema: {},
  },
  async () => {
    const posts = listPosts();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { total: posts.length, postsDir: POSTS_DIR, posts },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ---- 工具 2：new_post ----
server.registerTool(
  'new_post',
  {
    title: '新建文章',
    description:
      '在 src/content/posts/ 下创建一篇新文章（默认草稿）。文件名 = 日期前缀 + slug。返回生成路径，随后用文件编辑写入正文，最后调用 build_site 校验。',
    inputSchema: {
      title: z.string().describe('文章标题（必填）'),
      description: z.string().optional().describe('一句话摘要（frontmatter.description）'),
      tags: z.array(z.string()).optional().describe('标签数组，如 ["随笔","读书"]'),
      slug: z.string().optional().describe('自定义 URL slug；缺省时由标题/时间戳生成'),
      publish: z.boolean().optional().describe('true = 直接发布态；缺省/false = 草稿'),
    },
  },
  async ({ title, description, tags, slug, publish }) => {
    try {
      const { file, path } = createPost({
        title,
        description,
        tags: tags ?? [],
        draft: !publish,
        slug,
      });
      return {
        content: [
          {
            type: 'text',
            text: `已创建：${file}\n路径：${path}\n下一步：编辑正文 → build_site 校验 → git push 部署`,
          },
        ],
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `失败：${err.message}` }] };
    }
  }
);

// ---- 工具 3：build_site ----
server.registerTool(
  'build_site',
  {
    title: '构建站点',
    description:
      '运行 astro build（npm run build）。构建会用 content collections 的 zod schema 校验全部文章 frontmatter——校验失败即构建失败。返回是否成功与输出尾部日志。',
    inputSchema: {},
  },
  async () => {
    const { ok, output } = buildSite();
    return {
      isError: !ok,
      content: [{ type: 'text', text: `${ok ? '构建成功' : '构建失败'}\n\n${output}` }],
    };
  }
);

// ---- 启动：stdio 传输（MCP 标准接入方式） ----
await server.connect(new StdioServerTransport());
console.error('[unvessel-ops] MCP server 已启动（stdio），工具：list_posts / new_post / build_site');
