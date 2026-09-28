# OpenMAIC 二次开发与平台对接方案

> 版本：v1.0　　编制日期：2026-09-24
> 适用场景：基于清华 OpenMAIC（多智能体互动课堂）进行校内化二次开发，并与学校教学平台、智能体平台对接
> 说明：文中所有代码位置均基于当前代码库实际核对（文件路径:行号），可直接用于开发定位。

---

## 〇、项目背景与目标

本项目基于清华 OpenMAIC 多智能体互动课堂系统开展校内化二次开发，核心目标：

1. **系统校内化**：完成统一身份认证、多用户隔离、服务器化部署，使系统达到校内可用、可管、可控的标准；
2. **教学能力校本化**：扩展校本教学 Skill 与课堂角色，沉淀学校教学经验；
3. **★ 与本地教学平台对接（核心任务之一）**：将系统与学校在用的本地教学平台打通，实现**单点登录免密跳转、课程与学生名册同步、教师既有课件一键导入、课堂学习数据与成绩回传**，让 OpenMAIC 融入学校既有的教学业务流程，而不是成为一个孤立的新系统；
4. **与学校智能体平台对接**：通过 MCP 协议接入学校智能体平台的能力与知识库，实现「课堂智能体可用全校智能体资源」。

> **重点关注**：目标 3「与本地教学平台对接」是决定本系统能否真正被教师用起来的关键——若不能免登进入、不能复用教师已有的课件和班级名单，教师的使用意愿会大幅降低。建议将其列为与「系统校内化」同等优先级的必做任务。

---

## 一、现状盘点：系统能力与可扩展性

先明确「哪些是现成的、哪些要自己写」，这是排期的前提。

| 能力模块 | 当前实现 | 可扩展性 | 代码依据 |
|---|---|---|---|
| LLM 接入 | 静态 Provider 注册表，支持 OpenAI/Anthropic/Bedrock/Google/Azure 五类协议 | ★★★ 支持运行时自定义 + 服务端预置 | `lib/ai/providers.ts:75`；`lib/server/provider-config.ts:354` |
| Agent 角色 | 6 个内置角色（1 教师/1 助教/4 学生），`role` + `priority` + `allowedActions` 驱动 | ★★★ 可自由增删角色 | `lib/orchestration/registry/store.ts:47-192` |
| Agent 工具 | allowlist 门控的工具装配（web_search / knowledge_rag / skill 等） | ★★★ 新增工具仅需改 3 处 | `lib/server/agent-runtime/runner.ts:1440,1488-1505` |
| 教学 Skill | 24 个内置教学法技能（课程规划、费曼学习、事实核查、螺旋课程、教师风格克隆等） | ★★★ 可新增校本教研 Skill | `skills/agent-runtime/*/SKILL.md` |
| 知识库 RAG | 已具备扩展脚手架，配置 `KNOWLEDGE_RAG_URL` 即注册工具 | ★★★ 待填地址即可用 | `lib/server/agent-runtime/knowledge-rag.ts:35` |
| 数据持久化 | 三层：浏览器 KV/IndexedDB ｜ 服务端 Postgres + S3；含 catch-all REST 接口 | ★★☆ 可换 adapter，但需改造 | `app/api/persistence/[...path]/route.ts:5`；`lib/config/feature-flags.ts:24,41` |
| 内容导入 | PPTX 完整支持；PDF 走阿里 DocMind；无 docx 专用导入 | ★★☆ 新格式需写 parser | `packages/@openmaic/importer/src/index.ts:24,40` |
| 视频导出 | 独立 render-service（Chromium + FFmpeg），Docker profile 开关 | ★★☆ 可调参，难定制 | `render-service/`、`docker-compose.yml:81-135` |
| MCP 协议 | **依赖已装但源码零接线** | ★☆☆ 需从零开发 | `package.json:71`（无任何引用） |
| 认证/用户体系 | **无登录、无 SSO、无多用户**，硬编码 `user-1` | ★☆☆ 必须自行开发 | `lib/persistence/server-auth.ts:1-13`（标注 DEVELOPMENT-ONLY）；`store.ts:329` |
| 对外 API | 40+ REST 路由 + SSE 事件流（Postgres LISTEN/NOTIFY） | ★★☆ 有基础，缺鉴权 | `app/api/**`；`lib/server/agent-runtime/event-notify-bus.ts:234` |
| 国际化 | i18next，12 种语言，JSON 语言包 | ★★★ 新增语言仅改 2 处 | `lib/i18n/locales/`；`lib/i18n/locales.ts:16-29` |

