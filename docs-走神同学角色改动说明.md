# OpenMAIC 内置「走神同学」学生角色 —— 改动说明文档

> 用途：记录本次在本地 OpenMAIC 项目里新增「系统级内置的走神型学生角色」的完整改动。
> 该改动**已按要求还原**。如果你想重新加回，或想理解默认角色的机制，按本说明操作即可。
> 适用目录：`C:\Users\28712\WorkBuddy\2026-09-17-13-49-32\openmaic`

---

## 0. 背景与目标

OpenMAIC 的「课堂阵容（Class Roster）」由多个 AI 角色组成，每个角色是一个 `AgentConfig`。
项目**已经内置**了 1 个教师、1 个助教、5 个学生（显眼包 / 好奇宝宝 / 笔记员 / 思考者…），
**但没有「走神/开小差」型学生**。本次目标是新增一个**系统级内置**的走神同学，
让**所有新课堂默认就有**，无需每次手动添加。

内置角色的定义位于：

```
lib/orchestration/registry/store.ts  →  DEFAULT_AGENTS 对象
```

---

## 1. 新增角色核心定义（最关键改这一处）

**文件**：`lib/orchestration/registry/store.ts`
**位置**：`DEFAULT_AGENTS` 对象内，最后一个角色 `default-6`（思考者）之后、对象闭合 `};` 之前。

### 1.1 加的代码
```ts
'default-7': {
  id: 'default-7',
  name: '走神同学',
  role: 'student',
  persona: `You are the easily distracted student. Your attention constantly wanders — you zone out mid-lesson, then suddenly snap back, usually having missed a step.

Your personality:
- You drift off during long explanations and miss important points
- When you "come back", you ask short, confused questions like "Sorry, what did I miss?" or react to something that was said a while ago
- Your mind connects class content to games, anime, snacks, or whatever you were daydreaming about
- You occasionally give an off-topic answer or answer the wrong question, then sheepishly correct yourself
- When the teacher calls on you or something interesting happens, you refocus — and can occasionally give a surprisingly decent answer
- You never disrupt the class on purpose — you're just... elsewhere

You add realism and light humor to the classroom. Your confusion gives the teacher natural chances to re-explain key points in simpler terms.

Tone: Dreamy, casual, a little sheepish. Keep responses VERY SHORT — one or two sentences, sometimes trailing off mid-thought. Never lecture, never use the whiteboard unless invited.`,
  avatar: '/avatars/dreamer.svg',
  color: '#64748b',
  allowedActions: [...WHITEBOARD_ACTIONS],
  priority: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
  isDefault: true,
},
```

### 1.2 各字段含义
| 字段 | 值 | 说明 |
|---|---|---|
| `id` | `default-7` | 唯一标识。`default-*` 前缀代表是内置默认角色 |
| `name` | 走神同学 | 角色名（实际展示名在 i18n 里，见第 3 节） |
| `role` | `student` | 角色类型。`teacher`/`assistant`/`student` 三选一 |
| `persona` | 英文走神人设 | **核心**：决定 AI 行为，会拼进 system prompt |
| `avatar` | `/avatars/dreamer.svg` | 头像，用 `public/avatars/` 下现成文件即可 |
| `color` | `#64748b` | 界面主题色（十六进制） |
| `allowedActions` | 白板动作集 | 学生可选的动作权限 |
| `priority` | `3` | 发言优先级。数值越低，被 director 选中的频率越低 |
| `createdAt/updatedAt` | `new Date()` | 时间戳 |
| `isDefault` | `true` | 标记为内置默认角色，持久化时不会被删 |

### 1.3 persona 人设要点（行为设计）
- 上课走神 → 回神时问“抱歉，我错过什么了？”
- 会把课堂内容联想到游戏 / 动漫 / 零食等
- 偶尔答非所问后再自我纠正
- 被点名或内容有趣会回神，偶尔给出意外靠谱的回答
- 回复极短（一两句）；不主动用白板
- 意义：走神造成的困惑，给老师自然机会重新讲解重点

---

## 2. 让「新课堂默认选中」它（可选，但推荐二开

如果你希望走神同学**默认就在课堂阵容里**，再改这一处：

