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
│  scripts/lib/ops.mjs   listPosts / createPost /        │
│                        createIdea / buildSite          │
│                        （纯函数，错误 throw）           │
└──────┬───────────────────────┬───────────────────┘
       │ import                 │ import
┌─ 第三层：壳（行为永远一致）───────────────────────────┐
│  CLI  bin/unvessel.mjs       （人类习惯：unv <命令>）   │
│  MCP  scripts/mcp-server.mjs （AI 工具面：4 个工具）    │
└──────────────────────────────────────────────────────┘
```

**核心思想**：CLI 与 MCP 都是薄壳，业务逻辑只有一份（ops.mjs）。
改行为只改一处，两个入口永远一致；新增能力 = 核心加一个函数 + 各壳加一行注册。

---

## 1. 文件即接口（第一层：写 markdown 就是运营）

文章目录：`src/content/posts/*.md`，文件名 = `YYYY-MM-DD-<slug>.md`（日期前缀保证按名排序即按时间排序）。
**线上 URL 与文件名解耦**：文章地址 = `/posts/<uid>/`（随机短链，对齐知乎 `/p/<id>`、B 站 BV 号的中文平台惯例）。
uid 取值规则：frontmatter 显式 `uid` 优先；缺省时构建期 `md5(文件id).slice(0,8)` 哈希兜底——文件名不变则 URL 永不变。
全站所有链接生成点（路由/列表/精选/RSS/计数）统一经 `src/lib/utils.ts` 的 `postUid()` 取值，与 `getStaticPaths` 永远同源。

### frontmatter schema（zod 强校验，build 不过 = 部署不发生）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | ✅ | 标题（min 1 字符） |
| `description` | string | ✅ | 一句话摘要（min 1 字符；列表页/SEO 用） |
| `pubDate` | string/date | ✅ | 发布日期，推荐 `2026-09-10T12:00:00+08:00` ISO 带时区 |
| `tags` | string[] | ❌ | 默认 `[]`；列表页显示，无则显示 `—` |
| `draft` | boolean | ❌ | 默认 `false`；**`true` 时文章不进构建产物** |
| `featured` | boolean | ❌ | 默认 `false`；`true` 时进入首页「精选」区（编辑意志钉选的大卡位，最多展示 2 篇） |
| `pinned` | boolean | ❌ | 默认 `false`；`true` 时在首页与 /posts/ 列表置顶（排序优先于日期，多篇置顶彼此仍按日期倒序；与 featured 分工：置顶管「排序位」、精选管「首页大卡位」） |
| `cover` | string | ❌ | 头图，站点绝对路径（如 `/covers/xxx.png`，图放 `public/` 下）；三处共用：首页精选大卡背景 / 文章页头图 / og:image，省略时三处各自退化（排版卡 / 无头图 / 全站默认 og 图） |
| `lang` | `zh` / `en` | ❌ | 默认 `zh`；英文稿文件名必须为 `<同名>.en.md` 且 `lang: en`、`uid` 与中文稿一致（配对规则见第 8 节） |
| `uid` | string | ❌ | 短链 ID（`/^[a-z0-9]{4,12}$/`，去掉易混淆的 0/1/l/o）；`unv new` 自动生成并查重，缺省走哈希兜底 |

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

### 站点内容维护（文章之外的四类内容，全部「文件即接口」）

| 内容 | 位置 | 维护方式 |
|------|------|----------|
| 网站日志 | `src/content/logs/*.md` | 新建 md（frontmatter：`title` / `date` / `kind: 站点\|写作\|实验` / `draft`），/logs 时间线与热力图自动收录 |
| 作品集 | `src/data/works.ts` | WORKS 数组加一条（title/year/status: live\|building\|archive/desc/tags/href 或 url） |
| 自留地·爱好 | `src/data/garden.ts` | GARDEN 数组加一条（group: 读书\|音乐\|影像\|…+ title/meta/status: doing\|done\|wish/note/date/href），/garden 分组时间线自动收录 |
| 自留地·灵感 | `src/content/ideas/*.md` | **不手写文件**——`unv idea "内容"` 或 MCP `new_idea` 秒记；文件名 = `YYYY-MM-DD-HHmmss.md` 秒级时间戳（同秒自动 -2/-3），内容全在 frontmatter（`text` 必填 + `mood`/`image`/`link`/`draft` 可选），/garden 灵感时间线自动收录 |
| 相册 | `src/data/photos.ts` + `public/photos/` | 图片丢 public/photos/，PHOTOS 数组加一条（src/title/date/note）；空数组时页面显示「胶卷未装」投放指引 |
| 站点档案 | `src/data/profile.ts` | 邮箱 / GitHub / 建站日期全站唯一数据源；GitHub 留空则页脚不渲染该入口 |

- **写作热力图**（/logs 专属）：构建期自动聚合文章 pubDate + 日志 date，无需手工维护；2026-09-10 起移除 /about 侧的同图重复展示（关于页只保留六张统计卡）；
- **站点统计**（/about）：文章/日志/作品/照片数、总字数、建站天数全部构建期实算（照片数走 `scanPhotos()` 与相册页同源）；
- 404 页面（`src/pages/404.astro`）由 Astro 产出 dist/404.html，Vercel 原生识别，无需配置。
- **favicon 三件套**：`public/favicon.svg`（内嵌 `prefers-color-scheme` 深浅色自适应，深色标签条自动转骨白）+ `public/favicon.png`（Safari 等不认 SVG favicon 的浏览器兜底，兼 iOS 主屏图标）；引用在 `src/layouts/Base.astro` head 的三行 `<link>`。**2026-09-10 裁边**：原 1920×1920 画布四周留白吞掉约 2/3 画面（内容包围盒仅 648×870），viewBox 已裁为内容居中正方 `527 442 906 906`（png 同矩形像素裁切为 906×906），同尺寸下图形显著放大。**换 logo 必须改三处**：这两个文件 + 顶栏 brand 区的 inline SVG（`Base.astro` 中 `.topbar__mark`，path 与 favicon 完全同源，保证站点 UI 与标签页图标永远同一图形）；验证必须用无痕窗口——favicon 缓存极顽固，普通刷新看不到新图。
- **顶栏布局规范**（2026-09-10 三轮定稿，同日 7 项导航窄屏实测补档）：`brand（器皿标记 22×22 inline SVG + UNVESSEL + 不器，悬停整体转朱砂）｜右侧功能群（七项导航 + 1px 发丝分隔线 + 44px 检索钮，`margin-left:auto` 整体推右）｜EST.2026 句号水印（仅 ≥1280px 显示）`。检索钮挂在导航尾部而非贴边孤立。窄屏收窄链（从宽到窄）：≤560px 藏中文副名并缩导航字号；≤480px 藏 7 项编号 + 检索钮 + 分隔线，导航 a 左右 padding 收到 6px、brand 两侧 gutter 收到 14px、label 加 `white-space: nowrap` 禁竖排换行（375px 实测四档 320/360/375/420 全部无横向溢出、label 全部单行横排；移动端无 Ctrl+K，检索入口暂缺是明确取舍，未来要做移动端检索另行做图标常驻或汉堡方案）；≤420px 英文品牌字以 `font-size:0` 收起，brand 只剩器皿图形（旧注释「图形+不器」系死代码已勘误——中文副名在 560px 档已 display:none，恢复「不器」需 +36px 会导致 320px 档溢出，故维持图形方案）。
- **自留地·3D 书房（2026-09-11 P1 房间壳体落地）**：/garden 第一屏是纯 Three.js（^0.186）渲染的水墨房间壳体，核心文件 `src/scripts/garden-room.ts`（挂载装配在 `src/pages/garden.astro` 尾部脚本，样式在 `global.css` 节 24）。**运维须知**：
  - 分层不替换：canvas 只是叠在 CSS 宣纸底上的一层，garden.astro 服务端照常输出 2D 内容列表（爱好/灵感时间线在首屏之下）——内容永远不住在 3D 代码里，无 JS 同样可达；
  - 降级链路：无 WebGL / Renderer 创建失败 → canvas 不出现，CSS 宣纸底 + 深墨 cue 自然构成静态画面；3D 成功接管 → stage 加 `.is-live`，cue 切骨白（墨渊黑地板上深墨隐形，双态配色由此而来）；`prefers-reduced-motion` → 跳过运镜只渲染一帧；
  - 程序化纹理：宣纸墙/墨石地板每次访问用 Canvas 2D 现场绘制（零图片资产、零网络请求，访客间互不相同）；色板 `PAL` 与 global.css 令牌同源，改动需两边同步；
  - 机位：常驻 REST(0,1.55,4.9) + 入场 FROM，FOV 42，竖屏（aspect<0.75）自动拉到 55；入房运镜 1800ms easeInOutCubic + 三正弦呼吸；
  - 构建体积：garden chunk ≈518KB（gzip ≈130KB），大头是 three.js 主体，vite >500KB 警告按既定方案接受；
  - P2+ 扩展缝：物件推近复用 easeInOutCubic 与 REST/FROM 结构；便签墙/书脊 = 新 CanvasTexture + 细长 Box，数据源 ideas 集合 / garden.ts。
- **自留地·3D 书房（2026-09-11 P2 四物件进场）**：书桌/书架/便签墙/留声机/放映机四组程序化物件进房，核心文件 `src/scripts/garden-props.ts`（构建函数 + `CLOSEUPS` 推近机位表），由 garden-room.ts 挂载。**模型路线终判：全程序化几何**——CC0 单体模型不可得、整包模型 AI 生成风格与水墨基调冲突；程序化几何与 P1 程序化纹理同一语汇，零资产零网络依赖。**运维须知**：
  - 状态机四态 intro → breath ⇄ push → closeup；DEV 句柄 `window.__gardenRoom.goto('<propId>')` / `back()`——**参数是物件 id**（`shelf` / `gramophone` / `projector` / `notes`），未知 id 静默忽略（不要传机位名）；
  - 推近机位微调只改 garden-props.ts 头部 `CLOSEUPS` 表，状态机零改动；
  - 几何轴向教训：CircleGeometry 法线朝 +Z、LatheGeometry 轴沿 +Y——留声机喇叭内衬盘的正解是 `rotateX(-Math.PI/2)` 把法线转到 +Y 后**作 horn 子物体**沿局部轴平移（套用父级欧拉角 + translateZ 会法线与轴不同轴，圆片悬空成「光环」伪影）；放映机双片盘需 `rotation.x = Math.PI/2` 把圆柱轴转向 Z，圆面才朝房中；
  - 构建体积：garden chunk ≈529KB（gzip ≈134KB），>500KB 警告仍按既定方案接受；
  - i18n 迁移已收口（2026-09-11）：此前 Base.astro 与各 `*View` 模板的 `lang` prop 曾被改为强制传入、页面壳漏传导致整站 build 崩溃，临时以 `lang = 'zh'` 缺省桥接；现已完成正式迁移——全部页面壳显式传 lang，页面实现收口为「`src/templates/*View.astro` 共享模板 + 中英双薄壳」，多语言维护口径见第 8 节。
- **页脚布局规范**（2026-09-11 落款式重构，告别三栏竖排站点地图）：三层构图自上而下——① 信息层 `.footer__meta`（左「联络 / CONTACT」mono 链接行 + 右版权细字 `.footer__fine`，`align-items:flex-end` 底对齐收基线）；② 站点地图横排编号字行 `.footer__map`（衬线 `--font-serif` 大字 + mono 10px 编号，`<i>编号</i><span>标签</span>` 结构与顶栏同构，**复用 `Base.astro` 顶部 `NAV` 数组——加板块只改一处，页脚自动跟上**；顶栏是 mono 12px 功能导航、页脚是衬线 20px 级索引，同一信息两种声部）；③ 落款 `.footer__sign`（沉底巨字「不器」+ 朱砂印章 `.seal` 同框：flex 底对齐 + 整组居中，书法「字成而钤印」——巨字负 margin 下半裁掉沉入渊里，印章 margin-bottom 抬离裁切线完整可见）。巨字弃用 1px `-webkit-text-stroke` 描边（叠烟雾湍流断续显脏）改实心 6% 骨白水印（均匀的面，烟雾穿过只整体变暗）。印章尺寸随视口流动 `clamp(54px, 6vw, 92px)`。窄屏：≤900px 信息层纵向堆叠、版权行回正左对齐；字行 `flex-wrap` 自然换行；375px 实测字行两行换行（4+3）、落款整组精确居中、印距字 12px、印底抬离页底 22px。

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

### 灵感速记（`unv idea`，别名 `unv i`）

```bash
unv idea "深夜读完《看不见的城市》"             # 最简：只给内容，立即上线
unv idea "这句话想留住" --mood 夜跑            # 加一句心情/语境标签
unv idea "值得再看一遍的片子" --link https://…  # 挂相关链接
unv idea "待整理的念头" --draft                # 草稿态（站点不显示）
```

行为：
- 文件落在 `src/content/ideas/YYYY-MM-DD-HHmmss.md`（秒级时间戳，无标题无正文骨架——灵感内容全在 frontmatter `text`）；
- 同一秒连记自动追加 `-2` / `-3` 后缀（秒记不该被查重打断）；
- `text` 缺失 → 报错退出；
- 呈现：构建后出现在 /garden/「灵感」时间线（按日期倒序，draft 不显示）。

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

### 工具面（刻意保持最小四件套）

| 工具 | 入参 | 返回 |
|------|------|------|
| `list_posts` | 无 | `{total, postsDir, posts[]}`，含 draft 状态，按日期倒序 |
| `new_post` | `title`（必填）、`description?`、`tags?`、`slug?`、`publish?` | 生成文件名与绝对路径；失败时 isError + 中文原因 |
| `new_idea` | `text`（必填）、`mood?`、`image?`、`link?`、`draft?` | 生成文件名与绝对路径；灵感碎片秒记入口，构建后出现在 /garden/ 灵感时间线 |
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
2. **全局命令**：在 `bin/unvessel.mjs` 的 commands 对象加一个命令方法 + aliases 别名，委托核心函数；
3. **npm 壳（可选）**：需要 npm run 入口时，在 `scripts/new-post.mjs` 的 argv 分发表加一行；
4. **MCP**：在 `scripts/mcp-server.mjs` 用 `server.registerTool(...)` 注册，入参用 zod 描述，委托同一核心函数；
5. **手册**：更新本文档第 2/3 节。

三层各自十几行内完成，行为一致性由「只 import 核心」保证。

---

## 6. 边界与约定

- **敏感信息**（token/密码）不入库、不进 frontmatter；
- **draft: true 的文章**不进构建产物，可安全留在仓库里长期写；
- **uid 一旦发布（push 过）不要改**——URL = `/posts/<uid>/`，改 uid 等于换地址、破坏外链；slug/文件名只影响仓库整理，不影响线上地址（未显式写 uid 的旧文除外：哈希兜底随文件 id 走，同样不要改文件名）；
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

4. `npm run build` → 文章页「文末返回」上方出现「附录 · 议论」评论区（点亮前该位置是「议论未点亮」指引面板）。

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
| 站内搜索 | ⌘/Ctrl+K、`/`、顶栏放大镜图标（位于右侧功能群：导航 ｜ 分隔线 ｜ ⌕） | Pagefind，build 自动建索引；本地 preview 可用（顶栏为 SVG 描边放大镜按钮：烟灰常驻、悬停骨白、无底色） |
| RSS | `/feed.xml`（英文版 `/en/feed.xml`） | 与列表页同口径（draft 过滤 + 日期倒序）；双版本共用 `buildFeed` 共享构建器 |
| SEO | 每页 head | canonical / OG / Twitter Card / sitemap / robots 全自动 |
| 字体 | 自托管 woff2 | 无第三方 CDN，国内访问无单点依赖 |
| 明暗主题 | 顶栏日/月切换按钮 | 首选记忆（localStorage），首次访问跟随系统；维护要点见 8.7 |

---

## 8. 多语言与主题维护规范（2026-09-11 收口）

**架构一句话**：中文是主站（URL 无前缀），英文是完整镜像（`/en/` 前缀）；
文章靠 **uid 配对**而非复制；页面靠 **共享模板 + 双薄壳**而非两套实现；
文案分两层——构建期字典管模板、运行时表管 JS。

### 8.1 双语文章配对（uid 是唯一配对键）

| 规则 | 说明 |
|------|------|
| 命名 | 中文稿 `YYYY-MM-DD-<slug>.md`；英文稿**同名 + `.en.md` 后缀**（如 `2026-09-10-cli-feel.en.md`） |
| 英文稿 frontmatter 必写 | `lang: en` + `uid` 与中文稿**完全一致**（uid 是配对键，漏写或写错 = 英文稿配不上对） |
| 其余字段 | `title` / `description` 必译；`pubDate` / `tags` / `cover` / `featured` / `pinned` 建议镜像中文稿，两支独立生效 |
| 配对实现 | `src/lib/posts.ts` 的 `getPostPairs()`：按 uid 桶聚合 zh/en 两支；**任一支 `draft: true` 整对剔除**（防止英文稿先发出去） |
| 展示语义 | 中文站只显示中文稿；英文站有英文稿显示英文稿，没有的**自动降级显示中文稿**并加 `〔in Chinese〕` 标注（`PostRow` / `PostDetailView` 自动处理，无需人工干预） |
| URL | 同一对文章共用 uid → `/posts/<uid>/` 与 `/en/posts/<uid>/` 天然对应，hreflang 互指成立 |

**单语发文是合法默认态**：只写中文不写英文完全没问题——英文站自动 fallback 显示
中文稿并标注。翻译随时可以后补，补上 `.en.md` 重建即替换，URL 不变。

### 8.2 新增双语文章 SOP

1. `unv new "标题"` 建中文稿（uid 自动生成并查重）；
2. 写完中文稿后复制一份，改名 `<同名>.en.md`；
3. 英文稿 frontmatter 改三处：`lang: en`、`uid` 抄中文稿、`title` / `description` 翻译；
4. 正文**人工翻译**（本站不做机翻——语气与术语自己把控，专有名词见 8.5 术语约定）；
5. `npm run build` 验证 + `npm run preview` 抽查中英两页。

### 8.3 界面文案的两层来源

| 层 | 位置 | 管什么 |
|----|------|--------|
| 构建期字典 | `src/i18n/ui.ts`（zh/en 双列，`ui[lang]` 取列，TypeScript 强制两列同构） | Astro 模板渲染的一切文案：导航 / 按钮 / 页脚 / 空状态 / 表格头… |
| 运行时文案表 RT | `src/scripts/main.js` 的 `RT` 常量（zh/en 双列） | JS 在浏览器里现造的字符串：搜索状态行 / 复制反馈 / 主题按钮 aria… |

规则：

- **新增模板文案** → 只改 `ui.ts`，两列都加（漏加 en 列 TypeScript 直接报错，类型即护栏）；
- **新增 JS 动态文案** → 只改 `main.js` 的 `RT` 表，两列都加；
- RT 键改动需**同步三处**：`main.js` RT 表、`SearchModal.astro` 静态初始态、`ui.ts` 对应条目（`main.js` 内有注释锚点提醒）；
- 模板里取文案一律 `t.xxx`，**禁止**在模板里散落 `lang === 'zh' ? '中' : 'EN'` 三元——文案只住字典，不住模板。

### 8.4 页面结构：共享模板 + 双薄壳

- 页面实现一律写进 `src/templates/*View.astro`（组件吃 `lang` prop，内部经 `t = ui[lang]` 取文案、`localePath(lang, …)` 生成链接）；
- `src/pages/*.astro`（中文）与 `src/pages/en/*.astro`（英文）**都只是薄壳**：一行 import + 传 lang，不放任何实现；
- **新增页面** = 写一个 View 模板 + 中英两个薄壳（对照 `src/pages/en/` 下现有 9 个薄壳抄结构）；
- **最大陷阱**：薄壳忘记给 `<Base>` 传 `lang` → 英文页 `<html data-lang="zh">`、文案全中文、字典取错列。自检方法：build 后在 `dist/en/` 里 grep `data-lang`，必须全是 `en`。

### 8.5 术语与风格约定（英文稿）

| 中文 | 英文处理 | 理由 |
|------|----------|------|
| 不器 | **Buqi**（不译） | 核心自指概念，音译保身份；首次出现加注 `(a vessel not fixed to one use)` |
| 君子不器 | **Junzi Buqi** | 同上，作为专名对待 |
| 渊 / 墨色意象 | 意译为 abyss / ink 等，不逐字 | 保留气象优先于字面对应 |

其余新专名沿用同一原则：**有文化负载的专名音译 + 首现注释；普通词意译**。

### 8.6 新增第三种语言（如 ja）的扩展路径

按顺序动这些点（TypeScript 类型系统会逼着补完大半）：

1. `src/i18n/ui.ts`：`languages` 加 `ja: '日本語'` → `Lang` 类型自动扩展 → 所有 `Record<Lang, …>` 映射（`htmlLang` / `ogLocale` / `giscusLocale` / 字典列）依次补列；
2. `astro.config.mjs`：`i18n.locales` 加 `'ja'`（`defaultLocale` 保持 `'zh'` 不动，中文依旧无前缀）；
3. `src/i18n/ui.ts` 的 `localePath` / `otherLocalePath`：目前是 zh/en 二值硬编码（`/en` 前缀字符串写死），需泛化为「非默认语言一律加 `/${lang}` 前缀」的通用实现；
4. `src/layouts/Base.astro`：`other` 变量目前 `lang === 'zh' ? 'en' : 'zh'` 二值互斥，需改为遍历 `languages` 生成全部互指；hreflang 区块同步泛化；
5. `src/pages/ja/`：复制 `src/pages/en/` 薄壳目录，全部改传 `lang="ja"`；
6. 内容层：`src/content.config.ts` 的 `z.enum(['zh', 'en'])` 加 `'ja'`；配对逻辑 `getPostPairs()` 的桶结构天然支持 >2 支，验证 fallback 标注即可；
7. `src/scripts/main.js`：`RT` 表加 ja 列；
8. 无需处理：Pagefind（按页面 `lang` 属性自动分语种索引）、shiki（代码高亮与站点语言无关）。

工作量集中在第 3、4、5 步（路由前缀与互指泛化），其余是机械补列。

### 8.7 明暗主题维护要点

- **令牌层**：`src/styles/global.css` 的 `:root` = 暗色（渊墨），`html[data-theme='light']` 整组覆盖（宣纸）；`--void-rgb` 等 RGB 三元组令牌供 `rgba()` 派生——**改色时两主题同步改**，派生透明度自动跟随；
- **切换契约**：`main.js` 响应点击 → 写 `localStorage('unv-theme')` → **在 `document` 上**派发 `unv:theme`（`detail.theme`）→ `Comments.astro`（giscus）与 `ink.js`（流体墨）各自在 document 上监听跟随；
- **事件目标铁律**：全站组件间自定义事件一律 `document.dispatchEvent` / `document.addEventListener`——直接派发到 `window` 的事件不经过 document，document 监听器收不到（踩过一次）；
- **防闪烁**：`Base.astro` head 里的内联脚本在首帧前同步写 `data-theme`（localStorage > prefers-color-scheme > dark）。该脚本必须保持**内联 + `is:inline`**，不能挪进打包 JS——挪走必然首帧闪烁；
- **换页保活**：`ClientRouter` 换页会丢 `<html>` 属性，`main.js` 在 `astro:after-swap` 重读 localStorage 重写 `data-theme`（已内置，勿删）；
- **新组件需要跟主题时**：`document.addEventListener('unv:theme', handler)` + 初始化时读一次 `document.documentElement.dataset.theme`；
- **ink.js 新增视觉元素**：上色统一 `mix(col, target, k)`，且 target 自身 `mix(暗色, 亮色, u_light)`——暗底零回归、亮底自动向墨靠拢。
