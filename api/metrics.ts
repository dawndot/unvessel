// ============================================================
// api/metrics.ts — 阅读量 / 点赞端点（Vercel Serverless Function）
// ============================================================
// 职责：文章页的轻量动态层。纯静态站点的唯一服务端组件。
//
// 协议：
//   POST /api/metrics  body: { slug: string, action: 'view' | 'like' }
//     → 原子自增对应计数器，返回 { views, likes }
//   GET  /api/metrics?slug=xxx
//     → 只读查询，返回 { views, likes }（列表页/后台用）
//
// 存储：Upstash Redis（REST API，纯 fetch 调用，零 npm 依赖）。
//   环境变量：UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
//   （Vercel 项目 Settings → Environment Variables 配置）
//
// 降级策略：环境变量未配置 → 一律 503。
//   前端 widget 对 503 / 网络失败的处理是「保持隐藏」，
//   因此未配置 Upstash 时用户侧完全无感 —— 服务降级即功能不存在。
//
// 防滥用（个人博客量级，刻意从简）：
//   - slug 白名单校验（只允许 slug 字符），阻断注入；
//   - 同 IP + slug 的 view 十分钟内去重（Redis SET NX EX）；
//   - like 的去重由前端 localStorage 承担（点赞是意愿表达，非精确统计）。
// ============================================================

/** Vercel Node 运行时提供 process 全局；本地无 @types/node，
 *  这里做最小环境声明，避免为单一 API 文件引入完整 Node 类型依赖。 */
declare const process: { env: Record<string, string | undefined> };

/** Upstash REST 端点与令牌（未配置 = 功能不存在） */
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

/** 服务端可用判定：两个环境变量齐全才工作 */
const READY = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

/** 同 IP 重复阅读的去重窗口（秒）：十分钟内的刷新不再计 view */
const VIEW_DEDUPE_TTL = 600;

/** slug 合法性：内容集合的文件名约定（小写字母/数字/连字符），防注入 */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

/** 统一 JSON 响应（带 no-store：计数永远是新鲜值） */
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/**
 * 调 Upstash REST：path 是「/命令/参数…」形式。
 * 失败一律抛错，由上层统一兜 503（Redis 故障 ≠ 页面故障，前端会降级隐藏）。
 */
async function redis(path: string): Promise<any> {
  const res = await fetch(`${UPSTASH_URL}${path}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`upstash: ${data.error}`);
  return data.result;
}

/**
 * 提取访客标识：优先 Vercel 注入的真实 IP 头，取不到退化为 'anon'。
 * 只用于 view 去重，不做持久化存储。
 */
function clientKey(req: Request): string {
  const ip =
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'anon';
  // Redis key 不能含空白/花括号等，简单转义即可（IP 格式本身安全，兜底替换）
  return ip.replace(/[^0-9a-zA-Z.:]/g, '_');
}

/** Vercel Serverless 入口（Node 运行时，Web 标准 Request/Response） */
export default async function handler(req: Request): Promise<Response> {
  // 未配置 Upstash：显式 503，前端据此隐藏 widget
  if (!READY) return json({ error: 'metrics not configured' }, 503);

  const url = new URL(req.url);
  const slug = req.method === 'POST'
    ? undefined // POST 的 slug 从 body 取（下面解析）
    : url.searchParams.get('slug') || undefined;

  try {
    // ---------- GET：只读查询 ----------
    if (req.method === 'GET') {
      if (!slug || !SLUG_RE.test(slug)) return json({ error: 'bad slug' }, 400);
      // pipeline：一次往返同时取 views / likes
      // （Upstash pipeline 响应结构：result: [{result: 值}, {result: 值}]；mget 单键返回 [值]）
      const [views, likes] = await redis(
        `/pipeline/mget/metrics:${slug}:views/mget/metrics:${slug}:likes`
      );
      const v = Number(views?.result?.[0] ?? 0);
      const l = Number(likes?.result?.[0] ?? 0);
      return json({ views: v, likes: l });
    }

    // ---------- POST：计数写入 ----------
    if (req.method === 'POST') {
      const body = await req.json().catch(() => null);
      const s: string | undefined = body?.slug;
      const action: string | undefined = body?.action;
      if (!s || !SLUG_RE.test(s)) return json({ error: 'bad slug' }, 400);
      if (action !== 'view' && action !== 'like') return json({ error: 'bad action' }, 400);

      const viewsKey = `metrics:${s}:views`;
      const likesKey = `metrics:${s}:likes`;

      if (action === 'view') {
        // 同 IP + slug 去重：SET NX EX 成功（首次）才自增 views
        const dedupeKey = `metrics:seen:${s}:${clientKey(req)}`;
        const first = await redis(`/set/${dedupeKey}/1/EX/${VIEW_DEDUPE_TTL}/NX`);
        if (first === 'OK') await redis(`/incr/${viewsKey}`);
      } else {
        // like：前端 localStorage 已挡重复，服务端只做白名单内自增
        await redis(`/incr/${likesKey}`);
      }

      // 回读最新值（pipeline 一次往返），让前端直接渲染
      const [views, likes] = await redis(
        `/pipeline/get/${viewsKey}/get/${likesKey}`
      );
      return json({
        views: Number(views?.result ?? 0),
        likes: Number(likes?.result ?? 0),
      });
    }

    return json({ error: 'method not allowed' }, 405);
  } catch (err) {
    // 存储层任何故障：503 + 前端降级。不把内部错误细节泄露给客户端。
    console.error('[metrics]', err);
    return json({ error: 'metrics unavailable' }, 503);
  }
}
