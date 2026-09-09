# unvessel AI 运营手册（AI-OPS）

> 本手册是「AI 自动运营接口」四件套之一。
> 任何 AI Agent（人或 AI 皆可）按本文档操作，即可完成从写稿到部署的全流程。

---

## 0. 一图看懂：三层一体架构

```
┌─ 第一层：schema（强校验）────────────────────────────┐
│  src/content.config.ts  zod schema，astro build 时强制  │
└──────────────┬───────────────────────────────────┘
               │ 约束
┌─ 第二层：核心（单一实现源）───────────────────────────┐
│  scripts/lib/ops.mjs   listPosts / createPost /       │
│                        buildSite（纯函数，错误 throw）  │
└──────┬───────────────────────┬───────────────────┘
       │ import                 │ import
┌─ 第三层：壳（行为永远一致）───────────────────────────┐
│  CLI  scripts/new-post.mjs   （人类习惯：npm run new） │
│  MCP  scripts/mcp-server.mjs （AI 工具面：3 个工具）    │
└──────────────────────────────────────────────────────┘
```

**核心思想**：CLI 与 MCP 都是薄壳，业务逻辑只有一份（ops.mjs）。
改行为只改一处，两个入口永远一致；新增能力 = 核心加一个函数 + 各壳加一行注册。

---

## 1. 文件即接口（第一层：写 markdown 就是运营）

文章目录：`src/content/posts/*.md`，文件名 = `YYYY-MM-DD-<slug>.md`（日期前缀保证按名排序即按时间排序）。

### frontmatter schema（zod 强校验，build 不过 = 部署不发生）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | ✅ | 标题（min 1 字符） |
| `description` | string | ✅ | 一句话摘要（min 1 字符；列表页/SEO 用） |
| `pubDate` | string/date | ✅ | 发布日期，推荐 `2026-09-10T12:00:00+08:00` ISO 带时区 |
| `tags` | string[] | ❌ | 默认 `[]`；列表页显示，无则显示 `—` |
| `draft` | boolean | ❌ | 默认 `false`；**`true` 时文章不进构建产物** |
| `lang` | `zh` / `en` | ❌ | 默认 `zh` |

### 最小可用模板

```markdown
---
title: 文章标题
description: 一句话摘要
pubDate: 2026-09-10T12:00:00+08:00
tags: [随笔]
draft: true
---

正文……
```

> 直接写文件 = 合法运营方式之一。写完跑 `npm run build`，校验失败信息会精确指出哪个文件哪个字段不合规。

---

## 2. CLI 接口（人类 / 脚本习惯）

```bash
npm run new "文章标题"                          # 最简：只给标题，默认草稿
npm run new "标题" -- --desc "一句话摘要"        # 摘要
npm run new "标题" -- --tags 随笔,读书           # 标签（逗号分隔）
npm run new "标题" -- --slug my-custom-slug     # 自定义 URL slug
npm run new "标题" -- --publish                 # 直接发布态（默认草稿）
```

行为：
- 文件落在 `src/content/posts/YYYY-MM-DD-<slug>.md`，自带正文骨架；
- slug 缺省规则：纯 ASCII 标题 → 小写连字符；含中文 → `post-YYYYMMDD-HHmm` 时间戳兜底（不引拼音依赖）；
- 同名文件已存在 → 报错退出（不静默覆盖）；
- `title` 缺失 → 报错退出。

常用命令：`npm run dev`（本地预览）/ `npm run build`（构建+校验）/ `npm run preview`（预览构建产物）。

---

## 3. MCP 接口（AI Agent 工具面）

### 接入配置（Trae / Claude Desktop / 任何支持 stdio MCP 的客户端）

```json
{
  "mcpServers": {
    "unvessel-ops": {
      "command": "node",
      "args": ["D:/00_Workspace/02_Projects/OnHold/unvessel/scripts/mcp-server.mjs"]
    }
  }
}
```

### 工具面（刻意保持最小三件套）

| 工具 | 入参 | 返回 |
|------|------|------|
| `list_posts` | 无 | `{total, postsDir, posts[]}`，含 draft 状态，按日期倒序 |
| `new_post` | `title`（必填）、`description?`、`tags?`、`slug?`、`publish?` | 生成文件名与绝对路径；失败时 isError + 中文原因 |
| `build_site` | 无 | `{ok, output}`；output 为构建日志尾部 8KB |

> **刻意不做 deploy 工具**：Vercel 连接 git 仓库后 push 即自动部署。
> AI 的部署动作 = `git push`，无需也无法走 API——这是少一个工具、少一份凭证泄露面的设计决策。

---

## 4. AI 运营标准作业流程（SOP）