**一句话结论**：这个系统的「教学智能」部分扩展性极好（角色、工具、Skill、Provider 都是插拔式的），但「校园 IT 集成」部分几乎是空白（无认证、无多用户、无标准教育协议）。**二次开发的重点应当放在「集成层」，而不是「教学层」。**

---

## 二、二次开发方向清单

按落地优先级排序，标注工作量与代码切入点。

### P0 —— 校内上线前必须完成

#### 1. 统一身份认证（SSO）接入　`工作量：5-8 人日`
当前系统**没有任何登录机制**，任何人打开网址即拥有全部权限，这在校园环境中不可接受。

- **改造点**：
  - 新增认证中间件（建议 Next.js middleware，拦截 `app/` 全部路由）
  - 替换 `lib/persistence/server-auth.ts`（现为 DEVELOPMENT-ONLY 的静态 Bearer token）为真实会话校验
  - 把 `lib/store/.../store.ts:329` 硬编码的 `user-1` 替换为登录用户标识
- **对接方式**（按学校实际情况选一）：
  - 学校统一身份认证：CAS 2.0 / OAuth 2.0 / OIDC
  - 企业微信 / 钉钉 / 飞书扫码登录（校园更常用，改造成本最低）
- **收益**：解决"谁在用、能看什么"的根本问题，是多用户与数据隔离的前置条件。

#### 2. 多用户与数据隔离　`工作量：5-10 人日`
- **改造点**：现持久化层有 `owner` 概念雏形（`lib/persistence/owner-materials.ts:104`、`SHARED_ASSET_PRINCIPAL='shared'`），但默认全员共享。需把 `x-learner-key` 头（`server-auth.ts:85-113`）从"开发态约定"升级为"真实用户身份"。
- **配套**：课程/素材按用户或按院系隔离；教师与学生的权限分级。

#### 3. 内容安全与合规审计　`工作量：3-5 人日`
- 接入学校内容安全审核接口，对「用户输入 → 模型输出 → 生成课件/视频」全链路做审核
- 新增操作审计日志（谁在何时创建/导出了什么课程）
- **依据**：当前无任何审核或审计模块，生成内容直接落库。

#### 4. 服务器化部署　`工作量：3-5 人日`
- 用官方 `Dockerfile` + `docker-compose.yml` 上 Linux 服务器（详见《服务器部署方案》）
- 配 systemd / Docker restart 策略实现开机自启
- 配置内网模型网关地址（`.env.local` 的 `OPENAI_BASE_URL`）

---

### P1 —— 教学能力增强（让系统真正好用）

#### 5. 校本教学 Skill 扩展　`工作量：2 人日/Skill`
系统内置 24 个教学法 Skill，全部是 Markdown 定义，**新增成本极低**。

- **做法**：在 `skills/agent-runtime/` 下新建目录 + `SKILL.md`，参照 `curriculum-planner/SKILL.md` 的写法
- **建议新增**：
  - 校本课程大纲规范（对齐本校培养方案）
  - 学科专属教学法（如理工科"推导式讲解"、文科"史料研读"）
  - 课堂思政元素融入规范
  - 学校特有的考核/作业模板
- **价值**：这是"把学校的教学经验沉淀进系统"最直接的路径。

#### 6. 自定义 Agent 角色扩展　`工作量：1-2 人日/角色`
- **做法**：在 `lib/orchestration/registry/store.ts:47-192` 的 `DEFAULT_AGENTS` 增条目，配置 `role`（teacher/assistant/student）、`persona`、`avatar`、`color`、`priority`、`allowedActions`
- **已实践**：已完成"开小差学生"角色（见《走神同学角色改动说明》）
- **建议方向**：按学科/学段定制角色组（如"实验课助教""论文研讨同学"）

#### 7. 语音能力本地化　`工作量：5-8 人日`
- **现状痛点**：浙大模型网关**不支持 TTS**（`/v1/audio/speech` 返回 403），当前只能用浏览器原生 TTS，音质差且无法导出音频文件
- **改造点**：按 `lib/audio/provider-enablement.ts` 的 provider 契约接入本地部署的 TTS 服务（如 CosyVoice、ChatTTS、Edge-TTS 内网代理），实现"文字转语音并可打包进视频"
- **衍生价值**：视频导出的音轨才能统一，课堂实录观感提升明显

