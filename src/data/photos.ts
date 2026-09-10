// ============================================================
// photos.ts — 相册数据（/photos 页面唯一数据源）
// ============================================================
// 零维护设计：照片丢进 public/photos/ 即自动上墙，无需改任何代码。
//
// 构建期扫描（Node fs，非浏览器 API）：
//   1. 扫描 public/photos/ 下的图片文件（jpg / jpeg / png / webp / gif / avif）；
//   2. 文件名约定解析图注：
//        2026-09-10-渊面.jpg      → 日期 2026-09-10，标题「渊面」
//        渊面.jpg                 → 日期取文件修改时间，标题「渊面」
//      （标题 = 文件名去掉日期前缀与扩展名，连字符首尾会清理）
//   3. 目录不存在会自动创建；目录为空 = 相册显示「胶卷未装」空状态
//      （真实状态，不是假图占位）。
//
// 建议规格：.jpg / .webp，长边 ≤ 2000px（体积直接决定相册页加载速度）。
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isoDate } from '../lib/utils';

/** 单张照片的展示信息 */
export interface Photo {
  /** 图片路径（站点绝对路径，如 '/photos/2026-09-10-渊面.jpg'） */
  src: string;
  /** 标题（图注第一行，来自文件名约定） */
  title: string;
  /** 拍摄日期 YYYY-MM-DD（文件名日期前缀，缺省取文件修改时间） */
  date: string;
  /** 拍摄笔记（预留：将来若需要补充说明再扩展同名 .json 方案） */
  note?: string;
}

/** 照片目录（public/ 下的文件原样进入构建产物，路径即 /photos/<文件名>） */
const PHOTOS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'public', 'photos'
);

/** 接受的图片扩展名（小写比较） */
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

/**
 * 从文件名解析 { title, date }：
 *   - 匹配开头 YYYY-MM-DD 前缀 → date = 前缀，title = 余部；
 *   - 无前缀 → date 用文件修改时间（mtime 的本地日期），title = 整个文件名。
 * 标题首尾的连字符/空格清理掉（'2026-09-10--渊面.jpg' 也解析正常）。
 */
function parseFileName(name: string, mtime: Date): { title: string; date: string } {
  const stem = name.replace(/\.[^.]+$/, ''); // 去扩展名
  const m = stem.match(/^(\d{4}-\d{2}-\d{2})[-_\s]*(.*)$/);
  if (m) {
    return { date: m[1], title: m[2].replace(/^[-_\s]+|[-_\s]+$/g, '') || stem };
  }
  return { date: isoDate(mtime), title: stem };
}

/**
 * 扫描照片目录，返回按日期倒序的照片列表（新的在前）。
 * 构建期执行；目录不存在时顺带创建（用户拿到一个可投放的空目录）。
 */
export function scanPhotos(): Photo[] {
  if (!fs.existsSync(PHOTOS_DIR)) {
    fs.mkdirSync(PHOTOS_DIR, { recursive: true });
    return [];
  }

  const photos = fs
    .readdirSync(PHOTOS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && IMAGE_EXT.has(path.extname(e.name).toLowerCase()))
    .map((e) => {
      const full = path.join(PHOTOS_DIR, e.name);
      const { title, date } = parseFileName(e.name, fs.statSync(full).mtime);
      return { src: `/photos/${encodeURIComponent(e.name)}`, title, date };
    });

  // 日期倒序；同日按文件名稳定排序（同名前缀的编号序列不会乱跳）
  return photos.sort((a, b) => (a.date === b.date ? (a.src < b.src ? 1 : -1) : a.date < b.date ? 1 : -1));
}
