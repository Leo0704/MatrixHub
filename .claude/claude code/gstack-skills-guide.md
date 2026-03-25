# gstack 技能完整指南

> Garry Tan (Y Combinator CEO) 的 Claude Code 工具集 — 27 个技能，将 Claude 变成虚拟工程团队
>
> **当前版本: v0.11.18.2** (2026-03-24)

---

## 目录

- [工作流程概览](#工作流程概览)
- [思考阶段](#思考阶段)
  - [/office-hours](#office-hours)
- [规划阶段](#规划阶段)
  - [/autoplan](#autoplan)
  - [/plan-ceo-review](#plan-ceo-review)
  - [/plan-eng-review](#plan-eng-review)
  - [/plan-design-review](#plan-design-review)
- [设计阶段](#设计阶段)
  - [/design-consultation](#design-consultation)
  - [/design-review](#design-review)
- [审查阶段](#审查阶段)
  - [/review](#review)
  - [/codex](#codex)
  - [/investigate](#investigate)
- [测试阶段](#测试阶段)
  - [/qa](#qa)
  - [/qa-only](#qa-only)
  - [/browse](#browse)
  - [/setup-browser-cookies](#setup-browser-cookies)
  - [/benchmark](#benchmark)
- [发布阶段](#发布阶段)
  - [/ship](#ship)
  - [/land-and-deploy](#land-and-deploy)
  - [/canary](#canary)
  - [/document-release](#document-release)
- [反思阶段](#反思阶段)
  - [/retro](#retro)
- [安全工具](#安全工具)
  - [/careful](#careful)
  - [/freeze](#freeze)
  - [/guard](#guard)
  - [/unfreeze](#unfreeze)
- [配置工具](#配置工具)
  - [/setup-deploy](#setup-deploy)
  - [/gstack-upgrade](#gstack-upgrade)

---

## 工作流程概览

```
Think → Plan → Build → Review → Test → Ship → Reflect
```

每个技能的输出会自动传递给下游技能：

- `/office-hours` 生成设计文档 → `/plan-ceo-review` 读取
- `/plan-eng-review` 生成测试计划 → `/qa` 读取
- `/review` 捕获 bug → `/ship` 验证已修复

---

## 思考阶段

### /office-hours

**角色**: YC Office Hours 合伙人

**用途**: 每个项目都应该从这里开始。在你规划、审查、写代码之前，先坐下来思考你**真正**在构建什么。

**核心功能**:
1. **重新定义问题** — 不是你"想要构建什么"，而是你"实际上在构建什么"
2. **前提挑战** — 提出可证伪的产品主张，让你同意/不同意/调整
3. **实现方案** — 生成 2-3 个具体方案，附带诚实的工作量估算
4. **设计文档** — 写入 `~/.gstack/projects/`，供下游技能使用

**两种模式**:
- **创业模式** — 6 个强制性问题：需求现实、现状、绝望的具体性、最窄楔子、观察与惊喜、未来适配
- **构建者模式** — 黑客马拉松、副业项目、开源、学习 — 热情的协作者帮你找到最酷的版本

**示例**:
```
你: 我想构建一个日历的每日简报应用
你: /office-hours

Claude: 我要挑战你的框架。你说的是"每日简报应用"，
        但你实际描述的是一个私人参谋长 AI。

        [提取 5 个你没意识到的能力]
        [挑战 4 个前提 — 你同意/不同意/调整]
        [生成 3 个实现方案及工作量估算]

        建议：明天发布最窄的楔子，从真实使用中学习。
```

---

## 规划阶段

### /autoplan

**角色**: 三位 AI 评审同时审查

**用途**: CEO + Design + Eng 评审自动串联执行，每个阶段同时获得 Codex 和 Claude 独立评审。

**核心功能**:
- **Triple-Voice 评审** — 每个阶段同时运行 Codex (OpenAI) 和 Claude 子代理，3 个 AI 视角审视你的计划
- **结构化一致性表格** — 展示各模型在 6 个战略维度上的 CONFIRMED/DISAGREE
- **跨阶段综合** — 前期发现为后期提供上下文，高置信度信号自动突出
- **优雅降级** — Codex 或 Claude 失败时仍能继续，清晰标注降级模式

**流程**: CEO Review → Design Review → Eng Review，每个阶段包含：
1. Codex 挑战 + Claude 独立评审（并行）
2. 一致性表格生成
3. 跨阶段综合（下一阶段继承前一阶段发现）
4. 阶段门禁（STOP 标记防止跳过）

**输出**: 完整评审报告写入计划文件，附评分和建议。

---

### /plan-ceo-review

**角色**: CEO / 创始人模式 (Brian Chesby 模式)

**用途**: 重新思考问题，找到隐藏在请求中的 10 星产品。

**核心问题**: **这个产品到底是用来做什么的？**

**不是**: 实现显而易见的工单
**而是**: 从用户角度重新思考问题，找到必然、愉悦、甚至有点神奇的版本

**四种模式**:
| 模式 | 说明 |
|------|------|
| **SCOPE EXPANSION** | 大胆梦想。代理提出雄心勃勃的版本 |
| **SELECTIVE EXPANSION** | 保持当前范围，但看看还有什么可能 |
| **HOLD SCOPE** | 最大严格性审查现有计划 |
| **SCOPE REDUCTION** | 找到最小可行版本，削减其他一切 |

**示例**:
```
你: 让卖家为商品上传照片

Claude: "照片上传"甚至不是真正的功能。
        真正的功能可能是帮助某人创建一个真正能卖出去的列表。

        我们能从照片中识别产品吗？
        我们能推断 SKU 或型号吗？
        我们能搜索网络并自动起草标题和描述吗？
        我们能建议哪张照片最适合作为主图吗？
```

---

### /plan-eng-review

**角色**: 工程经理模式

**用途**: 一旦产品方向正确，锁定架构、数据流、边界条件、测试覆盖。

**核心关注**:
- 架构
- 系统边界
- 数据流
- 状态转换
- 失败模式
- 边界情况
- 信任边界
- 测试覆盖

**关键解锁**: **图表** — 序列图、状态图、组件图、数据流图、测试矩阵。图表迫使隐藏假设浮出水面。

**输出**: 测试计划写入 `~/.gstack/projects/`，供 `/qa` 使用

**Outside Voice**: 计划评审结束后，可获得来自不同 AI 模型（Codex CLI 或 Claude 子代理）的独立意见——找出评审遗漏的逻辑漏洞、未说明的假设、可行性风险。发现的分歧自动作为 TODO 建议。

**Review Readiness Dashboard**:
```
+====================================================================+
|                    REVIEW READINESS DASHBOARD                       |
+====================================================================+
| Review          | Runs | Last Run            | Status    | Required |
|-----------------|------|---------------------|-----------|----------|
| Eng Review      |  1   | 2026-03-16 15:00    | CLEAR     | YES      |
| CEO Review      |  1   | 2026-03-16 14:30    | CLEAR     | no       |
| Design Review   |  0   | —                   | —         | no       |
+--------------------------------------------------------------------+
```

---

### /plan-design-review

**角色**: 高级设计师审查你的计划

**用途**: 在写代码之前审查设计，捕获空状态、错误状态、加载状态、移动端布局、AI 模式风险。

**工作方式**:
- 7 轮审查：信息架构、交互状态覆盖、用户旅程、AI 模式风险、设计系统对齐、响应式/可访问性、未解决的设计决策
- 每个维度评分 0-10，解释 10 分是什么样的，然后修复计划
- 交互式，一次一个问题

**示例**:
```
你: /plan-design-review

Claude: 初始设计评分: 4/10

        Pass 1 (信息架构): 3/10
        "10 分会定义每个屏幕的主要/次要/三级内容层次结构"
        → 已添加信息层次结构部分到计划

        Pass 4 (AI 模式): 4/10
        "计划说'简洁现代的 UI，带卡片和图标'和'带渐变的英雄区'"
        → 用具体的、有意的替代方案重写了 UI 描述

        总体: 4/10 → 8/10
```

---

## 设计阶段

### /design-consultation

**角色**: 设计合伙人模式

**用途**: 当你什么都没有时 — 没有设计系统、字体选择、配色方案。从头构建整个视觉身份。

**流程**:
1. 了解你的产品、用户、受众
2. 研究你领域的现有设计（可选）
3. 提出完整的设计系统：审美方向、排版、颜色、间距、布局、动效
4. **关键**: 提出**安全选择**和**创意风险**，告诉你哪些是哪些
5. 生成交互式 HTML 预览页面
6. 写入 `DESIGN.md` 到项目根目录

**安全 vs 风险示例**:
```
安全选择 (符合类别期望):
  - Geist 字体 — 你的用户已经从 Vercel 认识这个字体
  - 石板灰中性色 — 适合数据密集的 UI

风险 (脱颖而出的地方):
  - Instrument Serif 用于显示标题 — 开发工具领域没人用衬线体
  - 青色强调色代替蓝色 — 足够接近感觉可靠，足够不同可识别
  - 4px 紧凑密度 — 比 Linear 更紧密，表示"我们尊重你的屏幕空间"
```

---

### /design-review

**角色**: 会写代码的设计师

**用途**: 审计并修复已上线的网站。

**工作方式**:
1. 在你的网站运行 80 项视觉审计
2. 进入修复循环：定位源文件 → 做最小 CSS/样式更改 → 提交 → 重新验证 → 截图
3. 每个修复一个提交，完全可二分

**风险控制**:
- CSS-only 更改免费（本质安全且可逆）
- 组件 JSX/TSX 更改计入风险预算
- 硬上限 30 个修复

**示例**:
```
你: /design-review https://myapp.com

Claude: 设计评分: C  |  AI 模式评分: D
        12 个发现 (4 高, 5 中, 3 打磨)

        修复 9 个设计问题...

        style(design): FINDING-001 — 用非对称布局替换 3 列图标网格
        style(design): FINDING-002 — 添加标题比例 48/32/24/18/16
        style(design): FINDING-003 — 移除渐变英雄区，使用粗体排版

        最终审计:
        设计评分: C → B+  |  AI 模式评分: D → A
```

---

## 审查阶段

### /review

**角色**: 偏执的 Staff 工程师

**用途**: 找到通过 CI 但在生产中爆炸的 bug。

**核心问题**: **什么还能出错？**

**关注点**:
- N+1 查询
- 陈旧读取
- 竞态条件
- 错误的信任边界
- 缺失索引
- 转义 bug
- 破坏的不变量
- 错误的重试逻辑
- 测试通过但遗漏真正失败模式
- 遗忘的枚举处理

**新增功能**:
- **覆盖率警告** — 低覆盖率测试在评审中醒目提示，避免到 `/ship` 才暴露问题
- **计划感知范围漂移检测** — 不仅检查 TODOS.md 和 PR 描述，还读取计划文件核对范围变更

**修复优先**:

---

### /codex

**角色**: 第二意见 (OpenAI Codex CLI)

**用途**: 完全不同的 AI 审查同一个 diff。不同的训练、不同的盲点、不同的优势。

**三种模式**:
| 模式 | 说明 |
|------|------|
| **Review** | 运行 `codex review`，返回 PASS/FAIL 裁决 |
| **Challenge** | 对抗模式，主动尝试破坏你的代码 |
| **Consult** | 开放对话，会话连续性 |

**跨模型分析**:
当 `/review` (Claude) 和 `/codex` (OpenAI) 都审查了同一个分支：
- 重叠发现 = 高置信度
- Codex 独有 = 不同视角
- Claude 独有 = Claude 擅长的领域

---

### /investigate

**角色**: 调试器

**用途**: 系统性根本原因调试。

**铁律**: **没有根本原因调查就不能修复。**

**流程**:
1. 追踪数据流
2. 匹配已知 bug 模式
3. 一次测试一个假设
4. 如果 3 次修复尝试失败，停止并质疑架构

**自动功能**: 自动冻结到被调试模块的目录（配合 `/freeze`）

---

## 测试阶段

### /qa

**角色**: QA 负责人

**用途**: 系统性测试你的应用，发现 bug，用原子提交修复，重新验证。

**四种模式**:
| 模式 | 说明 |
|------|------|
| **Diff-aware** | 读取 `git diff main`，识别受影响的页面，专门测试它们 |
| **Full** | 系统性探索整个应用，5-15 分钟，记录 5-10 个问题 |
| **Quick** (`--quick`) | 30 秒冒烟测试，首页 + 前 5 个导航目标 |
| **Regression** (`--regression baseline.json`) | 与之前基线比较 |

**自动回归测试**: 当 `/qa` 修复并验证一个 bug 时，自动生成回归测试。

**示例**:
```
你: /qa https://staging.myapp.com

Claude: [探索 12 页面，填写 3 表单，测试 2 流程]

        QA 报告: staging.myapp.com — 健康评分: 72/100

        前 3 个问题:
        1. CRITICAL: 结账表单允许空必填字段提交
        2. HIGH: 移动端导航菜单选择后不关闭
        3. MEDIUM: 仪表板图表在 1024px 以下重叠侧边栏
```

---

### /qa-only

**角色**: QA 报告员

**用途**: 与 `/qa` 相同的方法论，但只报告不修复。当你想要纯 bug 报告时使用。

---

### /browse

**角色**: QA 工程师

**用途**: 给代理眼睛。真正的 Chromium 浏览器，真正的点击，真正的截图。

**技术**: 基于 Playwright 的编译二进制文件，与持久 Chromium 守护进程通信。
- 首次调用启动浏览器 (~3s)
- 后续调用 ~100-200ms
- 浏览器在命令之间保持运行，cookies/tabs/localStorage 保留
- **支持 Windows** — 所有平台健康检查统一修复，Chromium sandbox 在 Windows 上自动禁用（需要提升权限时）

**常用命令**:
```
browse goto https://example.com
browse snapshot -i
browse fill @e2 "test@example.com"
browse click @e5
browse screenshot /tmp/page.png
browse console
```

**浏览器切换** (遇到 CAPTCHA/MFA):
```
Claude: 我卡在登录页面的 CAPTCHA 上。

        > browse handoff "Stuck on CAPTCHA at login page"

        Chrome 已打开，保留所有 cookies 和 tabs。
        解决 CAPTCHA 后告诉我。

你: done

Claude: > browse resume
        获取了新快照。成功登录。继续 QA。
```

---

### /setup-browser-cookies

**角色**: 会话管理器

**用途**: 从你的真实浏览器导入 cookies 到无头会话，测试需要登录的页面。

**支持的浏览器**: Comet, Chrome, Arc, Brave, Edge

**新增功能**:
- **Chrome 多 Profile 支持** — 可从任意 Chrome profile 导入，不只是 Default，profile picker 显示账户邮箱便于识别
- **Linux Chromium cookie 导入** — 支持 Chrome、Chromium、Brave、Edge；支持 GNOME Keyring (libsecret) 和 headless 环境回退
- **Chrome 扩展支持** — 设置 `BROWSE_EXTENSIONS_DIR` 加载扩展（广告拦截、无障碍工具、自定义 headers）

**用法**:
```
# 交互式选择
你: /setup-browser-cookies

# 直接指定域名
你: /setup-browser-cookies github.com
```

---

### /benchmark

**角色**: 性能工程师

**用途**:
- 基准化页面加载时间、Core Web Vitals、资源大小
- 每次 PR 比较 before/after
- 在 bundle 大小回归发布前捕获

---

## 发布阶段

### /ship

**角色**: 发布工程师

**用途**: 准备好分支的最后一公里。停止头脑风暴，开始执行。

**流程**:
1. 与 main 同步
2. 运行正确的测试
3. 确保分支状态正常
4. 更新 changelog/versioning
5. 推送
6. 创建或更新 PR

**测试引导**: 如果项目没有测试框架，`/ship` 会设置一个：
- 检测运行时
- 研究最佳框架
- 安装并写 3-5 个真实测试
- 设置 CI/CD (GitHub Actions)
- 创建 TESTING.md

**质量门禁**:
- **覆盖率门禁** — AI 评估测试覆盖率低于 60% 强制停止；60-79% 提示警告；80%+ 通过。阈值可在 `CLAUDE.md` 中通过 `## Test Coverage` 配置
- **计划完成审计** — 读取计划文件，提取每个可操作项，对照 diff 交叉检查，显示 DONE/NOT DONE/PARTIAL/CHANGED 清单
- **自动验证** — 若检测到 localhost 运行 dev server，自动执行 `/qa-only` 进行验证

**覆盖审计**: 每次 `/ship` 运行生成 ASCII 覆盖图，PR body 显示：`Tests: 42 → 47 (+5 new)`

**发布指标日志**: 覆盖率%、计划完成比率、验证结果写入 review JSONL，供 `/retro` 追踪趋势

---

### /land-and-deploy

**角色**: 发布工程师

**用途**: 在 `/ship` 之后接手 — 合并 PR，等待 CI 和部署，验证生产健康。

**自动检测平台**: Fly.io, Render, Vercel, Netlify, Heroku, GitHub Actions

**流程**:
1. 合并 PR
2. 等待 CI 和部署
3. 运行 canary 验证
4. 如果出问题，提供回滚选项

---

### /canary

**角色**: SRE

**用途**: 部署后监控循环。监视控制台错误、性能回归、页面失败。

**功能**:
- 定期截图
- 异常检测
- 与部署前基线比较

---

### /document-release

**角色**: 技术作家

**用途**: 更新所有项目文档以匹配你刚刚发布的内容。

**流程**:
1. 读取项目中的每个文档文件
2. 与 diff 交叉引用
3. 更新文件路径、命令列表、项目结构树
4. 风险或主观更改作为问题提出
5. 其他自动处理

**处理的文件**: README, ARCHITECTURE, CONTRIBUTING, CLAUDE.md, TODOS, CHANGELOG, VERSION

---

## 反思阶段

### /retro

**角色**: 工程经理

**用途**: 周回顾，基于数据而非感觉。

**功能**:
- 分析提交历史、工作模式、发布速度
- **团队感知**: 识别谁在运行命令，给你自己最深度的分析，然后分解每个贡献者
- 计算指标：commits, LOC, 测试比例, PR 大小, 修复比例
- 检测编码会话、热点文件、发布连续天数
- 跟踪测试健康：测试文件总数、新增测试、回归测试提交、趋势增量
- **计划完成率** — 每周回顾显示已发布分支的计划完成比率

**示例**:
```
你: /retro

Claude: 3月1日周: 47 commits (3 贡献者), 3.2k LOC, 38% 测试, 12 PRs, 峰值: 10pm | 连续: 47d

        ## 你的一周
        32 commits, +2.4k LOC, 41% 测试。峰值时段: 9-11pm。
        最大发布: cookie 导入系统

        ## 团队分解

        ### Alice
        12 commits 专注于 app/services/。每个 PR 低于 200 LOC。
        机会: 测试比例 12% — 在支付变得更复杂前值得投资

        ### Bob
        3 commits — 修复了仪表板的 N+1 查询。小但高影响。
```

---

## 安全工具

### /cso

**角色**: 首席安全官 (CSO)

**用途**: 基础设施优先的安全审计。v2 版本从真实发生 breach 的地方开始——基础设施攻击面，而非应用代码。

**v2 核心功能**:
- **15 阶段审计** — 密钥考古、依赖 CVE、CI/CD 管道配置、未验证 webhook、Dockerfile 安全、LLM/AI 安全、技能供应链、OWASP Top 10、STRIDE、主动验证
- **两种模式** — `--daily` 零噪音扫描（8/10 置信度门禁）；`--comprehensive` 深度月度扫描（2/10 置信度）
- **主动验证** — 每个发现都经独立子代理验证，无 grep-and-guess；发现一个漏洞后变体分析整个代码库
- **趋势追踪** — 发现指纹化，跨审计运行追踪：新发现、已修复、已忽略
- **Diff 范围审计** — `--diff` 模式只审计分支上的变更，适合 pre-merge 安全检查

---

### /careful

**用途**: 危险命令的安全护栏。说"小心"或运行 `/careful`。

**检查的模式**:
- `rm -rf` / `rm -r` — 递归删除
- `DROP TABLE` / `DROP DATABASE` / `TRUNCATE` — 数据丢失
- `git push --force` / `git push -f` — 历史重写
- `git reset --hard` — 丢弃提交
- `git checkout .` / `git restore .` — 丢弃未提交的工作
- `kubectl delete` — 生产资源删除
- `docker rm -f` / `docker system prune` — 容器/镜像丢失

**白名单**: 常见构建产物清理 (`rm -rf node_modules`, `dist`, `.next`, `__pycache__`) 不会触发警告

**可覆盖**: 任何警告都可以覆盖。这是事故预防，不是访问控制。

---

### /freeze

**用途**: 将所有文件编辑限制在单个目录。

**场景**: 调试计费 bug 时，你不希望 Claude 意外"修复" `src/auth/` 中的无关代码。

**用法**:
```
你: /freeze src/billing

Claude: 编辑限制在 src/billing/。运行 /unfreeze 移除。

[后来，Claude 尝试编辑 src/auth/middleware.ts]

Claude: BLOCKED — 冻结边界外的编辑 (src/billing/)。跳过此更改。
```

**注意**: 只阻止 Edit 和 Write 工具。Bash 命令如 `sed` 仍可修改边界外的文件。

---

### /guard

**用途**: 完全安全模式 — 组合 `/careful` + `/freeze`。

**场景**: 接触生产或调试实时系统时使用。

---

### /unfreeze

**用途**: 移除 `/freeze` 边界，允许到处编辑。

---

## 配置工具

### /setup-deploy

**用途**: 为 `/land-and-deploy` 一次性配置部署设置。

**自动检测**:
- 部署平台 (Fly.io, Render, Vercel, Netlify, Heroku, GitHub Actions, 自定义)
- 生产 URL
- 健康检查端点
- 部署状态命令

---

### /gstack-upgrade

**用途**: 一键升级 gstack 到最新版本。

**功能**:
- 检测安装类型 (全局 vs 项目内)
- 运行升级
- 如果双重安装，同步两个副本
- 显示变更内容
- **支持项目级安装** — `setup --local` 在当前项目 `.claude/skills/` 安装 gstack，按项目固定版本

**自动升级**: 在 `~/.gstack/config.yaml` 中设置 `auto_upgrade: true` 跳过提示。

---

## 快速参考

| 阶段 | 技能 | 角色 |
|------|------|------|
| 思考 | `/office-hours` | YC 合伙人 |
| 规划 | `/autoplan` | 三位 AI 评审 |
| 规划 | `/plan-ceo-review` | CEO |
| 规划 | `/plan-eng-review` | 工程经理 |
| 规划 | `/plan-design-review` | 高级设计师 |
| 设计 | `/design-consultation` | 设计合伙人 |
| 设计 | `/design-review` | 会写代码的设计师 |
| 审查 | `/review` | Staff 工程师 |
| 审查 | `/codex` | 第二意见 (OpenAI) |
| 审查 | `/investigate` | 调试器 |
| 测试 | `/qa` | QA 负责人 |
| 测试 | `/qa-only` | QA 报告员 |
| 测试 | `/browse` | QA 工程师 |
| 测试 | `/setup-browser-cookies` | 会话管理器 |
| 测试 | `/benchmark` | 性能工程师 |
| 发布 | `/ship` | 发布工程师 |
| 发布 | `/land-and-deploy` | 发布工程师 |
| 发布 | `/canary` | SRE |
| 发布 | `/document-release` | 技术作家 |
| 反思 | `/retro` | 工程经理 |
| 安全 | `/cso` | 首席安全官 |
| 安全 | `/careful` | 安全护栏 |
| 安全 | `/freeze` | 编辑锁 |
| 安全 | `/guard` | 完全安全 |
| 安全 | `/unfreeze` | 解锁 |
| 配置 | `/setup-deploy` | 部署配置器 |
| 配置 | `/gstack-upgrade` | 自更新器 |

---

## 故障排除

| 问题 | 解决方案 |
|------|----------|
| 技能不显示 | `cd ~/.claude/skills/gstack && ./setup` |
| `/browse` 失败 | `cd ~/.claude/skills/gstack && bun install && bun run build` |
| 安装过期 | 运行 `/gstack-upgrade` |
| Claude 看不到技能 | 确保 CLAUDE.md 有 gstack 部分 |

---

*来源: https://github.com/garrytan/gstack*
