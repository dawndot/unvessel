// ============================================================
// Astro 配置 — unvessel / 不器
// ============================================================
// 站点形态：纯静态（SSG），部署到 Vercel（连 git 自动部署）。
// 多页视图过渡在 Base.astro 内用 <ClientRouter /> 启用，
// 巨字与流体墨在页面切换间通过 transition:persist 保持连续。
// ============================================================

// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // 正式域名：canonical / RSS / sitemap / OG 链接的基准。
  // 部署到 Vercel 后如绑定自定义域名，改这里即可（单点配置）。
  site: 'https://unvessel.vercel.app',

  // sitemap：构建时产出 /sitemap-index.xml（robots.txt 与 <head> 都指向它）。
  integrations: [sitemap()],

  // Markdown：GitHub 风格语法；代码高亮用 shiki 的双主题
  //（墨渊只有黑，两态都给暗色，避免高亮层颜色跳出气质）。
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-dark',
        dark: 'github-dark',
      },
    },
  },
});
