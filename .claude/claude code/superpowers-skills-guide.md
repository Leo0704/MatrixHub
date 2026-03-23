# Superpowers 技能完整指南

> Claude Code 的 Superpowers 插件 — 15 个核心技能，将 Claude 变成专业开发团队

---

## 目录

- [工作流程概览](#工作流程概览)
- [技能使用规则](#技能使用规则)
- [创意阶段](#创意阶段)
  - [/superpowers:brainstorming](#superpowersbrainstorming)
- [规划阶段](#规划阶段)
  - [/superpowers:writing-plans](#superpowerswriting-plans)
  - [/superpowers:executing-plans](#superpowersexecuting-plans)
- [开发阶段](#开发阶段)
  - [/superpowers:test-driven-development](#superpowerstest-driven-development)
  - [/superpowers:subagent-driven-development](#superpowerssubagent-driven-development)
  - [/superpowers:dispatching-parallel-agents](#superpowersdispatching-parallel-agents)
  - [/superpowers:using-git-worktrees](#superpowersusing-git-worktrees)
- [调试阶段](#调试阶段)
  - [/superpowers:systematic-debugging](#superpowerssystematic-debugging)
- [审查阶段](#审查阶段)
  - [/superpowers:requesting-code-review](#superpowersrequesting-code-review)
  - [/superpowers:receiving-code-review](#superpowersreceiving-code-review)
- [完成阶段](#完成阶段)
  - [/superpowers:verification-before-completion](#superpowersverification-before-completion)
  - [/superpowers:finishing-a-development-branch](#superpowersfinishing-a-development-branch)
- [元技能](#元技能)
  - [/superpowers:using-superpowers](#superpowersusing-superpowers)
  - [/superpowers:writing-skills](#superpowerswriting-skills)

---

## 工作流程概览

```
Brainstorm → Plan → Develop (TDD) → Debug → Review → Verify → Finish
```

**技能优先级原则**:
1. **流程技能优先** (brainstorming, debugging) — 决定如何处理任务
2. **实现技能其次** (TDD, frontend-design) — 指导具体执行

**技能类型**:
- **刚性技能** (TDD, debugging) — 必须严格遵循，不能绕过
- **灵活技能** (patterns) — 根据上下文调整

---

## 技能使用规则

### 核心规则

**在任何响应或操作之前调用相关技能。** 即使只有 1% 的可能性技能适用，你也应该调用技能来检查。

```
用户消息 → 检查技能是否适用 → 调用 Skill 工具 → 宣布使用技能 → 遵循技能执行
```

### 危险思维信号

| 思维 | 现实 |
|------|------|
| "这只是个简单问题" | 问题也是任务，检查技能 |
| "我需要更多上下文" | 技能检查在澄清问题之前 |
| "让我先探索代码库" | 技能告诉你如何探索 |
| "我可以快速检查 git/文件" | 文件缺少对话上下文 |
| "这不需要正式技能" | 如果技能存在，就使用它 |
| "我记得这个技能" | 技能会演进，读取当前版本 |
| "这不算任务" | 行动 = 任务 |
| "技能过度了" | 简单的事变复杂，使用技能 |
| "我就先做这一件事" | 在做任何事之前检查 |
| "这感觉很高效" | 无纪律的行动浪费时间 |

### 指令优先级

1. **用户明确指令** (CLAUDE.md, GEMINI.md, AGENTS.md, 直接请求) — 最高优先级
2. **Superpowers 技能** — 覆盖默认系统行为
3. **默认系统提示** — 最低优先级

---

## 创意阶段

### /superpowers:brainstorming

**角色**: 创意架构师

**用途**: **任何创意工作之前必须使用** — 创建功能、构建组件、添加功能或修改行为。

**触发条件**:
- 创建新功能
- 构建组件
- 添加功能
- 修改行为

**不是**:
- 纯粹的信息查询
- 简单的代码修改
- 已有明确规格的任务

**工作方式**:
1. 探索用户意图
2. 深入理解需求
3. 设计实现方案
4. 确保在实现前达成一致

**为什么重要**:
- 避免基于假设构建错误的东西
- 发现阶段问题
- 对齐用户期望

**示例**:
```
你: 我想添加一个用户认证系统

Claude: [调用 /superpowers:brainstorming]

        让我们先探索一下：
        1. 你期望的认证方式是什么？(OAuth, JWT, Session)
        2. 需要支持哪些登录方式？(邮箱, 手机, 第三方)
        3. 用户数据的敏感程度如何？
        ...
```

---

## 规划阶段

### /superpowers:writing-plans

**角色**: 软件架构师

**用途**: 当你有规格或需求需要多步骤任务时，在接触代码之前使用。

**输入**:
- 功能规格
- 需求文档
- 用户故事
- 技术设计

**输出**:
- 分步实现计划
- 关键文件识别
- 架构权衡分析
- 依赖关系图

**工作方式**:
1. 分析需求和约束
2. 识别关键文件
3. 设计实现策略
4. 创建可执行步骤

**示例**:
```
你: 我需要实现一个支付系统，支持支付宝和微信支付

Claude: [调用 /superpowers:writing-plans]

        ## 实现计划

        ### 第一步：支付抽象层
        - 创建 `src/payment/types.ts` — 定义统一接口
        - 创建 `src/payment/base.ts` — 基础抽象类

        ### 第二步：支付宝实现
        - 创建 `src/payment/alipay.ts`
        - ...

        ### 关键决策点
        - 是否需要支持退款？
        - 异步通知如何处理？
```

---

### /superpowers:executing-plans

**角色**: 执行工程师

**用途**: 当你有书面实现计划需要在单独会话中执行时使用，带有审查检查点。

**特点**:
- 独立会话执行
- 定期检查点
- 计划偏离检测
- 进度跟踪

**工作方式**:
1. 加载计划文件
2. 按步骤执行
3. 在检查点暂停审查
4. 报告进度和问题

**安全特性**:
- 计划偏离时停止
- 需要用户确认重大变更
- 自动记录执行状态

---

## 开发阶段

### /superpowers:test-driven-development

**角色**: TDD 实践者

**用途**: **实现任何功能或修复 bug 之前，在编写实现代码之前使用。**

**刚性技能**: 必须严格遵循，不能绕过。

**TDD 循环**:
```
Red → Green → Refactor
写测试 → 测试失败 → 写最少代码通过测试 → 重构
```

**工作方式**:
1. **Red**: 先写失败的测试
2. **Green**: 写最少的代码让测试通过
3. **Refactor**: 在测试保护下改进代码
4. 重复

**为什么 TDD**:
- 设计文档即测试
- 重构的安全网
- 快速反馈循环
- 更好的代码设计

**示例**:
```
你: 实现一个用户注册功能

Claude: [调用 /superpowers:test-driven-development]

        ## 第一步：写测试 (Red)

        ```typescript
        describe('User Registration', () => {
          it('should register user with valid email', () => {
            // ...
          });

          it('should reject invalid email', () => {
            // ...
          });
        });
        ```

        ## 第二步：实现 (Green)
        ...

        ## 第三步：重构
        ...
```

---

### /superpowers:subagent-driven-development

**角色**: 并行协调者

**用途**: 在当前会话中执行具有独立任务的实现计划时使用。

**适用场景**:
- 计划有多个独立任务
- 任务可以并行执行
- 没有共享状态依赖

**工作方式**:
1. 分析计划中的任务
2. 识别独立任务
3. 分配给子代理
4. 协调结果

**优势**:
- 加速执行
- 上下文隔离
- 并行处理

---

### /superpowers:dispatching-parallel-agents

**角色**: 任务调度器

**用途**: 面对 2+ 个可以无共享状态或顺序依赖地并行工作的独立任务时使用。

**条件**:
- 2 个或更多独立任务
- 无共享状态
- 无顺序依赖

**工作方式**:
1. 识别可并行任务
2. 启动多个子代理
3. 收集结果
4. 合并输出

**示例**:
```
你: 我需要：
    1. 修复登录页面的 bug
    2. 添加用户设置页面
    3. 优化数据库查询

Claude: [调用 /superpowers:dispatching-parallel-agents]

        这三个任务相互独立，可以并行执行。

        启动 3 个子代理...
        [Agent 1] 修复登录页面 bug
        [Agent 2] 添加用户设置页面
        [Agent 3] 优化数据库查询

        所有任务完成，合并结果...
```

---

### /superpowers:using-git-worktrees

**角色**: 隔离工程师

**用途**: 开始需要与当前工作空间隔离的功能工作，或在执行实现计划之前使用。

**功能**:
- 创建隔离的 git worktree
- 智能目录选择
- 安全验证

**场景**:
- 需要干净的工作目录
- 多功能并行开发
- 计划执行前的隔离

**工作方式**:
1. 验证当前状态
2. 创建新 worktree
3. 切换到隔离环境
4. 完成后清理

---

## 调试阶段

### /superpowers:systematic-debugging

**角色**: 调试专家

**用途**: **遇到任何 bug、测试失败或意外行为时，在提出修复之前使用。**

**刚性技能**: 必须严格遵循，不能绕过。

**铁律**: **没有根本原因调查就不能修复。**

**调试流程**:
1. **观察** — 收集信息，复现问题
2. **假设** — 基于证据提出假设
3. **实验** — 验证假设
4. **修复** — 基于根本原因修复
5. **验证** — 确认修复有效

**常见反模式**:
- ❌ 猜测性修复
- ❌ 治标不治本
- ❌ 跳过调查
- ❌ 忽略测试

**示例**:
```
你: 测试失败了，帮我修复

Claude: [调用 /superpowers:systematic-debugging]

        ## 第一步：观察

        错误信息: TypeError: Cannot read property 'id' of undefined
        位置: src/user/service.ts:42

        ## 第二步：假设

        可能原因:
        1. user 对象为 null
        2. API 返回格式变更
        3. 竞态条件

        ## 第三步：实验

        检查 API 响应格式...
        [验证中]

        ## 第四步：根本原因

        API 在用户不存在时返回 null，而不是空对象。

        ## 第五步：修复

        添加 null 检查...
```

---

## 审查阶段

### /superpowers:requesting-code-review

**角色**: 审查请求者

**用途**: 完成任务、实现主要功能或合并前使用，验证工作满足需求。

**触发条件**:
- 完成任务时
- 实现主要功能后
- 合并前

**审查内容**:
- 功能完整性
- 代码质量
- 测试覆盖
- 文档更新
- 安全考虑

**工作方式**:
1. 收集变更摘要
2. 生成审查请求
3. 等待审查反馈
4. 处理反馈意见

---

### /superpowers:receiving-code-review

**角色**: 审查响应者

**用途**: 收到代码审查反馈后，在实施建议之前使用。

**特别重要**: 当反馈看起来不清楚或技术上可疑时。

**原则**:
- 技术严谨和验证
- 不是表演性同意
- 不是盲目实施

**工作方式**:
1. 理解反馈意图
2. 验证技术准确性
3. 评估建议可行性
4. 有根据地实施

**处理不清楚的反馈**:
```
审查者: "这段代码性能不好"

Claude: [调用 /superpowers:receiving-code-review]

        让我验证这个反馈：
        - 当前复杂度: O(n)
        - 数据规模: ~1000 条
        - 实际影响: ~10ms

        反馈可能不够准确。建议回复审查者请求更多上下文。
```

---

## 完成阶段

### /superpowers:verification-before-completion

**角色**: 验证工程师

**用途**: **在声称工作完成、修复或通过之前，提交或创建 PR 之前使用。**

**刚性技能**: 必须严格遵循。

**核心原则**: **证据在断言之前。**

**验证清单**:
1. ✅ 所有测试通过
2. ✅ 构建成功
3. ✅ 代码格式正确
4. ✅ 无 TypeScript 错误
5. ✅ 功能按预期工作

**工作方式**:
1. 运行验证命令
2. 确认输出
3. 才能声称成功

**反模式**:
- ❌ "应该可以了"
- ❌ "我测试过了"（没运行命令）
- ❌ 跳过验证直接提交

**示例**:
```
你: 功能完成了，帮我提交

Claude: [调用 /superpowers:verification-before-completion]

        在提交前让我验证：

        1. 运行测试... ✅ 全部通过
        2. 构建检查... ✅ 无错误
        3. 类型检查... ✅ 无问题

        验证通过，可以提交。
```

---

### /superpowers:finishing-a-development-branch

**角色**: 分支完成协调者

**用途**: 实现完成、所有测试通过后，决定如何集成工作时使用。

**决策选项**:
1. **Merge** — 直接合并到主分支
2. **PR** — 创建 Pull Request
3. **Cleanup** — 清理并放弃

**考虑因素**:
- 变更范围
- 团队流程
- 审查需求
- 部署策略

**工作方式**:
1. 评估分支状态
2. 呈现选项
3. 等待用户决定
4. 执行选择

---

## 元技能

### /superpowers:using-superpowers

**角色**: 技能使用指南

**用途**: 每个对话开始时建立如何查找和使用技能的规则。

**核心内容**:
- 技能使用规则
- 优先级原则
- 危险思维信号
- 平台适配说明

**这是你正在阅读的技能。**

---

### /superpowers:writing-skills

**角色**: 技能作者

**用途**: 创建新技能、编辑现有技能或验证技能在部署前工作正常时使用。

**工作方式**:
1. 定义技能目的
2. 编写技能内容
3. 验证技能语法
4. 测试技能执行

**技能结构**:
```markdown
---
name: skill-name
description: One-line description
---

# Skill content here
```

---

## 快速参考

| 阶段 | 技能 | 角色 | 类型 |
|------|------|------|------|
| 创意 | `/superpowers:brainstorming` | 创意架构师 | 灵活 |
| 规划 | `/superpowers:writing-plans` | 软件架构师 | 灵活 |
| 规划 | `/superpowers:executing-plans` | 执行工程师 | 灵活 |
| 开发 | `/superpowers:test-driven-development` | TDD 实践者 | 刚性 |
| 开发 | `/superpowers:subagent-driven-development` | 并行协调者 | 灵活 |
| 开发 | `/superpowers:dispatching-parallel-agents` | 任务调度器 | 灵活 |
| 开发 | `/superpowers:using-git-worktrees` | 隔离工程师 | 灵活 |
| 调试 | `/superpowers:systematic-debugging` | 调试专家 | 刚性 |
| 审查 | `/superpowers:requesting-code-review` | 审查请求者 | 灵活 |
| 审查 | `/superpowers:receiving-code-review` | 审查响应者 | 灵活 |
| 完成 | `/superpowers:verification-before-completion` | 验证工程师 | 刚性 |
| 完成 | `/superpowers:finishing-a-development-branch` | 分支完成协调者 | 灵活 |
| 元 | `/superpowers:using-superpowers` | 技能使用指南 | 元 |
| 元 | `/superpowers:writing-skills` | 技能作者 | 元 |

---

## 典型工作流

### 新功能开发

```
1. /superpowers:brainstorming     → 探索需求和设计
2. /superpowers:writing-plans     → 创建实现计划
3. /superpowers:test-driven-development → TDD 实现
4. /superpowers:verification-before-completion → 验证
5. /superpowers:requesting-code-review → 请求审查
6. /superpowers:finishing-a-development-branch → 集成
```

### Bug 修复

```
1. /superpowers:systematic-debugging → 找到根本原因
2. /superpowers:test-driven-development → 写测试+修复
3. /superpowers:verification-before-completion → 验证
4. /superpowers:finishing-a-development-branch → 集成
```

### 大型重构

```
1. /superpowers:brainstorming     → 理解重构范围
2. /superpowers:writing-plans     → 规划重构步骤
3. /superpowers:using-git-worktrees → 创建隔离环境
4. /superpowers:subagent-driven-development → 并行执行
5. /superpowers:verification-before-completion → 验证
6. /superpowers:requesting-code-review → 请求审查
```

---

## 故障排除

| 问题 | 解决方案 |
|------|----------|
| 技能没有被触发 | 确保请求明确匹配技能用途 |
| TDD 感觉太慢 | 这是正常的，长期会节省时间 |
| 调试卡住了 | 使用 `/superpowers:systematic-debugging` 重新开始 |
| 审查反馈不清楚 | 使用 `/superpowers:receiving-code-review` 处理 |

---

*来源: Superpowers 插件 — Claude Code 官方技能集*