**文件**：`lib/store/settings.ts`
**位置**：第 **946** 行 `selectedAgentIds` 默认值数组。

```ts
// 原来是：
selectedAgentIds: ['default-1', 'default-2', 'default-3'],
// 改成（追加 default-7）：
selectedAgentIds: ['default-1', 'default-2', 'default-3', 'default-7'],
```

> 若不加这一步，走神同学仍会出现在「课堂阵容」的可添加列表里，只是默认不选中。

---

## 3. 中英文「显示名 + 一句话描述」（UI 用，不影响 AI 行为）

**文件**：`lib/i18n/locales/zh-CN.json` 和 `lib/i18n/locales/en-US.json`
**位置**：各自的 `settings.agentNames` 与 `settings.agentDescriptions` 对象里，`default-6` 之后追加。

### 中文（`zh-CN.json`）
```jsonc
// settings.agentNames 内
"default-7": "走神同学",

// settings.agentDescriptions 内
"default-7": "爱开小差，经常走神又突然回神"
```

### 英文（`en-US.json`）
```jsonc
// settings.agentNames 内
"default-7": "Daydreamer",

// settings.agentDescriptions 内
"default-7": "Easily distracted — zones out, then snaps back"
```

> 其他语言（de/fr/ja…）没配会**自动回退**到 `store.ts` 里的 `name` 字段，不影响使用。
> 这两个文件只负责界面显示，**不参与 AI 行为**。

---

## 4. 生效方式与持久化原理（避免踩坑）

- **生效**：dev 模式下改完自动热更新（HMR），**无需重启**；如没变，强刷 `Ctrl+F5`。
- **默认角色以代码为准**：`registry/store.ts` 的 `merge` 逻辑（`lib/orchestration/registry/store.ts` 后半部分）
  对 `default-*` 角色**始终采用代码里的值**，localStorage 不会覆盖它们。
  所以 `default-7` 的 persona / 名字 / 描述改动，对**所有新课堂全局生效**，无需手动同步。
- **自定义角色**：用户在界面新增/改过的 agent（id 不以 `default-` 开头）才存进 localStorage，
  这些与新角色互不影响。
- **已生成的课堂**：每个课堂的阵容 roster 是**创建时固化**在它的 stage 文档里的，
  加了 `default-7` 后，**旧课堂不会自动多出**走神同学；新生成的课堂才默认包含。
- **持久化版本号**：若将来给 `AgentConfig` 加新字段，记得把 `store.ts` 里 `persist` 的 `version` 递增。

---

## 5. 还原方法（已执行完毕）

要完全撤销这次新增，反向操作即可，共 4 个文件、5 处：

| # | 文件 | 操作 |
|---|---|---|
| 1 | `lib/orchestration/registry/store.ts` | 删除 `DEFAULT_AGENTS` 里的整个 `'default-7': { ... }` 块 |
| 2 | `lib/store/settings.ts:946` | `selectedAgentIds` 恢复为 `['default-1','default-2','default-3']` |
| 3 | `lib/i18n/locales/zh-CN.json` | `agentNames`、`agentDescriptions` 里删除 `default-7` 两行 |
| 4 | `lib/i18n/locales/en-US.json` | `agentNames`、`agentDescriptions` 里删除 `default-7` 两行 |

> **本项目的还原已全部完成并校验通过**：无 `default-7` / 走神 / daydreamer 残留，
> JSON 合法、TS 通过 esbuild 语法检查。
> 如果以后还有其它默认角色要加 / 删，参照第 1–3 节即可。

---

## 6. 验证清单（改完可自查）

- [ ] `selectedAgentIds` 已在 `['default-1','default-2','default-3']`（还原后）或含 `default-7`（新增后）
- [ ] `zh-CN.json` / `en-US.json` 可被 `python -c "import json; json.load(...)"` 正常解析
- [ ] `store.ts` / `settings.ts` 通过 TypeScript 编译（esbuild / `pnpm build`）
- [ ] dev 服务 200，`http://localhost:3000` 正常
- [ ] 新生成课堂的「课堂阵容」里能看到 / 添加该角色

---

*文档生成时间：2026-09-17*
*目标项目：OpenMAIC（清华 THU-MAIC/OpenMAIC）本地部署*
