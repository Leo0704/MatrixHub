# Design System — AI矩阵运营大师

## Product Context
- **What this is:** 多平台内容创作与发布管理工具，支持抖音/快手/小红书三大平台
- **Who it's for:** 个人创作者，需要统一管理多平台内容资产
- **Space/industry:** 内容创作工具 / 创作者经济
- **Project type:** Electron 桌面应用（数据密集型工具）

## Aesthetic Direction
- **Direction:** Industrial-Utilitarian（工业功能主义）
- **Decoration level:** minimal — 功能优先，无装饰元素
- **Mood:** 专业级控制台，长时间使用不疲劳，工具感强烈
- **Reference sites:** Linear, Raycast, Vercel Dashboard

## Typography
- **Display/Hero:** Noto Sans SC — 中文字体优先，光滑现代
- **Body:** Noto Sans SC — 统一中文阅读体验
- **UI/Labels:** Noto Sans SC — 同 body
- **Data/Tables:** JetBrains Mono — 等宽字体，数据对齐，支持 tabular-nums
- **Code/状态:** JetBrains Mono
- **Loading:** 系统等宽字体回退
- **Scale:**
  - Hero: 48px / 1.1
  - H1: 32px / 1.2
  - H2: 24px / 1.3
  - H3: 18px / 1.4
  - Body: 14px / 1.5
  - Small: 12px / 1.5
  - Micro: 10px / 1.4

## Color
- **Approach:** 克制 + 功能色
- **CSS Variables:**
  ```css
  /* 背景层次 */
  --bg-base: #0a0a0b;      /* 主背景，近纯黑 */
  --bg-surface: #111113;    /* 卡片/面板 */
  --bg-elevated: #18181b;   /* 悬浮/下拉 */
  --bg-overlay: #27272a;   /* 模态/遮罩 */

  /* 边框 */
  --border-subtle: #27272a; /* 细微分割 */
  --border-default: #3f3f46; /* 标准边框 */
  --border-strong: #52525b; /* 强调边框 */

  /* 文本 */
  --text-primary: #fafafa;  /* 主要文字 */
  --text-secondary: #a1a1aa; /* 次要文字 */
  --text-muted: #71717a;    /* 禁用/提示 */
  --text-disabled: #52525b; /* 禁用状态 */

  /* 主色 */
  --primary: #3b82f6;       /* 主操作 */
  --primary-hover: #60a5fa;
  --primary-muted: #1d4ed8;

  /* 功能色 */
  --accent-orange: #f97316; /* 热点/警告（唯一强调色）*/
  --accent-orange-muted: #c2410c;
  --success: #22c55e;
  --success-muted: #15803d;
  --error: #ef4444;
  --error-muted: #b91c1c;
  --warning: #eab308;
  --info: #06b6d4;

  /* 平台色 */
  --platform-douyin: #fe2c55;
  --platform-kuaishou: #ff4906;
  --platform-xiaohongshu: #ff2442;
  ```
- **Dark mode:** 默认深色，浅色版本降低饱和度 10-20%

## Spacing
- **Base unit:** 4px
- **Density:** 紧凑（compact）— 信息密度优先
- **Scale:** 2xs(2) xs(4) sm(8) md(12) lg(16) xl(24) 2xl(32) 3xl(48)

## Layout
- **Approach:** 混合 — 工具区网格，营销/表单区编辑布局
- **Grid:** 12列网格，侧边240px固定
- **Max content width:** 1440px
- **Border radius:** sm:4px, md:6px, lg:8px, full:9999px
- **阴影:** 仅用于悬浮态（subtle glow + border）

## Motion
- **Approach:** minimal-functional — 仅状态过渡，无装饰动画
- **Easing:** enter: ease-out, exit: ease-in, move: ease-in-out
- **Duration:** micro(50-100ms), short(150-200ms), medium(250-350ms)
- **禁止:** 弹性动画、悬浮视差、滚动联动

## Component Tokens

### Button
- **Primary:** bg-primary, text-white, h:40px, px:16px, radius:6px
- **Secondary:** bg-transparent, border-default, text-secondary, h:40px
- **Ghost:** bg-transparent, text-secondary, h:32px
- **Danger:** bg-error, text-white

### Input
- **Default:** bg-bg-surface, border-border-subtle, h:36px, px:12px, radius:6px
- **Focus:** border-primary, ring:2px primary/20%
- **Error:** border-error, ring:2px error/20%

### Card
- **bg:** bg-surface
- **border:** border-subtle
- **radius:** 8px
- **padding:** 16px

### Badge/Tag
- **Platform tag:** 对应平台色，bg-opacity-10，text-platform
- **Status badge:** 语义色背景10%透明度，对应文字色

## Dark Mode Strategy
- 默认深色主题
- 亮色模式：bg-base → #ffffff, bg-surface → #f4f4f5, 边框保持浅色
- 文本颜色在两种模式下均保证 WCAG AA 对比度

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-23 | Initial design system created | Created by /design-consultation for AI矩阵运营大师 |
