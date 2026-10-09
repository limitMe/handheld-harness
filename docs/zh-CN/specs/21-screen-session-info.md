# 21 · 界面：会话信息

> 阶段 B · 方向性 spec。在"当前工作"之上补一个会话信息页，展示上下文 / 成本等指标，并允许在会话创建前选择工作目录、随时切换思考强度。

## 目标

让用户像在 OpenCode 桌面版一样，能查看当前会话的上下文消耗、成本和会话元数据；并能在发出第一条消息前决定这个会话用哪个工作目录、用多强的思考强度。

## 范围

包含：

- "当前工作"页状态栏右上角新增 INFO 图标按钮（不绑定快捷键），点击/按 A 打开会话信息页。
- 会话信息页（全屏覆盖，Back 关闭）展示：消息数、模型提供商、模型名称、上下文总量限制、当前使用词元量、上下文使用百分比、成本、创建时间、最后活动时间。
- 页面顶部两个可直接操作的行：
  - **工作目录**：仅当处于"新任务"（会话尚未创建、第一条消息还没发出）时可编辑，按 A 打开系统目录选择器。会话创建后只读。
  - **思考强度（effort）**：按 A 打开与主题 / 语言一致的弹出式选择框（`ChoiceDialog`），选项来自模型声明的 variants；新任务写入待建会话，已有会话调用 `setSessionEffort`。
- 抽象层扩展，保持底座无关：`EngineCapabilities` 增加 `messageUsage` / `modelEffort` / `sessionDirectory`；`SessionSummary` 增加 `effort` / `directory`；`ChatMessage` 增加 `usage`；`ModelGroup.models[]` 增加 `contextLimit` / `variants`；`AgentEngine` 增加 `setSessionEffort`。

不包含：

- 不展示可视化图表 / 报表；只做一次性统计。
- 不把工作目录扩展到"会话中途迁移"；迁移留待后续（OpenCode 的 `workspace` 能力）。
- 不在设置里增加"默认 effort"；新任务默认由底座决定。

## 依赖

- 02（`AgentEngine` 抽象与 `SessionRef`）、12（状态栏）、13（当前工作）、14（覆盖页与焦点容器的写法）。

## 设计

### 数据来源（OpenCode 1.18.34 / SDK v2）

锁定版本的 v2 SDK 已经提供所需字段，`normalize.ts` 之前把它们丢掉了：

- `Session`：`cost`、`tokens`、`model.variant`、`directory`、`time.created/updated`。
- `AssistantMessage`：`tokens { total, input, output, reasoning, cache.read, cache.write }`、`cost`、`variant`。
- `Model`：`limit.context`、`variants`、`name`。
- `session.create` / `session.promptAsync` 均接受 `directory` 与 `variant`。

"当前使用词元量"取**最近一条 assistant 消息**的 `tokens.total`（= `input + output + reasoning + cache.read + cache.write`）；"成本"取所有 assistant 消息 `cost` 之和；"上下文使用百分比" = 使用量 / 模型 `limit.context`。

### 每会话工作目录（P-22）

- OpenCode server 支持按调用传入 `directory`。因此会话在**创建时**固定目录，之后所有会话级调用（`messages` / `promptAsync` / `abort` / `delete` / `command` / `summarize`）都带上该目录。
- 目录只在"新任务"阶段可改：`newTask` 之后、第一条消息发送之前，选择结果存入 store 的 `pendingDirectory`，`createSession` 时传入；会话一旦创建即锁定，信息页只读展示 `SessionSummary.directory`。
- 目录选择用 Electron 主进程的 `dialog.showOpenDialog({ properties: ['openDirectory'] })`（新增 `app:pickDirectory` IPC），不引入 npm 依赖，符合"系统能力只在主进程"。

### 思考强度 / effort（P-23）

- OpenCode 称其为 model variant。可从模型元数据 `variants` 得到可选值，通过 `promptAsync` / `command` 的 `variant` 字段作用于后续回合。
- 新任务：`pendingEffort` → `createSession` 的 `model.variant`。已有会话：`setSessionEffort` 写入适配层的会话 effort 表，下一次 `prompt` 传入。
- effort 表持久化到 server 登记目录（`<key>.efforts.json`），跨 adapter 重启保留。

### 交互

- INFO 按钮：`FOCUS_ORDER.screen`，`data-testid="open-info"`；只在当前工作页显示（任务地图 / 系统菜单 / 文本编辑打开时隐藏）。
- 信息页：`absolute inset-0 z-40`，`FocusContainer` + `MenuRow`，Back 关闭；顶部目录行可编辑时显示 A 提示，否则只读；effort 行在可选值存在时可循环。
- 打开信息页时关闭任务地图 / 系统菜单，三者互斥。

## 验收方向