```
1. list_posts            → 了解现有文章，避免重复选题
2. new_post {title,...}  → 生成草稿骨架（默认 draft: true）
3. 编辑正文              → 用文件工具写 markdown 正文（frontmatter 已就位）
4. build_site            → 构建 = zod 校验闭环；失败按报错修 frontmatter
5. git add + commit      → 提交（中文提交信息）
6. git push              → Vercel 自动部署，完成
```

**要点**：
- 步骤 4 是强校验闭环——schema 不合规的文章**不可能**进入线上；
- 全程不需要 deploy 凭证，push 即部署；
- 若只是改已有文章：跳过步骤 2，直接编辑文件 → 4 → 5 → 6。

---

## 5. 扩展指南（留好的接口在哪、怎么加）

新增一个运营能力（例：`update_post` / `delete_post` / `list_drafts`）：

1. **核心**：在 `scripts/lib/ops.mjs` 加一个纯函数（不交互、只 throw、中文报错）；
2. **CLI**：在 `scripts/new-post.mjs` 的 argv 分发表里加一行，委托核心函数；
3. **MCP**：在 `scripts/mcp-server.mjs` 用 `server.registerTool(...)` 注册，入参用 zod 描述，委托同一核心函数；
4. **手册**：更新本文档第 2/3 节。

三层各自十几行内完成，行为一致性由「只 import 核心」保证。

---

## 6. 边界与约定

- **敏感信息**（token/密码）不入库、不进 frontmatter；
- **draft: true 的文章**不进构建产物，可安全留在仓库里长期写；
- **slug 一旦发布（push 过）不要改**——改了等于换 URL，破坏外链；
- `pubDate` 用未来时间 = 定时发布的朴素实现（build 后页面会出现，Vercel 不会延迟部署，注意别当真定时器用）。

---

## 7. 可选功能启用（评论 / 阅读量）

两类动态功能共用一个设计契约：**未配置 = 功能不存在**。
配置集中在 `src/config/site.ts`，未填齐时对应组件在**构建期**整体省略——
产物里没有 DOM、没有脚本、没有请求，不是运行时隐藏。配置齐全后重跑 build 即点亮。

### 7.1 Giscus 评论（基于 GitHub Discussions）

**前置**：博客仓库已开启 Discussions（Settings → General → Features → Discussions）。

**步骤**：

1. 打开 [giscus.app/zh-CN](https://giscus.app/zh-CN)，填入仓库名；
2. 选择分类（建议 `Announcements`，仅维护者可开帖，防灌水）；
3. 页面生成一组配置值，把其中四项填入 `src/config/site.ts`：

   ```ts
   export const GISCUS = {
     repo: '<用户名>/<仓库名>',   // giscus 页面 data-repo
     repoId: 'R_xxxxxxx',         // data-repo-id
     category: 'Announcements',
     categoryId: 'DIC_xxxxxxx',   // data-category-id
     // …其余字段保持默认
   };
   ```

4. `npm run build` → 文章页「文末返回」上方出现「附录 · 议论」评论区。

### 7.2 阅读量 / 点赞（Vercel Serverless + Upstash Redis）

**架构**：静态页面 → `POST /api/metrics`（`api/metrics.ts`，Vercel 零配置识别）
→ Upstash Redis REST（纯 fetch，无 npm 依赖）。
阅读计数按「IP + 文章」十分钟去重；点赞由前端 localStorage 记忆防重复。

**步骤**：

1. [upstash.com](https://upstash.com) 创建 Redis 数据库（免费档足够博客量级）；
2. 控制台 REST API 区块拿到两个值，配到 Vercel 项目
   （Settings → Environment Variables）：

   | 变量名 | 值 |
   |--------|-----|
   | `UPSTASH_REDIS_REST_URL` | `https://xxx.upstash.io` |
   | `UPSTASH_REDIS_REST_TOKEN` | REST Token（敏感，勿入库） |

3. 重新部署（git push 或 Vercel 手动 Redeploy）；
4. 文章页尾部出现「阅读 0001 · 点赞 0000」行，点赞即用。

**降级语义（前端已内置，无需处理）**：
环境变量缺失或 Redis 故障时 API 返回 503，前端 widget 对一切失败的处理是
「保持隐藏」——线上表现为功能不存在，页面其余部分零影响。

### 7.3 恒定开箱即用的部分（无需任何配置）

| 功能 | 入口 | 说明 |
|------|------|------|
| 站内搜索 | ⌘/Ctrl+K、`/`、顶栏「检索」 | Pagefind，build 自动建索引；本地 preview 可用 |
| RSS | `/feed.xml` | 与列表页同口径（draft 过滤 + 日期倒序） |
| SEO | 每页 head | canonical / OG / Twitter Card / sitemap / robots 全自动 |
| 字体 | 自托管 woff2 | 无第三方 CDN，国内访问无单点依赖 |
