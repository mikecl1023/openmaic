# OpenMAIC 接入外部知识库 —— 对接说明文档

> 用途：让 OpenMAIC 的 AI 在生成 / 编辑课件时，**自动检索并引用你的外部 RAG / 向量知识库**。
> 本项目**已实现对接骨架**（`knowledge_rag` 工具并已接线）。只差最后一步：填你的知识库地址。
> 适用目录：`C:\Users\28712\WorkBuddy\2026-09-17-13-49-32\openmaic`

---

## 0. 结论速览

- **已完成**：新增一个 AI 检索工具 `knowledge_rag`，并接入 agent 运行时（仿内置 `web_search` 的范式）。
- **未完成**：还没有填写真正的知识库地址（`KNOWLEDGE_RAG_URL`），所以当前该工具**未激活**（这符合"未配置就不注册"的机制，不会产生死工具）。
- **等你确定地址后**：填 1 个环境变量即可激活（必要时对齐一下请求/响应格式，见第 3、4 节）。

---

## 1. 原理：为什么用「工具」而不是改配置

OpenMAIC **本身没有"插外部向量库"的现成配置项**。它的内置 RAG（`lib/rag/*`）是"把文档挂到某个课堂 → 分块 → 内存词法索引"，不面向外部向量库。

但 OpenMAIC 的 AI 支持**调用工具**，内置就有 `web_search`（网络检索）这类"按需检索"的工具（`lib/server/agent-runtime/web-search.ts`）。

> 做法：**照 `web_search` 复制一个同款的 `knowledge_rag` 工具**，让 AI 在讲课时需要权威资料时自动调用它，向你的知识库发检索请求，把命中段落作为上下文拼进生成。

关键机制（capability-registered）：
- 只要配置了 `KNOWLEDGE_RAG_URL` → 工具被注册，模型能看到并能用 → AI 会自动决定何时检索。
- 没配置 → 工具不注册 → 模型根本看不到，也不会有任何报错或死工具。

---

## 2. 已改动的文件

| 文件 | 动作 | 说明 |
|---|---|---|
| `lib/server/agent-runtime/knowledge-rag.ts` | **新增** | 工具本体（3 个导出） |
| `lib/server/agent-runtime/runner.ts` | 修改 | 注册工具 + 注入提示 + 加入 allowlist |
| `.env.local` | 修改 | 新增 3 个占位变量 + 注释说明 |

### 2.1 `knowledge-rag.ts` 提供的 3 个函数
- `resolveKnowledgeRagCapability()` —— 读环境变量，未配置返回 `null`
- `buildKnowledgeRagTool(capability)` —— 构造 `knowledge_rag` 工具（参数 `query`、可选 `topK`）
- `knowledgeRagPromptBlock()` —— 提示词块，告诉 AI「有知识库可查、何时该查」

### 2.2 `runner.ts` 的接线点（万一你要复现）
```ts
// import：
import { buildKnowledgeRagTool, resolveKnowledgeRagCapability, knowledgeRagPromptBlock } from './knowledge-rag';

// 工具注册（在 webSearchTools 之后）：
const knowledgeRag = resolveKnowledgeRagCapability();
const knowledgeRagTools = knowledgeRag ? [buildKnowledgeRagTool(knowledgeRag)] : [];

// assembleRunnerTools(..., webSearchTools, knowledgeRagTools, ...)
// systemPrompt 注入：...(knowledgeRag ? { knowledge: knowledgeRagPromptBlock() } : {})
// allowedToolNames：...(knowledgeRag ? ['knowledge_rag'] : [])
```

---

## 3. 你要做的：填环境变量（`.env.local`）

定位到文件里的 `# --- External knowledge base (knowledge_rag) ---` 区域，填：

```env
KNOWLEDGE_RAG_URL=          # 必填：你的检索服务地址（POST）
KNOWLEDGE_RAG_API_KEY=      # 可选：会作为 Authorization: Bearer <key> 发送
KNOWLEDGE_RAG_TOP_K=5       # 可选：每次默认取几条（默认 5）
```

填完**重启服务**（`pnpm dev` 或 `Start-OpenMAIC.bat`）即生效。

---

## 4. 我约定的请求 / 响应契约（若你的服务形状不同见第 5 节）

**工具对你的服务发出的请求**（HTTP POST，JSON）：
```json
{
  "query": "课程语言写的关键词",
  "top_k": 5
}
```