- 当前工作页右上角出现 INFO 图标；按 A 打开信息页，Back 返回。
- 新任务下信息页目录行可编辑，A 打开系统目录选择器；选定目录后发送第一条消息，会话目录为该目录且此后只读。
- 已有会话的 effort 行按 A 可切换，且下一次回复使用该 effort（消息脚注 / 会话元数据可核对）。
- 上下文使用量、百分比、成本随回复更新。
- 关闭 `messageUsage` / `modelEffort` / `sessionDirectory` 能力后，对应行隐藏或变成只读（用 fake 引擎的 `HANDHELD_FAKE_CAPABILITIES` 验证降级）。

## 待定输入

无阻塞项。P-22（每会话目录）与 P-23（effort 可编辑）已在实现前由用户确认。

## 给实现 Agent 的注意事项

- 渲染层不得按底座分支；只按 `capabilities` 决定显示 / 隐藏。
- OpenCode 类型不得越过适配层；`shared/engine.ts` 只放底座无关的形状。
- 目录路径在 Windows 上要能正确显示反斜杠路径。

## 实现记录

实现日期：2026-10-08（未提交分支，直接在主仓库工作区修改）。

### 决策（实现前用户确认）

- P-22：工作目录按**每会话独立**实现（用 OpenCode `directory` 参数），新建任务、发出第一条消息前可改，之后锁定，不影响其他会话。
- P-23：effort **可编辑**，从模型 `variants` 读取可选值。

### 实现说明

- 抽象层（`src/shared/engine.ts`）：新增 `MessageUsage`、`CreateSessionOptions`；`SessionSummary` 加 `effort` / `directory`；`ChatMessage` 加 `usage` / `effort`；`ModelGroup.models[]` 加 `contextLimit` / `variants`；`EngineCapabilities` 加 `messageUsage` / `modelEffort` / `sessionDirectory`；`AgentEngine` 加 `setSessionEffort`。
- 适配层（`src/main/engine/opencode/`）：`normalize.ts` 映射 tokens/cost/variant/directory；`adapter.ts` 在创建 / 选择 / 读取时解析并补齐 effort 与 directory，所有会话级调用透传 `directory`，`listModels` 透出 `contextLimit` 与 `variants`。
- 会话 effort 表（`<key>.efforts.json`）由 `server-registry.ts` 的 `readEfforts` / `writeEfforts` 管理，登记文件扫描会跳过它。
- IPC：新增 `app:pickDirectory`、`engine:setSessionEffort`；`engine:createSession.opts` 扩展 `effort` / `directory`。
- 渲染层：`SessionInfoPage.tsx`（新页面）、`workbench/sessionInfo.ts`（纯计算 + 单测）、`StatusBar` INFO 按钮、store 的 `pendingDirectory` / `pendingEffort` / `engineDefaultModel` / `setSessionEffort`、`App.tsx` 互斥与标题。
- 状态栏两个动作放在 `status-bar` row 焦点容器中，这样"上"从输入框进入状态栏时落在第一个动作（Tasks），左右可在两个动作间切换。注意 `useFocusable` 在组件顶层调用，必须把按钮拆成渲染在该容器内部的子组件，否则会捕获到外层容器。
- effort 用 `ChoiceDialog`（与主题 / 语言相同的弹出选择框）而不是按 A 轮换；新任务在未显式选择默认模型时，回退到引擎快照里的默认模型来取 variants。模型未声明 variants 时该行只读。
- fake 引擎同步支持三项能力，并生成合成 usage，便于离线 / e2e 验证。

### 已自动验证

- `npm run check`：typecheck、lint（0 warning）、`vitest run` 398 项全通过。
- 新增 `tests/unit/session-info.test.ts`（聚合、回退、无目录元数据）与 `normalize.test.ts` 的 usage/effort 映射用例。

### 未完成 / 需要人工验证（掌机 + 真实 OpenCode）

- **每会话目录的端到端行为**：`session.list({})` 是否返回跨 project 的会话（SDK 文档称返回全部会话，但需在真实 server 上核实）。若不返回，刷新后自定义目录的会话可能从列表消失，需要在 `refreshSessions` 里按已知目录分别 list 并合并。**这是本 spec 最需要人工确认的一点。**
- 真实 OpenCode 上 `directory` / `variant` 的接受情况与 `variants` 元数据是否非空。
- 1080p 7 英寸屏上信息页的排版（长路径换行、指标可读性）。
- `listModels` 返回的 `limit.context` 是否正确填入（依赖 `provider.list` 的运行时返回）。

### 后续补充（2026-10-08）：INFO 按钮改为开关

- INFO 按钮原来是"只打开"（`onOpenInfo` 恒为 `setInfoOpen(true)`），信息页打开后再点它不会返回。改为开关（`App.tsx`：`setInfoOpen((open) => !open)`），信息页打开时再点一下即回退到原来的"当前工作"页；`e2e/focus.spec.ts` 增加断言覆盖。
