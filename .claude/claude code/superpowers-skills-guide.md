# Superpowers 技能完整指南

> Claude Code 的 Superpowers 插件 — 14 个核心技能，将 Claude 变成专业开发团队

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
| "我知道那是什么意思" | 知道概念 ≠ 使用技能 |

### 指令优先级

1. **用户明确指令** (CLAUDE.md, GEMINI.md, AGENTS.md, 直接请求) — 最高优先级
2. **Superpowers 技能** — 覆盖默认系统行为
3. **默认系统提示** — 最低优先级

### 技能优先级

当多个技能可能适用时，按此顺序：

1. **流程技能优先** (brainstorming, debugging) — 这些决定如何处理任务
2. **实现技能其次** (frontend-design, mcp-builder) — 这些指导执行

- "让我们构建 X" → 先 brainstorming，再实现技能
- "修复这个 bug" → 先 debugging，再领域特定技能

### 技能类型

- **刚性技能** (TDD, debugging): 严格遵循，不能绕过
- **灵活技能** (patterns): 根据上下文调整

技能本身会说明是哪种类型。

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

---

### /superpowers:executing-plans

**角色**: 执行工程师

**用途**: 当你有书面实现计划需要在单独会话中执行时使用，带有审查检查点。

**特点**:
- 独立会话执行
- 定期检查点
- 计划偏离检测
- 进度跟踪

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

---

### /superpowers:subagent-driven-development

**角色**: 并行协调者

**用途**: 在当前会话中执行具有独立任务的实现计划时使用。

**适用场景**:
- 计划有多个独立任务
- 任务可以并行执行
- 没有共享状态依赖

---

### /superpowers:dispatching-parallel-agents

**角色**: 任务调度器

**用途**: 面对 2+ 个可以无共享状态或顺序依赖地并行工作的独立任务时使用。

**条件**:
- 2 个或更多独立任务
- 无共享状态
- 无顺序依赖

---

### /superpowers:using-git-worktrees

**角色**: 隔离工程师

**用途**: 开始需要与当前工作空间隔离的功能工作，或在执行实现计划之前使用。

**功能**:
- 创建隔离的 git worktree
- 智能目录选择
- 安全验证

---

## 调试阶段

### /superpowers:systematic-debugging

**角色**: 调试专家

**用途**: **遇到任何 bug、测试失败或意外行为时，在提出修复之前使用。**

**刚性技能**: 必须严格遵循，不能绕过。

**铁律**: **没有根本原因调查就不能修复。**

**调试流程**:
1. **观察** — 收集信息，复现问题
2. **分析** — 基于证据提出假设
3. **假设** — 设计验证实验
4. **修复** — 基于根本原因修复
5. **验证** — 确认修复有效

**常见反模式**:
- ❌ 猜测性修复
- ❌ 治标不治本
- ❌ 跳过调查
- ❌ 忽略测试

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

---

### /superpowers:receiving-code-review

**角色**: 审查响应者

**用途**: 收到代码审查反馈后，在实施建议之前使用。

**特别重要**: 当反馈看起来不清楚或技术上可疑时。

**原则**:
- 技术严谨和验证
- 不是表演性同意
- 不是盲目实施

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

**反模式**:
- ❌ "应该可以了"
- ❌ "我测试过了"（没运行命令）
- ❌ 跳过验证直接提交

---

### /superpowers:finishing-a-development-branch

**角色**: 分支完成协调者

**用途**: 实现完成、所有测试通过后，决定如何集成工作时使用。

**决策选项**:
1. **Merge** — 直接合并到主分支
2. **PR** — 创建 Pull Request
3. **Cleanup** — 清理并放弃

---

## 元技能

### /superpowers:writing-skills

**角色**: 技能作者

**用途**: 创建新技能、编辑现有技能或验证技能在部署前工作正常时使用。

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
| 元 | `/superpowers:writing-skills` | 技能作者 | 元 |

**总计: 14 个技能**

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

*来源: Superpowers 插件*
