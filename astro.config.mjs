// ============================================================
// Astro 配置 — unvessel / 不器
// ============================================================
// 站点形态：纯静态（SSG），部署到 Vercel（连 git 自动部署）。
// 多页视图过渡在 Base.astro 内用 <ClientRouter /> 启用，
// 巨字与流体墨在页面切换间通过 transition:persist 保持连续。
//
// i18n（2026-09-11 多语言改造）：
//   - 默认语言 zh：页面留在 src/pages/ 根，URL 无前缀（/posts/）；
//   - 英文 en：页面放 src/pages/en/，URL 自动带 /en/ 前缀（/en/posts/）；
//   - Astro.currentLocale 在构建期给出当前页语言，全站文案经
//     src/i18n/ui.ts 字典取值（界面跟语言走，内容跟稿子走）。
// ============================================================

// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // 正式域名：canonical / RSS / sitemap / OG 链接的基准。
  // 部署到 Vercel 后如绑定自定义域名，改这里即可（单点配置）。
  site: 'https://unvessel.vercel.app',

  // —— i18n 路由：zh 为默认（无前缀），en 走 /en/ 前缀 ——
  // prefixDefaultLocale: false → 中文页面保持原路径，
  // 已分享出去的 /posts/<uid>/ 等链接永远不断。
  i18n: {
    defaultLocale: 'zh',
    locales: ['zh', 'en'],
    routing: {
      prefixDefaultLocale: false,
    },
  },

  // sitemap：构建时产出 /sitemap-index.xml（robots.txt 与 <head> 都指向它）。
  // i18n 选项让 sitemap 为每个 URL 附 xhtml:link alternate（zh/en 互指），
  // 与 Base.astro <head> 里的 hreflang 标签同源一致。
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'zh',
        locales: {
          zh: 'zh-CN',
          en: 'en',
        },
      },
    }),
  ],

  // Markdown：GitHub 风格语法；代码高亮用 shiki 双主题——
  // 明暗改造后站点有「渊（暗）／纸（亮）」两态，代码块跟随主题：
  //   defaultColor: false → 不输出内联色，两个主题都以
  //   --shiki-light / --shiki-dark CSS 变量内联到每个 token，
  //   由 global.css 按 html[data-theme] 选择启用哪套变量。
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      defaultColor: false,
    },
  },
});