**期望读回的响应**（两种形状都认）：
```json
// 形状 A
{ "results": [ { "text": "命中段落内容", "score": 0.92, "source": "来源标注(可选)", "title": "标题(可选)" } ] }
```
```json
// 形状 B（同样支持 data 数组）
{ "data": [ { "text": "...", "score": 0.9 } ] }
```
- `text` 必填；`score` / `source` / `title` 可选。
- 若你的服务返回**纯字符串数组**（`["段落1", "段落2"]`）也兼容。

---

## 5. 如果你的服务接口不是这个形状（重点）

qdrant / pgvector / Dify / RAGFlow / 自建服务，retrieval 接口各不相同。两条路任选：

### 方案 A：加一个 10 行适配代理（推荐，最快）
在你知识库前面放一个小代理，把「你的检索接口」转成第 4 节的契约，然后 `KNOWLEDGE_RAG_URL` 填代理地址。不动 OpenMAIC 代码。

### 方案 B：直接把接口发我，我来改工具
把你服务的**检索 URL、请求体示例、返回 JSON 示例**发我，我把 `knowledge-rag.ts` 里的 `fetchKnowledge` 改成直连你的接口。改动集中在一个函数里，很快。

---

## 6. 验证方法（接好后自查）

1. `.env.local` 已填 `KNOWLEDGE_RAG_URL`，重启服务；
2. 生成/编辑一个课件，主题选一个知识库里有资料的方向；
3. 观察课堂生成过程中是否触发 `knowledge_rag` 检索（服务日志里可见）；
4. 课件内容应包含知识库里的术语/事实/来源，而不是全靠模型自由发挥。

---

## 7. 安全小提醒
- `KNOWLEDGE_RAG_API_KEY` 属敏感凭据，别提交进 git（`.env.local` 通常已被 `.gitignore` 排除，确认一下）。
- 检索能力只在 agent 运行时使用；如果你不希望某些课触发检索，可通过不设 `KNOWLEDGE_RAG_URL` 全局关掉。

---

*文档生成时间：2026-09-17*
*目标项目：OpenMAIC（清华 THU-MAIC/OpenMAIC）本地部署*
*下一步：待确定知识库地址后，按第 3、4 节完成并验证。*

---

## 8. 新增：设置面板「课程知识库」配置页（2026-09-25）

现在**不需要手动编辑 .env.local 了**——可以在界面里直接配置：

**入口**：页面右上角齿轮 ⚙ 打开设置 → 左侧导航「课程知识库」（BookOpen 图标，位于「网络搜索」下方）。

**可配置项**：
- 检索接口地址（URL，必填；留空保存 = 停用）
- API Key（可选，以 `Authorization: Bearer <key>` 发送）
- 默认返回条数 Top-K（1-20，默认 5）
- 「测试连接」按钮：发一条真实检索请求验证连通性，显示命中条数与片段预览

**后台落盘位置**：项目根目录 `knowledge-rag.config.json`，例如：

```json
{
  "url": "https://your-rag/v1/retrieve",
  "apiKey": "sk-...",
  "topK": 5,
  "updatedAt": "2026-09-25T03:49:53.354Z"
}
```

**配置优先级**：`knowledge-rag.config.json` > 环境变量（`KNOWLEDGE_RAG_URL` 等）。设置面板显示当前来源（面板配置 / 环境变量 / 未配置）。

**生效时机**：无需重启。`runner.ts` 在每次智能体运行前调用 `resolveKnowledgeRagCapability()`（`lib/server/agent-runtime/knowledge-rag.ts`），它每次实时重读配置文件——保存后下一次运行即生效；清空 URL 保存则工具从智能体处消失。

**相关代码**：
- 配置读写：`lib/server/knowledge-rag-config.ts`
- API：`app/api/knowledge-rag/config/route.ts`（GET/POST）、`app/api/knowledge-rag/test/route.ts`（连通性探测）
- 设置页：`components/settings/knowledge-settings.tsx`（i18n 键：`settings.knowledge*`，已加 zh-CN / en-US）

> 注意：部署到服务器时，`knowledge-rag.config.json` 需随项目带过去（或让服务器在界面里配置一次）；Docker 部署记得给该文件挂载持久卷，否则容器重建后配置丢失。