#### 8. 知识库正式接入 RAG　`工作量：2 人日`（脚手架已完成）
- **做法**：配置 `KNOWLEDGE_RAG_URL` / `KNOWLEDGE_RAG_API_KEY` / `KNOWLEDGE_RAG_TOP_K`，重启即生效
- **契约**：`POST {query, top_k}` → 返回片段列表（见 `knowledge-rag.ts:35`）
- **详见**：`docs-外部知识库接入说明.md`

---

### P2 —— 深度集成（与学校平台打通）

#### 9. MCP 协议接入　`工作量：8-15 人日`　★最高战略价值
**关键发现**：项目已经安装了 `@modelcontextprotocol/sdk`（`package.json:71`），但**全代码库无任何一处引用**——这是官方预留、尚未实现的能力。

- **为什么重要**：MCP 是智能体与外部工具/数据源对接的事实标准。打通它，意味着**学校智能体平台上的任何智能体、任何工具、任何知识库，都能挂进来给课堂智能体使用**，不必逐个写适配器。
- **改造点**：
  1. 新增 MCP client 管理器（读取配置 → 连接 MCP server → 拉取工具清单）
  2. 在 `runner.ts:1440` 的 `assembleRunnerTools` 中把 MCP 工具动态注入
  3. 在 `runner.ts:1488-1505` 的 `allowedToolNames` 集合中放行动态工具名
  4. 新增设置页（参照 `components/settings/web-search-settings.tsx`）
- **风险**：需处理工具名冲突、调用超时、外部工具的可信度与审计。

#### 10. 课件导入打通教学平台　`工作量：5-8 人日`
- **现状**：`packages/@openmaic/importer` 完整支持 PPTX（`:24 parse()`、`:40 importPptx`）
- **做法**：教师在教学平台已有的 PPT 课件，通过导入接口一键转成 OpenMAIC 的互动课堂
- **若要支持新格式**（docx、教学平台专有包）：在 `importer/src/parser` 新增解析器并桥接到 `@openmaic/dsl`

#### 11. 学习数据回传与成绩对接　`工作量：8-12 人日`
- **做法**：把课堂测验结果（`app/api/quiz-grade`）、互动表现、学习时长，通过接口回传教学平台成绩册
- **接口基础**：系统已有 `/api/usage`、`components/settings/usage-dashboard.tsx` 可作数据源
- **标准路径**：若教学平台支持 LTI 1.3 Assignment & Grade Services，走标准协议最省事

#### 12. 管理后台　`工作量：10-15 人日`
- 教师/课程/配额管理、用量统计、内容审核队列、系统配置下发
- **基础**：模型配置已支持服务端统一下发（`server-providers.yml` + `/api/server-providers`，见 `lib/server/provider-config.ts:134-232`），可复用该模式

---

## 三、与学校教学平台对接方案

> 教学平台（Canvas / Moodle / 超星 / 学堂在线 / 校本平台等）的对接分四个层次，**建议按"身份 → 数据 → 内容 → 成绩"顺序推进**，每层都可独立交付。

### 方案 A：LTI 1.3 标准集成（若平台支持，强烈推荐）

LTI（Learning Tools Interoperability）是国际教育技术互操作标准，Canvas、Moodle、Blackboard 等主流平台原生支持，国内部分平台也已支持。

| LTI 能力 | 用途 | 对应改造 |
|---|---|---|
| **LTI Launch** | 从教学平台课程页一键跳进 OpenMAIC，免二次登录 | 实现 LTI 工具端（OIDC 登录流 + JWT 校验） |
| **Deep Linking** | 教师在教学平台里挑选/创建 OpenMAIC 课堂，挂到课程章节 | 实现 Deep Linking 响应 |
| **NRPS**（名册服务） | 自动同步课程学生名单 → 自动生成课堂里的"学生智能体" | 调用 NRPS 接口拉名册 |
| **AGS**（成绩服务） | 课堂测验成绩自动写入平台成绩册 | 调用 AGS 回传分数 |

**优点**：标准化、一次开发多平台通用、免维护对接代码。
**前提**：需确认学校教学平台是否开放 LTI（**这是首要待确认事项**）。

### 方案 B：数据层对接（无 LTI 时的务实选择）

```
教务系统 / 教学平台
        │  ① 课程、班级、师生名册（定时同步或按需查询）
        ▼
   校内数据中台 / 中间库（视图或 API）
        │  ② OpenMAIC 新增「同步服务」
        ▼
   Postgres（document_* / asset_* / agent-session 等表）
```

