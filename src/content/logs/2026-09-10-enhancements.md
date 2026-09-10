---
title: 增强轮：搜索、SEO、自托管字体与动态层骨架
date: 2026-09-10
kind: 站点
---

纯静态增益全量落地：Pagefind 中文站内搜索（⌘K 唤起）、SEO 全套（canonical / OG 图自动生成 / sitemap / robots / RSS）、字体全部自托管（零第三方 CDN）。

动态层埋好离线骨架：Giscus 评论与 Upstash 阅读量点赞共用「未配置 = 功能不存在」契约——密钥未填时产物里零 DOM、零脚本、零请求。填配置即点亮，无需改代码。

途中两个值得记的坑：字符串字面量的动态 import 带 @vite-ignore 仍会被 Rollup 静态解析（须变量承载路径）；Astro 的 processed script 无视模板条件全量打包（条件脚本只能 is:inline 放进 JSX 表达式）。
