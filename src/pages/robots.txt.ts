// ============================================================
// robots.txt — 爬虫准入与 sitemap 指引
// ============================================================
// 构建时渲染为静态 /robots.txt。
// Sitemap 指向 @astrojs/sitemap 产出的 sitemap-index.xml，
// 域名基准来自 astro.config.mjs 的 site（单点配置）。
// ============================================================

import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  // 逐行拼装：放行所有爬虫 + 站点地图地址（绝对 URL）
  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${new URL('sitemap-index.xml', site)}`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