- **改造点**：新增同步任务，把课程与名册写入 OpenMAIC 的持久化层
- **注意**：OpenMAIC 现有表结构（`packages/@openmaic/storage/.../document/pg.ts:121-224`）面向"课程内容"，**没有班级/学生实体**，需新增表或旁路存储
- **优点**：不依赖平台协议，灵活性高；**缺点**：需逐个平台适配

### 方案 C：内容层对接（最低成本、见效最快）

- **教师上传 PPT → 一键转为互动课堂**（PPTX 导入已完整支持）
- 可做成"教学平台课件目录 → 批量导入"的脚本工具
- **建议作为第一期交付**，让教师先感知价值，再谈深度集成

### 方案 D：轻量嵌入（快速验证）

- 用 iframe 嵌入教学平台 + SSO token 透传（`ALLOWED_FRAME_ANCESTORS` 构建参数已预留，见 `Dockerfile:51,64`）
- **优点**：1-2 天可出 demo；**缺点**：非标准，跨域与会话同步需自行处理

---

## 四、与学校智能体平台对接方案

对接是**双向**的，先想清楚"谁调谁"。

### 形态 1：OpenMAIC 作为「教学智能体」被平台调用（推荐先做）

```
学校智能体平台 ──HTTP/SSE──▶ OpenMAIC 对外 API
```

- **现成能力**：已有 40+ REST 路由，如 `/api/generate-classroom`（生成课堂）、`/api/chat/pi`、`/api/quiz-grade`、`/api/export-video`
- **改造点**：
  1. **加鉴权**（当前 API 无鉴权，开放给平台前必须补上 API Key 或 OAuth2 client credentials）
  2. 定义稳定的对外契约（版本化、限流、错误码）
  3. 用 SSE 事件流（`/api/agent/sessions/[id]/events`）向平台上报任务进度
- **价值**：让 OpenMAIC 成为学校智能体生态里的"课堂生成"能力节点

### 形态 2：平台智能体挂进 OpenMAIC（MCP 路线，战略价值最高）

```
OpenMAIC 课堂智能体 ──MCP client──▶ 学校智能体平台的 MCP Server
                                      ├─ 教务数据查询
                                      ├─ 校本知识库检索
                                      ├─ 学科专用工具
                                      └─ 校内业务系统（排课/成绩/图书馆）
```

- **现状**：SDK 已装（`package.json:71`）但**未接线**，需从零开发（见 P2-9）
- **收益**：一次性打通，之后学校智能体平台新增任何工具，课堂智能体都能即插即用

### 形态 3：共享模型网关与知识库（已在做）

| 共享资源 | 现状 | 说明 |
|---|---|---|
| 模型网关 | ✅ 已通 | `.env.local` 指向学校网关，或用 `server-providers.yml` 服务端统一下发 |
| 知识库 | 🔶 脚手架就绪 | 配置 `KNOWLEDGE_RAG_URL` 即可调用校本知识库 |
| 内容安全 | ❌ 待接 | 建议直接复用学校平台的审核能力 |

### 接口设计建议

1. **统一鉴权**：API Key（机器对机器）+ OAuth2/OIDC（用户态）双轨
2. **版本化**：对外路径加 `/api/v1/` 前缀，避免内部重构破坏约定
3. **异步任务**：课堂生成、视频导出是长任务，统一用「提交任务 → 返回 jobId → SSE/轮询取结果」模式
4. **可选 MCP 化**：把 OpenMAIC 自身也封装成 MCP Server，反向供学校平台调用，形成双向标准接口

---

## 五、分期实施路线

| 阶段 | 目标 | 内容 | 预估 |
|---|---|---|---|
| **一期**<br>可用 | 校内小范围跑起来 | SSO 登录 + 多用户隔离 + Linux 服务器部署 + 内容安全 + **本地教学平台对接预研（接口摸底与联调环境申请）** | 3-4 周 |
| **二期**<br>好用 | 教师愿意用 | 校本 Skill 扩展 + 知识库正式接入 + **本地教学平台课件批量导入** + 语音本地化 | 3-4 周 |
| **三期**<br>打通 | 与平台互联 | **与本地教学平台深度对接（免登跳转、名册同步、成绩回传）** + MCP 接入学校智能体平台 | 6-8 周 |
| **四期**<br>规模化 | 全校推广 | 管理后台 + 用量统计 + 性能优化 + 运维体系 | 4-6 周 |

