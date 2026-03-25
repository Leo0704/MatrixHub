# matrixhub - AI 运营大师

> 多平台内容创作与发布管理工具 | 矩阵运营 | 自动化发布 | AI 驱动

---

## 目录

- [项目简介](#项目简介)
- [核心功能](#核心功能)
- [技术架构](#技术架构)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [模块详解](#模块详解)
- [API 参考](#api-参考)
- [配置说明](#配置说明)
- [测试指南](#测试指南)
- [常见问题](#常见问题)

---

## 项目简介

MatrixHub 是一款面向内容创作者和矩阵运营者的桌面应用，支持抖音、快手、小红书三大平台的内容发布、自动化运营和数据洞察。

### 目标用户

- **内容创作者**：需要同时管理多个平台账号的创作者
- **矩阵运营者**：运营多个账号进行批量内容发布的团队
- **MCN 机构**：需要统一管理旗下账号的内容编排和发布

### 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 34 |
| 前端 | React 19 + TypeScript + Vite |
| 后端服务 | Node.js (服务进程) |
| 数据库 | SQLite (better-sqlite3) |
| 浏览器自动化 | Playwright |
| AI 集成 | 多 Provider 支持 (OpenAI/Anthropic/国产模型) |
| 日志 | electron-log |
| 测试 | Vitest + Playwright |

---

## 核心功能

### 1. 多平台内容发布

支持抖音、快手、小红书三平台的视频/图文内容发布：

**发布流程（检查点机制）：**
1. `navigate` — 导航到发布页面
2. `login_check` — 验证登录状态
3. `fill_form` — 填写发布表单（标题、内容、图片/视频）
4. `confirm_publish` — 确认发布

**核心特性：**
- 定时发布：支持设置未来时间自动发布（`scheduledAt` 字段）
- 批量发布：多账号批量选择，一次提交多个任务
- 状态追踪：每步执行后保存检查点，崩溃可恢复
- 失败重试：自动分类错误（selector/rate_limit/network/login/timeout），按类型应用不同退避策略
- 页面复用：发布后保持页面登录状态，供后续任务复用，避免重复登录

### 2. AI 内容生成

集成多种 AI 模型进行内容创作，支持 **12 个 Provider**：

| Provider | 说明 | 接口类型 |
|----------|------|----------|
| OpenAI | gpt-4, gpt-3.5-turbo | OpenAI API |
| Anthropic | claude-3-opus, claude-3-sonnet | Anthropic Messages API |
| Ollama | llama2, mistral 等本地模型 | REST |
| 智谱 | glm-4, glm-3-turbo | OpenAI 兼容 |
| Kimi | moonshot-v1 | OpenAI 兼容 |
| 通义千问 | qwen-turbo, qwen-plus | OpenAI 兼容 |
| 豆包 | doubao-pro | OpenAI 兼容 |
| DeepSeek | deepseek-chat | OpenAI 兼容 |
| 讯飞星火 | spark-3.5 | 讯飞私有协议 |
| Minimax | 海螺AI | OpenAI 兼容 |
| Yi | 零一万物 | OpenAI 兼容 |
| SiliconFlow | 第三方聚合 | OpenAI 兼容 |

**AI 应用场景：**
- **失败分析**：任务失败时 AI 分析原因（selector 失效/限流/登录问题等），给出修复建议和重试策略
- **每日策略**：根据近期发布数据和账号状态，生成每日内容计划
- **热点追踪**：判断是否要蹭某个热点，给出内容角度建议

**熔断保护**：每个 Provider 独立熔断器，连续失败 5 次自动熔断 1 分钟，半开状态连续成功 3 次才恢复

### 3. 浏览器自动化运营

模拟真人操作进行自动化运营，基于 Playwright 浏览器池实现：

**自动化操作：**

| 操作 | 行为 |
|------|------|
| `auto_reply` | 进入"我的帖子"，遍历评论列表进行回复，支持自定义回复文本和最大回复数 |
| `auto_like` | 进入发现页，滚动 feed流，对视频执行点赞，每 5 个视频模拟一次阅读暂停 |
| `auto_follow` | 进入发现页，滚动推荐内容，点击关注按钮，自动跳过已关注用户 |
| `comment_management` | 进入评论管理页，采集评论列表（作者、内容、时间），支持删除/回复 |

**人类行为模拟：**
- 每次操作间隔随机延迟（1.2s - 3.5s）
- 每 5 次操作模拟一次"阅读"暂停（3s - 7s）
- 使用三次贝塞尔曲线生成自然鼠标轨迹
- 分块滚动（100-300px/块），块间随机停顿

### 4. Page Agent 智能自动化

基于自然语言的智能页面操作，通过 AI 理解目标并自动执行多步操作：

**核心能力：**
- **自然语言目标**：用中文描述想要完成的任务，如"发布一个视频，标题是xxx"
- **多步执行**：AI 自动规划并执行一系列页面操作步骤
- **自适应容错**：操作失败时 AI 自动尝试替代方案

**配置参数：**
```typescript
interface PageAgentPayload {
  goal: string;           // 自然语言目标
  platform: Platform;     // 目标平台
  accountId: string;      // 执行账号
  url?: string;           // 目标 URL，默认导航到发布页
  maxSteps?: number;      // 最大步数，默认 20
  taskType?: 'text' | 'image' | 'video' | 'voice';  // 内容类型
}
```

### 5. 数据获取与热点检测

通过各平台数据抓取器获取真实热点数据和运营统计：

**热点话题抓取：**
- **抖音**：热榜话题（热搜词 + 热度分）
- **快手**：热榜话题
- **小红书**：热门话题

**运营数据获取：**
- **内容统计**：播放量、点赞、评论、分享数据
- **账号统计**：粉丝数、关注数、发布作品数、互动率

**数据格式：**
```typescript
interface HotTopic {
  keyword: string;   // 话题词
  heatScore: number; // 热度值
}
```

抓取后按热度排序，支持传入 AI 分析蹭热点价值。

### 6. 矩阵账号管理

**账号管理：**
- 支持抖音、快手、小红书三平台账号
- 每个账号独立登录状态（Session 持久化）
- 登录状态过期自动检测并提示重新登录

**分组管理：**
- 创建/编辑/删除分组（支持自定义颜色）
- 拖拽排序分组顺序
- 账号归入分组后可批量操作
- 删除分组时账号自动移出（不删除账号）

**标签管理：**
- 每个账号可设置多个标签（如"美食"、"探店"）
- 按标签筛选账号进行发布

### 7. 反检测机制

内置多层反检测措施，降低账号被识别风险：

| 措施 | 实现 |
|------|------|
| **浏览器参数** | `--disable-blink-features=AutomationControlled`、关闭 webdriver 变量 |
| **Canvas 指纹** | `toDataURL` / `getImageData` 注入随机噪声，每次读取结果不同 |
| **WebGL 指纹** | 随机化 `UNMASKED_VENDOR_WEBGL` 和 `UNMASKED_RENDERER_WEBGL` |
| **鼠标轨迹** | 三次贝塞尔曲线 + 随机控制点偏移 + 微小抖动 |
| **滚动行为** | 分块滚动（100-300px/块）+ 块间随机停顿（50-350ms）+ 模拟惯性 |
| **延迟分布** | Box-Muller 正态分布，每 5 次操作模拟"阅读"暂停（3-7 秒）|
| **隐身模式** | 删除 `navigator.webdriver`、自动化特征变量 |
| **语言/连接** | 伪造 Languages、4g 有效类型 |

### 8. 任务队列与调度

基于 SQLite 的持久化任务队列，支持高并发执行：

**任务状态机：**
```
pending → running → completed
              ↓
         deferred → pending (等待后重试)
              ↓
           failed (重试耗尽)
```

**核心特性：**
- 原子性出队：`UPDATE ... RETURNING` 防止多 worker 抢任务
- 智能重试：错误分类 + 维护窗口检测 + 指数退避
- 崩溃恢复：每步执行后保存检查点（step + payload），重启自动从断点恢复
- 并发控制：最多 3 个任务并行执行，队列积压时自动缩短轮询间隔

**平台维护窗口避让：**
| 平台 | 避让时段（北京时间） |
|------|---------------------|
| 抖音 | 03:00-05:00, 23:00-24:00 |
| 快手 | 02:00-04:00, 23:00-24:00 |
| 小红书 | 02:00-06:00, 22:00-24:00 |

### 9. 限流保护

三级令牌桶限流（分钟/小时/天），防止触发平台风控：

| 平台 | 分钟 | 小时 | 天 |
|------|------|------|-----|
| 抖音 | 10 | 200 | 1000 |
| 快手 | 15 | 300 | 2000 |
| 小红书 | 5 | 100 | 500 |

使用 Promise 队列替代自旋锁，避免 CPU 空转。配额消耗记录持久化到数据库，重启后可恢复。

### 10. 选择器版本管理

页面元素选择器（CSS Selector）失效时自动降级：

- 注册多个候选选择器（按优先级排序）
- 跟踪每个选择器的成功率
- 成功率低于 50% 时自动降级到备用选择器
- 支持手动更新选择器版本

---

## 技术架构

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron 主进程                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   UI 渲染   │  │  IPC 处理   │  │   服务进程管理      │  │
│  │  (React)   │  │             │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ IPC
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    服务进程 (Service Process)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  任务队列    │  │  限流器     │  │   监控服务          │  │
│  │  TaskQueue  │  │ RateLimiter │  │  MonitoringService  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  AI 网关    │  │  热点检测   │  │   AI 导演          │  │
│  │  AIGateway │  │HotTopicDetector│ │   AI Director     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    浏览器池 (Browser Pool)                   │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐            │
│  │  Chromium │  │  Chromium │  │  Chromium │            │
│  │  (抖音)   │  │  (快手)   │  │  (小红书)  │            │
│  └───────────┘  └───────────┘  └───────────┘            │
│                                                             │
│  ┌───────────────────────────────────────────────────┐     │
│  │              页面池 (Per-Account Pages)           │     │
│  │   [账号1-页面] [账号2-页面] [账号3-页面] ...      │     │
│  └───────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### 任务流程

```
用户创建任务
     │
     ▼
任务入队 (pending)
     │
     ▼
服务循环轮询
     │
     ▼
原子性出队 (dequeue)
     │
     ▼
任务执行 (running)
     │
     ├──► 成功 ──► completed，清除检查点
     │
     └──► 失败 ──► 保存检查点，智能重试
                    │
                    ├──► 重试次数未达上限 ──► deferred，等待后重试
                    │
                    └──► 重试次数耗尽 ──► failed，触发 AI 分析
```

### 选择器版本管理

当页面元素选择器失效时，系统自动降级：

```
注册新选择器 (v2)
      │
      ▼
  活跃选择器 (v2)
      │
      ▼ (失败率 > 50%)
降级到 v1 或备用选择器
```

---

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9
- macOS / Windows / Linux

### 安装

```bash
# 克隆项目
git clone <repository-url>
cd matrixhub

# 安装依赖
npm install

# 开发模式启动
npm run dev
```

### 构建

```bash
# 构建生产版本
npm run build

# 打包应用
npm run dist
```

### 运行测试

```bash
# 单元测试
npm test

# E2E 测试
npm run test:e2e

# 带 UI 的 E2E 测试
npm run test:e2e:ui
```

---

## 项目结构

```
matrixhub/
├── src/
│   ├── main/                    # Electron 主进程入口
│   │   └── index.ts
│   │
│   ├── preload/                 # 预加载脚本 (IPC 桥接)
│   │   └── index.ts
│   │
│   ├── libs/                    # 第三方库集成
│   │   └── douyin.js           # 抖音 SDK
│   │
│   ├── renderer/                 # React 前端
│   │   ├── App.tsx              # 根组件
│   │   ├── main.tsx             # 前端入口
│   │   ├── global.d.ts          # 全局类型声明
│   │   ├── pages/               # 页面组件
│   │   │   ├── Overview.tsx          # 总览
│   │   │   ├── AICreation.tsx       # AI 创建
│   │   │   ├── ScheduledPublish.tsx # 定时发布
│   │   │   ├── ContentManagement.tsx # 内容管理
│   │   │   ├── AccountManagement.tsx# 账号管理
│   │   │   ├── DataInsights.tsx     # 数据洞察
│   │   │   ├── SelectorSettings.tsx  # 选择器设置
│   │   │   └── Settings.tsx         # 设置
│   │   ├── components/          # 通用组件
│   │   │   ├── TaskRow.tsx
│   │   │   ├── StatCard.tsx
│   │   │   ├── Toast.tsx
│   │   │   └── PublishModal.tsx     # 发布弹窗
│   │   └── utils/               # 前端工具
│   │       └── formatTime.ts
│   │
│   ├── service/                  # 服务进程 (核心业务)
│   │   ├── service-process.ts   # 服务循环主入口
│   │   ├── db.ts                # 数据库管理
│   │   ├── queue.ts             # 任务队列
│   │   ├── rate-limiter.ts      # 限流器
│   │   ├── monitoring.ts         # 监控服务
│   │   ├── ai-gateway.ts        # AI 网关
│   │   ├── ai-director.ts       # AI 导演
│   │   ├── hot-topic-detector.ts# 热点检测
│   │   ├── strategy-engine.ts   # 策略引擎
│   │   ├── credential-manager.ts # 凭证管理
│   │   ├── account-group.ts     # 账号分组
│   │   ├── selector-versioning.ts # 选择器版本
│   │   ├── ipc-handlers.ts      # IPC 处理器
│   │   ├── platform-automation.ts # 平台自动化核心
│   │   ├── platform-launcher.ts # 浏览器和页面池
│   │   │
│   │   ├── handlers/            # 任务处理器
│   │   │   ├── index.ts              # 统一导出
│   │   │   ├── publish-handler.ts      # 发布任务
│   │   │   ├── automation-handler.ts    # 自动化任务
│   │   │   ├── ai-generate-handler.ts  # AI 生成任务
│   │   │   ├── fetch-handler.ts        # 数据获取任务
│   │   │   ├── page-agent-handler.ts    # Page Agent 任务
│   │   │   └── group-handlers.ts       # 分组管理任务
│   │   │
│   │   ├── config/              # 配置
│   │   │   ├── selectors.ts         # 平台选择器配置
│   │   │   ├── prompts.ts            # AI Prompt 配置
│   │   │   └── page-agent-prompts.ts # Page Agent 提示词
│   │   │
│   │   ├── data-fetcher/        # 数据获取
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── factory.ts
│   │   │   ├── base-fetcher.ts
│   │   │   ├── douyin/
│   │   │   ├── kuaishou/
│   │   │   └── xiaohongshu/
│   │   │
│   │   └── utils/               # 服务端工具
│   │       ├── page-helpers.ts       # 页面操作辅助
│   │       ├── human-behavior.ts     # 人类行为模拟
│   │       ├── fingerprint-randomizer.ts # 指纹随机化
│   │       ├── dom-extractor.ts      # DOM 提取
│   │       └── sleep.ts
│   │
│   └── shared/                  # 共享类型定义
│       └── types.ts
│
├── docs/                        # 文档
│   └── superpowers/
│       └── plans/               # 开发计划
│
├── e2e/                         # E2E 测试
│   └── *.spec.ts
│
├── dist/                        # 构建输出
├── release/                     # 打包输出
└── package.json
```

---

## 模块详解

### 服务进程 (service-process.ts)

服务进程是整个应用的核心，负责任务调度和执行。

**主要职责：**

1. **服务循环** - 持续轮询任务队列
2. **任务分发** - 根据任务类型调用对应处理器
3. **并发控制** - 最多同时执行 3 个任务
4. **AI 调度** - 每日简报和热点检测

**核心配置：**

```typescript
const MAX_CONCURRENT = 3;      // 最大并发任务数
const MIN_POLL_INTERVAL = 500;  // 最小轮询间隔 (ms)
const MAX_POLL_INTERVAL = 5000;  // 最大轮询间隔 (ms)
```

**智能轮询策略：**

- 并发满载时 → 较长间隔
- 队列积压多 → 短间隔加快
- 队列空闲 → 长间隔 + 抖动

### 任务队列 (queue.ts)

基于 SQLite 的持久化任务队列。

**任务状态机：**

```
pending ──► running ──► completed
                │
                ├──► deferred ──► (等待后) ──► pending
                │
                └──► failed
```

**核心特性：**

| 特性 | 说明 |
|------|------|
| 原子性出队 | 使用 `UPDATE ... RETURNING` 防止多 worker 抢任务 |
| 检查点机制 | 每步执行后保存状态，崩溃可恢复 |
| 智能重试 | 错误分类 + 维护窗口检测 + 指数退避 |
| 过期清理 | 24 小时检查点自动清除 |

**错误分类与重试策略：**

| 错误类型 | 等待倍数 | 说明 |
|----------|----------|------|
| selector | 1.0x | 选择器问题，快速重试 |
| rate_limit | 3.0x | 限流，大幅等待 |
| network | 1.5x | 网络问题 |
| login | 5.0x | 登录问题，最大等待 |
| timeout | 1.2x | 超时问题 |

**平台维护窗口：**

| 平台 | 维护时段 (北京时间) |
|------|-------------------|
| 抖音 | 03:00-05:00, 23:00-24:00 |
| 快手 | 02:00-04:00, 23:00-24:00 |
| 小红书 | 02:00-06:00, 22:00-24:00 |

### 限流器 (rate-limiter.ts)

三级令牌桶限流。

**限制配置：**

| 平台 | 每分钟 | 每小时 | 每天 |
|------|--------|--------|------|
| 抖音 | 10 | 200 | 1000 |
| 快手 | 15 | 300 | 2000 |
| 小红书 | 5 | 100 | 500 |

**锁机制：**

使用 Promise 队列替代自旋锁，避免 CPU 空转。

### 浏览器池 (platform-launcher.ts)

管理 Chromium 浏览器实例和页面池。

**页面池设计：**

- 按 `(platform, accountId)` 隔离
- 登录状态保持，不超时关闭
- 最多 5 个页面/平台
- 复用而非重建

**反检测措施：**

```typescript
// 启动参数
'--disable-blink-features=AutomationControlled'
'--no-sandbox'
'--disable-dev-shm-usage'

// 注入脚本
navigator.webdriver = undefined
HTMLCanvasElement.prototype.toDataURL 注入噪声
WebGLRenderingContext.prototype.getParameter 随机化
```

### 人类行为模拟 (human-behavior.ts)

使自动化操作更接近真人。

**鼠标轨迹：**

- 三次贝塞尔曲线
- 随机控制点偏移
- 微小抖动

**滚动模式：**

- 分块滚动 (100-300px/块)
- 块间随机停顿 (50-350ms)
- 模拟手指惯性

**延迟分布：**

- 使用 Box-Muller 生成正态分布
- 每 5 次操作模拟"阅读"暂停 (3-7 秒)

### 指纹随机化 (fingerprint-randomizer.ts)

每次浏览器上下文创建时生成不同的随机化脚本。

**随机化内容：**

| 项目 | 方法 |
|------|------|
| Canvas | toDataURL/getImageData 注入随机噪声 |
| WebGL | UNMASKED_VENDOR/RENDERER 随机化 |
| Permissions | query 方法拦截 |
| Plugins | 伪造 Chrome PDF 插件列表 |
| Languages | ['zh-CN', 'zh', 'en-US', 'en'] |
| Connection | 伪造 4g/effectiveType |

### AI 网关 (ai-gateway.ts)

统一的多 AI Provider 接口。

**支持的 Provider：**

| Provider | 模型示例 |
|----------|----------|
| OpenAI | gpt-4, gpt-3.5-turbo |
| Anthropic | claude-3-opus, claude-3-sonnet |
| Ollama | llama2, mistral |
| 智谱 | glm-4, glm-3-turbo |
| Kimi | moonshot-v1 |
| 通义千问 | qwen-turbo, qwen-plus |
| 豆包 | doubao-pro |
| DeepSeek | deepseek-chat |
| 讯飞星火 | spark-3.5 |
| SiliconFlow | OpenAI 兼容接口 |
| Minimax | 海螺AI |
| Yi | 零一万物 |

### AI 导演 (ai-director.ts)

AI 驱动的运营决策。

**功能：**

1. **失败分析** - 分析任务失败原因，给出修复建议
2. **每日策略** - 生成每日运营计划
3. **热点追踪** - 分析热点话题，给出内容角度建议

---

## API 参考

### 任务相关

#### 创建任务

```typescript
ipcRenderer.invoke('task:create', {
  type: 'publish',
  platform: 'douyin',
  title: '发布视频',
  payload: {
    accountId: 'account-uuid',
    title: '视频标题',
    content: '视频描述',
    video: '/path/to/video.mp4',
  },
  scheduledAt: Date.now() + 3600000, // 可选，延迟发布
});
```

#### 查询任务

```typescript
ipcRenderer.invoke('task:list', {
  status: ['pending', 'running'],
  platform: 'douyin',
  limit: 50,
});
```

### 账号相关

#### 添加账号

```typescript
ipcRenderer.invoke('account:add', {
  platform: 'douyin',
  username: 'douyin_username',
  displayName: '我的抖音号',
  groupId: 'group-uuid', // 可选
  tags: ['美食', '探店'],
});
```

### 自动化任务

#### 创建自动化任务

```typescript
ipcRenderer.invoke('task:create', {
  type: 'automation',
  platform: 'douyin',
  title: '自动回复',
  payload: {
    action: 'auto_reply',
    accountId: 'account-uuid',
    config: {
      replyText: '感谢关注！',
      maxReplies: 10,
    },
  },
});
```

#### 支持的自动化操作

| action | 说明 | config |
|--------|------|--------|
| auto_reply | 自动回复评论 | replyText, maxReplies, keywords |
| auto_like | 自动点赞 | maxLikes |
| auto_follow | 自动关注 | maxFollows |
| comment_management | 评论管理 | action (list/delete/reply), targetId |

---

## 配置说明

### 平台选择器 (selectors.ts)

发布表单和自动化操作的选择器配置。

**结构：**

```typescript
const PUBLISH_SELECTORS: Record<Platform, Record<string, string[]>> = {
  douyin: {
    title_input: ['[data-e2e="title-input"]', '#title', 'input[placeholder*="标题"]'],
    publish_confirm: ['[data-e2e="publish-btn"]', 'button:has-text("发布")'],
    // ...
  },
  // ...
};
```

### AI Prompt (prompts.ts)

各类 AI 任务的 Prompt 模板。

### 限流配置 (rate-limiter.ts)

可在创建 RateLimiter 时覆盖默认配置：

```typescript
const rateLimiter = new RateLimiter({
  douyin: {
    requestsPerMinute: 15,
    requestsPerHour: 250,
    requestsPerDay: 1200,
  },
});
```

---

## 测试指南

### 单元测试

```bash
# 运行所有单元测试
npm test

# 监听模式
npm run test:watch

# 带覆盖率
npm run test:coverage
```

### E2E 测试

```bash
# 运行 E2E 测试
npm run test:e2e

# 带 UI
npm run test:e2e:ui
```

### 关键测试文件

| 文件 | 测试内容 |
|------|----------|
| `queue.test.ts` | 任务创建、出队、重试、状态转换 |
| `rate-limiter.test.ts` | 限流检查、配额消耗 |
| `selector-versioning.test.ts` | 选择器注册、成功率跟踪、降级 |
| `fingerprint-randomizer.test.ts` | 指纹脚本生成 |
| `human-behavior.test.ts` | 鼠标轨迹、滚动模式、延迟生成 |
| `data-fetcher.test.ts` | 数据获取器工厂、平台实例化 |

---

## 常见问题

### Q: 任务执行失败怎么办？

1. 检查错误类型（选择器/限流/网络/登录）
2. 系统会根据错误类型自动调整重试间隔
3. 可在任务详情页手动重试

### Q: 如何添加新平台支持？

1. 在 `src/shared/types.ts` 添加 Platform 类型
2. 在 `selectors.ts` 添加选择器配置
3. 在 `rate-limiter.ts` 添加限流配置
4. 在 `hot-topic-detector.ts` 添加热点检测逻辑

### Q: 选择器失效如何处理？

1. 系统会自动降级到备用选择器
2. 可在设置页手动更新选择器
3. AI 会分析失败原因并建议修复

### Q: 如何避免账号被封？

1. 使用人类行为模拟（鼠标轨迹、延迟）
2. 遵守平台限流规则
3. 避免在维护窗口执行任务
4. 使用指纹随机化

### Q: 任务卡住了怎么办？

1. 系统有 1 小时超时自动清理机制
2. 可手动取消任务后重新创建
3. 检查网络连接是否正常

---

## 开发指南

### 添加新的任务类型

1. 在 `TaskType` 添加类型定义
2. 创建对应的 Handler
3. 在 `service-process.ts` 添加处理分支
4. 在 IPC Handler 注册新通道

### 添加新的 AI Provider

1. 在 `ai-gateway.ts` 添加 provider 配置
2. 实现 provider 的 chat 方法
3. 在 `prompts.ts` 添加对应的 system prompt

---

## 许可证

MIT
