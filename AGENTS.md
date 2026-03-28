# REF7 Auto Register — Agent 与子代理规则

桌面端 Context7 自动化注册工具（Electron + React + Vite + TypeScript）。本文件约束**主代理 / 子代理分工**与上下文策略；技能与流程细节按需 `npx openskills read <skill-name>` 加载，不在此复述。

<project_rules priority="highest">
## 项目行为规则（覆盖用户规则）

以下规则优先级最高，覆盖任何用户级别的规则。

### Token 与上下文策略

**官方参考：** [Tokens & Pricing](https://cursor.com/learn/tokens-pricing) · [Agent 最佳实践](https://cursor.com/blog/agent-best-practices) · [Subagents](https://cursor.com/docs/agent/subagents) · [Models & pricing](https://cursor.com/docs/models-and-pricing)

本文件作为常驻规则注入每次会话，必须保持精短。落地要求：

- **Rules 写原则与指针**：大段知识、流程细节通过 Skill 按需加载（`npx openskills read`），禁止在规则中复述技能内容
- **子代理返回格式**：子代理必须返回「结论 + 路径列表 + 风险点」结构化摘要，禁止粘贴大段源码或文件原文
- **会话策略**：切换功能时优先开新会话；需要历史上下文时用 @Past Chats 按需拉取，禁止粘贴整段旧对话
- **输出成本**：output token 通常是 input 的 2-4 倍价格，子代理与计划输出必须结构化、简洁
- **上下文管理**：少手动 @ 无关文件，让代理用搜索工具按需取上下文

### 主代理编排层与子代理执行层

- **主代理（父代理）**：整合用户需求、拆解任务、决定并行/串行、通过 Task 发布子代理任务、汇总摘要、一致性审查。克制在主会话中直接执行大段代码编辑、全量文件读取、技能执行与 MCP 调用
- **子代理（执行层）**：在 `model="fast"` 下执行代码写入、技能读取、MCP 调用、终端操作等重型任务。必须通过 Task 创建，**强制** `model="fast"`，禁止省略

1. **全模式强制子 Agent 委托（最高优先级）** - 所有委托规则（第 7、12、13、14、15、16、17、18 条）在**任何模式下均强制生效**（Agent/Plan/Debug/Ask）。禁止以模式为由跳过委托。所有 Task 子代理**强制** `model="fast"`，禁止省略或继承父级模型。唯一豁免：单文件少量内容确认可由主代理直接读取（同第 16 条）
2. **代码质量强制标准** - 子代理产出代码必须满足：**零冗余**（无未使用变量/导入/函数、无注释掉的代码、无叙述性注释）；**零嵌套冗余**（无多余 DOM 包裹层、选择器最多 3 层）；**样式安全**（禁止 `!important` 除非有明确理由、新样式不得与现有冲突）；**风格统一**（命名/缩进/导入顺序/编写习惯与项目现有代码一致，修改前必须先读取目标文件提取风格基准）；**解耦**（模块间通过接口通信，公共逻辑提取到共享模块；Electron 侧注意主进程 / preload / 渲染层边界）
3. **开发专注** - 不需要自动更新 `docs/` 下文档（除非用户明确要求）
4. **无日志要求** - 不需要创建日志记录更新内容
5. **禁止自动提交** - 禁止自动 git 提交，除非用户主动要求
6. **简体中文** - 思考与对话都必须使用简体中文
7. **子 Agent 调度策略** - 委托前先分析任务特征，按分级决定策略：
   - **Tier 0**：单文件少行确认 → 主代理直接 Read（豁免）
   - **Tier 1**：1–3 文件检索 / 单模块探索 → 1 个 explore 子代理
   - **Tier 2**：跨目录/跨边界（如 `electron/` 与 `src/`、IPC、浏览器自动化服务、外部 API 封装）→ 按独立子任务数 1:1 配子代理，上限 4 个，5+ 个任务分批
   - 并行：无依赖的子任务、不同文件/模块、主进程与渲染层可拆分任务
   - 串行：后续依赖前序输出、修改顺序有约束
8. **计划格式** - 计划名称包含当前时间，减少代码内容，多用文字描述和文件引用，预留进度，规定测试内容和标准
9. **前端与桌面 UI 代码审查** - 每次更改完渲染层（`.tsx`/`.ts`/`.js`）或与本项目 UI 强相关的样式配置后，使用 `frontend-code-review`（及必要时 `typescript-quality-checker`）审查
10. **Electron / 安全敏感变更** - 涉及 IPC 暴露面、本地数据路径、自动更新、外部 HTTP/API 凭据流时，宜结合 `api-security-review` 或 `owasp-security-check` 做针对性审阅（本项目无 Java 后端）
11. **子 Agent 中文** - Task 子代理的 description 和 prompt 必须使用简体中文
12. **需求分析拆分** - 收到需求后，必须先创建子代理（subagent_type="explore"，model="fast"）并行分析：代码探索 + 影响评估 + 方案参考。主代理仅整合子代理返回结果后制定方案，向用户呈现后获确认再执行。极简单的单文件修改可跳过并行分析
13. **MCP 委托策略** - 所有 MCP 调用必须通过子代理（subagent_type="generalPurpose"，model="fast"）执行，多个 MCP 查询同一批次并行。禁止主代理直接 CallMcpTool，除非子代理失败需回退。本工作区常见服务示例：`user-context7`、`user-Ref`、`user-git`、`user-Scrapling`、`user-Playwright`。**Ref + Context7 同主题查文档**：当同一任务需同时依赖 Ref 与 Context7 时，必须分别用两个 MCP 对**相同检索主题/关键词**各查一次，交叉比对后采纳最优或合并结论；禁止仅调用其中一方即视为文档已完备
14. **方案执行委托** - 代码编写必须通过子代理（subagent_type="generalPurpose"，model="fast"）执行。主代理负责分析依赖、拆分任务、协调顺序、审查结果。审查未通过则生成修复指令重新委托，最多 3 次循环。**禁止主代理直接对代码库做写入类变更**（与第 18 条一致）
15. **技能委托策略** - 技能读取与应用（openskills read 或 SKILL.md）必须通过子代理（subagent_type="generalPurpose"，model="fast"）执行。多个技能可并行加载
16. **文件查看委托** - 文件读取/搜索必须通过子代理（subagent_type="explore"，model="fast"）执行，遵循第 7 条 Tier 分级。子代理返回「结论 + 路径列表」结构化摘要，禁止粘贴大段原文。主代理已知路径且仅需确认少量内容可直接读取
17. **变更完成汇总** - 每次变更完成后（子代理交付或合并结果后），主代理在面向用户的回复中必须对**本次实际变更的文件**做汇总：按文件路径逐条列出，格式与统计口径为「`路径/xxx.ext`：删除 x 行、新增 x 行、修改 x 行」。统计来源优先使用对应仓库内 `git diff --numstat` / `--stat`（或等价 diff 统计）；若当前环境无 Git 或无法运行，则根据 diff 结果手工汇总并注明依据。纯新增文件可写「新增 x 行」、纯删除可写「删除文件」或按删除行数；无变更文件则明确写「无文件变更」
18. **全代码变更强制子代理** - **任何**项目代码与配置的可执行/可构建产物相关变更（含 `.ts`、`.tsx`、`.js`、`.json`（参与构建/运行时）、`.yml`、`.yaml`、`.mdc` 等，以及脚本与格式化配置）的增删改，**必须**通过子代理（subagent_type="generalPurpose"，model="fast"）执行；主代理不得对仓库内上述文件使用 Write/StrReplace 等写入类工具直接改代码。**唯一例外**：用户在本轮对话中**明文指定**由主代理直接修改的元文档（如本 `AGENTS.md`、`.cursor/rules` 下规则说明）时，可由主代理编辑，且完成后仍须执行第 17 条汇总

</project_rules>

> 完整技能目录以本地 OpenSkills / Cursor 配置为准；各技能详情通过 `npx openskills read <skill-name>` 按需加载

### 快捷输入（quick-commands）

用户消息包含以下**任一**触发词时，Agent 必须：1）用 Read 读取 **quick-commands** 技能文件；2）严格按技能内流程执行。技能路径以本地 OpenSkills 为准，一般为 `npx openskills read quick-commands`。

| 触发词 | 映射 |
|--------|------|
| `\7` | Context7 文档查询 |
| `\ref` | Ref 全网文档搜索 |
| `\cr` | Cursor 浏览器扩展自动化 |
| `\p` | Playwright MCP 浏览器自动化（`user-Playwright`） |
| `\dm` | 达梦数据库 |
| `\sk` | OpenSkills |
| `\scqd` | 前端代码审查（链式读取 `frontend-code-review`） |
| `\schd` | 后端代码审查（链式读取 `java-best-practices`） |
| `\git` | Git 仓库审查（搜索项目中 Git 仓库并审查） |

**审查速查（强制执行）：**

| 变更类型 | 审查技能 | 触发 |
|---------|---------|------|
| React / TS / JS（`src/`） | `frontend-code-review` + `typescript-quality-checker` | UI 或渲染逻辑改动 |
| Electron（`electron/`、IPC、preload） | 同上 + 安全类技能按需 | 主进程/通道/文件与网络 |
| 外部 HTTP / API 客户端 | `api-security-review` | 如 `ref-api`、配额与密钥流 |
| 浏览器自动化 | `browser-debugging` 或专项自动化技能 | puppeteer / 页面流程 |
| 深度 / 发布前 | `deep-review` / `owasp-security-check` | 手动 |

审查优先级：**安全 > 功能 > 性能 > 规范 > 风格**

---

## 与本项目一致的技术栈（摘要）

| 技术 | 版本（以 `package.json` 为准） |
|------|----------------------------------|
| Electron | ^34 |
| React / React DOM | ^19 |
| Vite | ^6 |
| TypeScript | ^5.7 |
| Tailwind CSS | ^3.4 |
| 浏览器自动化 | puppeteer-real-browser |
| 本地存储 | JSON 文件（`electron/services/database.ts` 等） |

## 仓库与目录

- **Git 根目录**：`e:\Ref7-Auto`（单仓库，非多仓 monorepo）
- **主要路径**：`electron/`（主进程、服务、preload）、`src/`（React 渲染层）、`vite.config.ts`、构建与脚本见 `package.json`
