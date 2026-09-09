# design-v3 · 未器之城 CLAYVERSE（概念稿 v3）

> 不器 unvessel — 愿被看见，不被定义
> 完全不同风格的第三方向：**3D 黏土世界**

## 定位

应「再生成一个完全不同风格的设计」而生。与 v1/v2 的对照：

| 维度 | v1 纸·墨·朱 | v2 墨渊 INK VOID | **v3 未器之城 CLAYVERSE** |
|---|---|---|---|
| 底色 | 宣纸米白 | 纯黑 `#070707` | **暖白雾 `#f4f1ec`** |
| 强调色 | 朱砂 | 朱砂（唯一彩色） | **克莱因蓝 `#2242ff`** |
| 空间驱动 | 2D 排版 | 2D 排版 + 流体墨着色器 | **3D 空间（Three.js）** |
| 几何语言 | 全直角 | 全直角、发丝线 | **大圆角、pill、柔影** |
| 字体气质 | 思源宋巨字 | Anton / Noto Sans SC 900 巨字 | **Space Grotesk 几何轻盈** |
| 气质 | 文人静观 | 压迫锋利 | **轻盈可玩** |

## 世界观

漂浮着一群「未定型的器物」：扭结、环、球、胶囊、多面体——没有一个
是成形的容器，对应 **unvessel = 未成之器**。滚动即在其中穿行。

## 技术要点

- **Three.js 0.161 动态 import**（jsdelivr CDN），加载失败自动 `body.no-3d`
  降级为纯排版 + 静态渐变底，内容零损失
- **滚动驱动相机**：`scrollY / 可滚动高度` → 相机沿 z 前进 70 单位 +
  蛇形侧移 + 鼠标视差（慢插值 0.04~0.07）
- **器物动画**：各自随机相位 sin 浮动 + 慢自转；hover 弹簧放大 12% +
  克莱因蓝自发光微亮；点击触发指数衰减脉冲弹跳
- **性能**：DPR 钳 1.5；`visibilitychange` 停帧；dt 钳 0.05；
  `prefers-reduced-motion` 只渲染静帧
- **雾**：`Fog(0xf4f1ec, 14, 46)` 与底色同源，器物从雾中浮现

## 文件

```
v3-clayverse/
  index.html        结构（hero / works 白瓷卡 / manifesto / footer）
  assets/style.css  设计系统（11 章节，含 data-rv 显现约定）
  assets/scene.js   3D 场景（声明式器物清单 SPEC，易增删）
  assets/main.js    DOM 交互（字体入场闸门 + IO 显现）
```

## 预览

```
npx serve design-v3 -l 4300   →  http://localhost:4300
```

对比：v1 http://localhost:1281 · v2 http://localhost:4200

## 确认后下一步

三选一确认方向气质（v1 / v2 / v3）→ 以选中方向铺开完整站点
（文章页 / 归档 / 关于，沿用其令牌与动效体系）→ Phase 1 Astro 脚手架。
