# unvessel / 不器

> 愿被看见，不被定义。

个人博客。视觉方案：纯黑画布上 WebGL 三层域扭曲流体墨，巨字排版（Anton + Noto Sans SC 900），朱砂 `#ff3b2f` 唯一强调色。设计稿与原始资产见 `design-v2/`。

## 技术栈

- **Astro 5** 纯静态 SSG（islands + ClientRouter 视图过渡，`transition:persist` 保留墨画布跨页不闪）
- **原生 WebGL1** 三层 fbm 流体墨着色器（降级链：reduced-motion 静帧 → 无 WebGL 移除画布）
- **内容集合 + zod**：`src/content.config.ts` 在 build 时强制校验 frontmatter
- **字体自托管**：@fontsource 按字重引入，woff2 全部随构建进 `_astro/`（零第三方 CDN 依赖）
- **SEO 全套**：canonical / OG / Twitter Card / sitemap / robots.txt / RSS（`/feed.xml`）
- **Pagefind 站内搜索**：build 后对 `dist/` 建索引，⌘/Ctrl+K 或 `/` 唤起
- **动态层（可选）**：Giscus 评论 + 阅读量/点赞（Vercel Serverless + Upstash），未配置时产物零痕迹
- 部署：Vercel（连 git 自动部署，push 即上线）

## 快速开始

```bash
npm install        # 安装依赖
npm run dev        # 本地开发 http://localhost:4321
npm run build      # 构建（astro build）+ Pagefind 索引（pagefind --site dist）
npm run preview    # 预览 dist/ 构建产物（搜索索引只在 build 后存在）
```

> OG 分享图（`public/og-default.png`）由 `node scripts/og.mjs` 一次生成并永久定格，构建流水线不依赖 sharp。

## 目录结构

```
src/
  config/site.ts            # 可选外部服务集中配置（Giscus / 计数 API 占位开关）
  data/profile.ts           # 站点档案（邮箱/社交/建站日期，全站唯一数据源）
  data/works.ts             # 作品集数据（/works 页：状态机 live/building/archive；无外链 = 纯展示卡）
  data/photos.ts            # 相册数据（构建期自动扫描 public/photos/，文件名即图注，零维护）
  data/garden.ts            # 自留地·爱好数据（/garden 页：分组时间线，状态机 doing/done/wish）
  content.config.ts         # ① schema 层：zod 校验（posts + logs + ideas 三集合）
  content/posts/            # 文章目录（写 markdown 即运营；URL = /posts/<uid>/ 短链，与文件名解耦）
  content/logs/             # 网站日志（站点编年史，兼作热力图数据源）
  content/ideas/            # 灵感碎片（unv idea 秒记，秒级时间戳文件名，内容全在 frontmatter）
  layouts/Base.astro        # 全局骨架：head(SEO/OG) / 墨画布 / 顶栏 / 页脚 + 脚本装配
  pages/                    # 首页 / 文章 / 作品 / 相册 / 日志 / 自留地 / 关于 / 404
  pages/robots.txt.ts       # 动态生成 robots.txt（指向 sitemap）
  pages/feed.xml.ts         # RSS 订阅源（与列表页同一排序口径）
  components/PostRow.astro  # 文章列表签名行
  components/Heatmap.astro  # 写作活动热力图（构建期聚合文章+日志日期）
  components/SearchModal.astro  # 站内搜索浮层骨架（Pagefind 前端壳）
  components/Comments.astro # Giscus 评论区（未配置时构建期整体省略）
  components/Metrics.astro  # 阅读量/点赞 widget（API 缺席时自动隐藏）
  lib/activity.ts           # 活动聚合（热力图网格）+ 中文字数统计
  scripts/ink.js            # WebGL 流体墨（幂等，适配视图过渡）
  scripts/main.js           # 显现/光标/视差/搜索（幂等，挂 astro:page-load）
  styles/global.css         # 设计系统（令牌→巨字→prose→全部组件）
scripts/
  lib/ops.mjs               # ② 核心层：运营逻辑单一实现源
  new-post.mjs              # ③ CLI 壳：npm run new
  mcp-server.mjs            # ③ MCP 壳：AI 工具面（4 工具）
  og.mjs                    # OG 分享图生成器（sharp，SVG→PNG 1200×630）
bin/
  unvessel.mjs              # ③ 全局命令壳：unv new / publish / idea / logs …
api/
  metrics.ts                # 阅读量/点赞端点（Vercel Serverless + Upstash REST）
docs/AI-OPS.md              # AI 运营手册（接口四件套之一）
design/                     # 五版设计概念稿归档（v1-paper-ink / v2-ink-void 选定 / v3-clayverse / v4-atelier / v5-quest）
```

## AI 自动运营接口

三层一体：**schema（build 强校验）→ ops.mjs 核心（单一实现源）→ 全局命令 + npm 脚本 + MCP 三壳（行为一致）**。

```bash
npm link          # 一次性注册全局命令
unv new "标题" --desc "摘要" --tags 随笔,读书 --slug my-slug   # 建稿
unv publish my-slug                                            # 发布
unv idea "灵感碎片很随意的" --mood 夜跑                          # 灵感秒记（→ /garden/）
```

MCP 接入配置、四工具说明、AI 标准 SOP、可选功能启用步骤 → **[docs/AI-OPS.md](docs/AI-OPS.md)**

## 联络

hi@unvessel.me