> 建议**一期交付后即安排 1-2 门课的试点**，用真实反馈校正后续优先级，避免闭门造车。

### 专项任务分解：与本地教学平台对接

该任务按「四个对接层次」拆解，各层次可独立交付、独立验收：

| 序号 | 任务 | 交付物 | 依赖 | 预估 |
|---|---|---|---|---|
| T1 | **对接预研与接口确认** | 教学平台能力清单（是否支持 LTI / 有无开放 API / 认证方式）、对接技术选型结论 | 需信息中心提供文档与测试账号 | 3-5 人日 |
| T2 | **单点登录免密跳转** | 教师从教学平台课程页一键进入 OpenMAIC，无需二次登录；返回时可跳回原课程 | T1 结论；本系统 SSO 模块（P0-1） | 5-8 人日 |
| T3 | **课程与学生名册同步** | 自动同步课程、班级、学生名单；支持按班级一键生成课堂与分配学生角色 | 教学平台名册接口（LTI NRPS 或自研 API） | 5-8 人日 |
| T4 | **教师课件一键导入** | 教师在教学平台上已有的 PPT/PDF 课件，可直接导入生成互动课堂 | 现有 PPTX 导入能力（`packages/@openmaic/importer`） | 5-8 人日 |
| T5 | **学习数据与成绩回传** | 课堂测验成绩、互动参与度、学习时长回写教学平台成绩册 | 教学平台成绩接口（LTI AGS 或自研 API） | 8-12 人日 |
| T6 | **联调与试点验证** | 在 1-2 门真实课程中跑通全流程，形成《教学平台对接实施记录》 | T2-T5 完成 | 5 人日 |

> **验收标准建议**：教师能在教学平台课程页点击入口直接进入并创建课堂；课堂学生名单与选课名单一致；试卷/测验成绩能自动出现在教学平台成绩册中。


---

## 六、待确认事项（需学校信息中心/教务处配合）

对接方案能否落地，取决于以下信息，建议尽早确认：

1. **教学平台是什么？**（自研 / Canvas / Moodle / 超星 / 其他）**是否支持 LTI 1.3？**
2. **统一身份认证方式？**（CAS / OAuth2 / OIDC / 企业微信 / 钉钉）有无开发文档与测试环境？
3. **能否提供课程与名册接口？**（教务系统或教学平台的课程、班级、师生数据）
4. **智能体平台是否提供 MCP Server 或开放 API？** 有无工具/知识库清单？
5. **GPU 资源**：若要做本地 TTS/ASR 或私有化模型，是否有算力支持？
6. **数据合规要求**：学生数据出境/上云是否有限制？是否必须全内网部署？
7. **内容安全审核接口**：能否复用学校既有的审核能力？

---

## 七、附：关键代码位置索引

| 需求 | 文件位置 |
|---|---|
| 新增 LLM 服务商 | `lib/ai/providers.ts:75`（静态表）；`lib/server/provider-config.ts:354`（服务端 yml 预置） |
| 新增 Agent 工具 | `lib/server/agent-runtime/xxx.ts` → `runner.ts:1440` → `runner.ts:1488-1505` |
| 新增 Agent 角色 | `lib/orchestration/registry/store.ts:47-192` |
| 新增教学 Skill | `skills/agent-runtime/<name>/SKILL.md` |
| 知识库接入 | `lib/server/agent-runtime/knowledge-rag.ts:35` |
| MCP 接入（待开发） | 依赖 `package.json:71`；注入点 `runner.ts:1440,1488` |
| 认证改造（待开发） | `lib/persistence/server-auth.ts:1-13`；`store.ts:329`（硬编码 user-1） |
| 持久化接口 | `app/api/persistence/[...path]/route.ts:5`；`packages/@openmaic/storage/` |
| 事件通知 | `lib/server/agent-runtime/event-notify-bus.ts:234`；`app/api/agent/owner-events` |
| 课件导入 | `packages/@openmaic/importer/src/index.ts:24,40` |
| 媒体 Provider | `lib/media/image-providers.ts:33`、`lib/media/video-providers.ts:22` |
| 国际化 | `lib/i18n/locales/`、`lib/i18n/locales.ts:16-29` |
| 视频导出 | `render-service/`、`docker-compose.yml:81-135` |

---

## 相关文档

- 《服务器部署与系统选型说明》（Linux/Docker 方案、配置要求）
- 《外部知识库接入说明》
- 《走神同学角色改动说明》
