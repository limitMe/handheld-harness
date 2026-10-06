# 02 · Agent 引擎适配层（OpenCode）

## 目标

在主进程里实现一层 `AgentEngine` 抽象。v1 只有 OpenCode 一种实现，负责：

- 管理 OpenCode server 进程的整个生命周期；
- 把 OpenCode 的 HTTP / SSE 接口归一化为本应用自己的类型；
- 通过 IPC 暴露给渲染进程。

做完之后：

- 不打开 UI，用一条命令就能端到端跑通"建会话 → 发消息 → 收到回复"；
- **开发模式下 Electron 重启不会杀掉正在工作的 Agent**，这是 spec 04 自举开发的前提。

## 范围

- **包含**：
  - 依赖锁定和二进制定位；
  - 三种 server 运行模式；
  - `AgentEngine` 接口和 OpenCode 实现；
  - SSE 事件归一化、断线重连、崩溃恢复；
  - IPC 暴露；
  - 引擎调试页；
  - 冒烟脚本和事件录制脚本。
- **不包含**：
  - 聊天 UI（03）；
  - 应用内配置模型和凭据（15）；
  - 第二种引擎（Claude Agent SDK，以后再说）；
  - 远程 server（P-10 已决定：只支持本地）。

## 依赖

- spec 01 已通过验收。
- spec 00 第 5 步已配置好 LLM 凭据。

## 设计

### 1. 依赖与版本（必须）

- `dependencies` 中精确锁定 `opencode-ai@1.18.34`（提供平台二进制）和 `@opencode-ai/sdk@1.18.34`。
- 单元测试断言这两个包在 `package.json` 里的版本号相同。
- 启动时比较 `opencode --version` 与 SDK 版本，不一致时记录 warning。
- 升级 OpenCode 必须单独提交，并重新录制事件夹具（见第 8 节）。

### 2. 定位二进制（必须）

按以下顺序查找：

1. 环境变量 `HANDHELD_OPENCODE_BIN`。
2. 工程内 `node_modules` 中的平台包，例如 `opencode-windows-x64`、`opencode-windows-x64-baseline`、`opencode-windows-arm64`。具体解析方式请先查看已安装的 `opencode-ai` 包怎样找到平台二进制，照着实现。
3. 只有设置了 `HANDHELD_OPENCODE_ALLOW_PATH=1`，才允许用 PATH 里的 `opencode`。
4. 都找不到时报错，错误信息里要说明查找了哪些位置。

**不要使用** SDK 自带的 `createOpencodeServer()`。它会直接调用 PATH 中的 `opencode`（版本可能对不上），默认固定端口 4096，没有设置访问密码，也不支持 detached 模式。可以参考它的实现：它通过解析 stdout 里的 `opencode server listening on <url>` 拿到地址。

### 3. Server 运行模式（必须）

模式由 `HANDHELD_ENGINE_MODE` 决定。开发模式默认 `detached`，构建产物默认 `attached`。此外该变量还接受 `fake`，用来启用 03 的 Fake 引擎（它不是 OpenCode 的运行模式，下表只列出 OpenCode 的三种）。

| 模式 | 启动 | 应用退出时 | 用途 |
|---|---|---|---|
| `attached` | 作为子进程启动 | 杀掉整个进程树（Windows 上用 `taskkill /pid <pid> /T /F`），正在运行的任务一起结束 | 生产（P-11 已决定：应用退出时任务一起结束） |
| `detached` | `detached: true`、`windowsHide: true`，stdout / stderr 重定向到日志文件，然后 `unref()` | **继续运行** | 开发 / 自举 |
| `external` | 不启动，只连接 `HANDHELD_OPENCODE_URL`（加上 `HANDHELD_OPENCODE_PASSWORD`） | 不处理 | 仅用于手动调试，不对用户开放（P-10：v1 只支持本地） |

三种模式的共同要求：

- 只监听 `127.0.0.1`。
- 端口自动分配。优先试 `--port=0` 再从输出里解析地址；锁定版本不支持的话，先自己找一个空闲端口再传进去。
- 访问密码每次随机生成 32 字节，通过环境变量 `OPENCODE_SERVER_PASSWORD` 传给 server。具体变量名和认证方式以锁定版本的 server 文档为准。
- server 的 `cwd` 设为工作区目录（第 4 节）。
- 环境变量 `HANDHELD_OPENCODE_CONFIG_CONTENT`（可选）：原样传给 server 的 `OPENCODE_CONFIG_CONTENT`，用于测试和临时调整权限策略（03 的验收要用）。`engine:record` 也用它。

**detached 模式下复用已有进程**：

- **登记文件**：server 启动后写入 `<appData>/handheld-ai/servers/<engineKind>/<key>.json`（v1 中 `engineKind` 固定为 `opencode`），内容为 `{ pid, url, password, version, workspaceDir, startedAt }`。
  - `<key>` = `sha1(规范化后的 workspaceDir（转小写、统一分隔符）+ "|" + opencodeVersion)`。
  - 登记文件**不按 profile 区分**。这样不同 profile（spec 04 的稳定版和开发版）只要工作区和版本相同，就共享同一个 server，看到同样的会话。
  - 用 Windows ACL 把登记文件限制为只有当前用户可读，例如通过 `icacls` 去掉继承权限、只授权当前用户。密码以明文保存在这个文件里。原因是 `safeStorage` 的密钥按应用身份区分，Node 脚本和不同 profile 不一定能解密。
  - 读写封装在独立模块 `src/main/engine/server-registry.ts` 中。
- 应用每次启动时：
  1. 读取对应 key 的登记文件；
  2. 健康检查（带认证）；
  3. 检查通过 → **复用**，日志里写 `reused server pid=…`；
  4. 检查失败：先确认该 pid 确实是 opencode 进程（检查进程名）再结束它，然后重新启动。**只能处理同一个 key 的 server，不得结束其他 key 的 server。**
- 新增 Node 脚本（应用没有运行时也必须能用）：
  - `npm run server:status`：列出所有登记的 server，显示 pid、地址、版本、工作区、是否健康；
  - `npm run server:stop -- <workspaceDir | --all>`：结束指定的 server，并删除登记文件。不带参数时只打印用法。

### 4. 工作区（必须）

- 工作区目录按以下优先级确定：
  1. `settings.engine.workspaceDir`；
  2. 环境变量 `HANDHELD_WORKSPACE`；
  3. 开发模式下默认是**本仓库根目录**（自举开发需要）；
  4. 构建产物中没有配置时，引擎状态为 `down`，并提示需要配置的环境变量或设置项。
- v1 只支持一个工作区，所有会话都建在这个目录下。
- 实现前先确认锁定版本的 server 如何区分项目：是按启动时的 `cwd`，还是按请求参数里的 `directory`。把结论写进实现记录，后续如果要支持多个工作区会用到。

### 5. 共享类型与接口（必须，放在 `src/shared/engine.ts`）

下面的类型是**渲染进程唯一能看到的数据形态**。OpenCode 的原始类型不得泄露到 `shared` 或渲染进程。字段可以按实际需要增加，但不得删除。

接口要与具体底座无关。v1 只实现 OpenCode，但要为以后接入其他底座（例如 DeepSeek Harness，见第 9 节）留好扩展点。要遵守三条约定：

- **能力声明**：底座之间的差异通过 `capabilities()` 声明，UI 只能按能力决定显示还是隐藏，不能按底座类型写分支。
- **会话引用**：本应用持久化或跨模块传递会话时，一律用 `SessionRef = { engineId, sessionId }`，不能只存 `sessionId`。
- **模型按会话设置**：通过 `setSessionModel` 设置，`prompt` 不再带 model 参数。

```ts
export type EngineKind = 'opencode' | 'fake'   // 以后新增底座时在这里扩展

export interface EngineCapabilities {
  streamingDeltas: boolean     // 是否有 part.delta（逐字流式输出）
  permissionAlways: boolean    // 授权请求是否支持 'always'
  questions: boolean           // Agent 能否提问（question.asked）
  commands: boolean            // listCommands 是否可用
  deleteSession: boolean       // 能否真正删除会话（否则只能关闭）
  transcriptReplay: boolean    // getMessages 能否返回完整历史
  multiClient: boolean         // 多个应用实例能否同时连接同一个后端
  forkSession: boolean         // 能否分叉会话（v1 不使用，先声明）
}

export interface SessionRef { engineId: string; sessionId: string }

export type EngineMode = 'attached' | 'detached' | 'external' | 'fake'

export type EngineStatus =
  | { state: 'starting' }
  | { state: 'ready'; mode: EngineMode; version: string; workspaceDir: string }
  | { state: 'reconnecting'; attempt: number; lastError?: string }
  | { state: 'down'; error: string; hint?: string }

export type SessionRunState = 'idle' | 'busy' | 'retry' | 'error'

export interface SessionSummary {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  runState: SessionRunState
  parentId?: string
  model?: ModelRef             // 当前会话生效的模型；未设置时使用默认模型
}

export interface ModelRef { providerId: string; modelId: string }

export type ChatPart =
  | { id: string; type: 'text'; text: string; synthetic?: boolean }
  | { id: string; type: 'reasoning'; text: string }
  | {
      id: string
      type: 'tool'
      tool: string
      title?: string
      state: 'pending' | 'running' | 'completed' | 'error'
      inputSummary?: string
      output?: string
      error?: string
    }
  | { id: string; type: 'file'; filename?: string; mime: string; url: string }
  | { id: string; type: 'other'; rawType: string }

export interface ChatMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  createdAt: number
  completedAt?: number
  model?: ModelRef
  error?: string
  parts: ChatPart[]
}

export interface PermissionRequest {
  id: string
  sessionId: string
  title: string
  kind: string
  patterns: string[]
  createdAt: number
}
export type PermissionReply = 'once' | 'always' | 'reject'

export interface QuestionRequest {
  id: string
  sessionId: string
  questions: Array<{
    header?: string
    question: string
    multiple?: boolean
    options: Array<{ label: string; description?: string }>
  }>
}

export type EngineEvent =
  | { type: 'engine.status'; status: EngineStatus }
  | { type: 'session.upserted'; session: SessionSummary }
  | { type: 'session.deleted'; sessionId: string }
  | { type: 'session.runState'; sessionId: string; runState: SessionRunState }
  | { type: 'session.error'; sessionId?: string; message: string }
  | { type: 'message.upserted'; message: Omit<ChatMessage, 'parts'> }
  | { type: 'part.upserted'; sessionId: string; messageId: string; part: ChatPart }
  | { type: 'part.delta'; sessionId: string; messageId: string; partId: string; delta: string }
  | { type: 'permission.asked'; request: PermissionRequest }
  | { type: 'permission.replied'; sessionId: string; requestId: string }
  | { type: 'question.asked'; request: QuestionRequest }
  | { type: 'question.replied'; sessionId: string; requestId: string }

export interface EngineSnapshot {
  engineId: string
  kind: EngineKind
  capabilities: EngineCapabilities
  status: EngineStatus
  sessions: SessionSummary[]
  pendingPermissions: PermissionRequest[]
  pendingQuestions: QuestionRequest[]
  defaultModel?: ModelRef
}

export interface AgentEngine {
  readonly id: string          // 引擎实例 id，例如 'opencode'；会写进 SessionRef，确定后不得修改
  readonly kind: EngineKind
  capabilities(): EngineCapabilities
  snapshot(): Promise<EngineSnapshot>
  listSessions(): Promise<SessionSummary[]>
  createSession(opts?: { title?: string; model?: ModelRef }): Promise<SessionSummary>
  deleteSession(sessionId: string): Promise<void>
  getMessages(sessionId: string): Promise<ChatMessage[]>
  setSessionModel(sessionId: string, model: ModelRef): Promise<void>
  prompt(sessionId: string, input: { text: string }): Promise<void>
  abort(sessionId: string): Promise<void>
  replyPermission(sessionId: string, requestId: string, reply: PermissionReply): Promise<void>
  replyQuestion(sessionId: string, requestId: string, answers: string[][]): Promise<void>
  rejectQuestion(sessionId: string, requestId: string): Promise<void>
  listModels(): Promise<Array<{ providerId: string; name: string; models: Array<{ id: string; name: string }> }>>
  listCommands(): Promise<Array<{ name: string; description?: string }>>   // 该引擎自己的命令集；不同底座的命令不同（P-12）
  onEvent(listener: (e: EngineEvent) => void): () => void
}
```

### 6. OpenCode 实现（必须）

- 代码放在 `src/main/engine/`：
  - `host.ts`：进程管理和运行模式；
  - `opencode/adapter.ts`：实现 `AgentEngine`；
  - `opencode/normalize.ts`：**纯函数**，`(rawEvent) => EngineEvent[]`；
  - `index.ts`。
- **引擎代码不得 import `electron`**。路径、日志、加密等通过参数注入，这样冒烟脚本可以脱离 Electron 直接在 Node 里运行。
- 优先使用 `@opencode-ai/sdk/v2`。锁定版本中 v2 不完整的话，可以混用 v1，在实现记录里注明。已核实存在的 API：
  - `session.*`：`list`、`create`、`delete`、`messages`、`promptAsync`、`abort`；
  - `permission.reply({ requestID, reply: 'once' | 'always' | 'reject' })`，旧接口 `respond` 已废弃；
  - `question.reply` / `reject`；
  - `event.subscribe`（SSE）。
  - 已核实的事件类型：`session.updated`、`session.status`、`session.idle`、`session.error`、`message.updated`、`message.part.updated`、`message.part.delta`、`permission.asked`、`permission.replied`、`question.asked`。
- `prompt()` 使用 `promptAsync`，服务端接受请求后就返回。之后的进展全部通过事件驱动 UI。
- `listCommands()`：OpenCode 的 SDK 里有 `command.list`，但它返回的是服务端注册的命令。`/clear` 这类命令在 OpenCode 里属于 TUI 自己的内置命令，不一定出现在这个列表里。实现时先核实实际返回内容，缺少的常用命令由适配层补上，并映射到服务端接口：例如 `/compact` → `session.summarize`，`/clear` → 新建会话。执行这些命令需要在 `AgentEngine` 里增加 `runCommand`，这在阶段 B 的 12 里扩展，届时同步更新引擎契约测试；v1 阶段 A 只要求 `listCommands()` 能返回列表。适配层维护的这份命令表是该引擎自己的，其他底座各有各的（P-12）。
- `capabilities()`：OpenCode 返回的能力除 `forkSession` 外都是 `true`（`forkSession` v1 不使用，先返回 `false`，实现时核实后再改）。
- `setSessionModel`：OpenCode 是在每次 `promptAsync` 时指定模型的，所以由适配层自己维护一张"会话 → 模型"表。
  - 这张表存成 `<appData>/handheld-ai/servers/<engineKind>/<key>.models.json`，和登记文件同目录、同 key，保证跨 profile 共享。
  - `prompt` 时把表里的模型带上。
  - 表里没有记录时，依次退回到该会话最后一条 assistant 消息用的模型，再退回到默认模型。
  - `SessionSummary.model` 也按同样的顺序计算。
- 遇到未知事件类型时，在 debug 级别记录日志后丢弃。正常运行中不得抛出异常。
- **合并 delta**：主进程按 `partId` 缓冲 `part.delta`，每 30 ms 最多向渲染进程推送一次合并后的 delta。
- **断线重连**：
  - SSE 断开后按指数退避重连，间隔 0.5 s → 1 s → 2 s → 4 s → 8 s 封顶；
  - 期间推送 `engine.status: reconnecting`；
  - 重连成功后推送 `ready`。渲染进程收到 `ready` 后必须重新拉取 `snapshot()` 和当前会话的消息，因为断线期间的事件已经丢失。
- **崩溃恢复**：
  - `attached` 模式：子进程意外退出时自动重启。60 秒内最多重启 3 次，超过后进入 `down` 状态。
  - `detached` 模式：每 10 秒做一次健康检查，失败就按复用流程重新启动。
- **日志**：server 输出写到 `<userData>/logs/opencode-server.log`。日志中**不得出现密码**。所有把 URL 或环境变量写进日志的地方都要先脱敏。

### 7. IPC 与调试页（必须）

- 主进程用一个 `EngineManager`（`src/main/engine/engines.ts`）管理引擎实例，按 `engineId` 查找。v1 里只注册一个实例：OpenCode，或者 03 的 Fake 引擎。
- 在 `src/shared/ipc.ts` 增加以下通道：
  - invoke 通道 `engine.<method>`，与 `AgentEngine` 的方法一一对应，`onEvent` 除外。
    - 与会话有关的方法，第一个参数改为 `SessionRef`，由 `EngineManager` 路由到对应的引擎；
    - 与会话无关的方法（`snapshot`、`listSessions`、`createSession`、`listModels`、`listCommands`），多一个可选参数 `engineId`，不传时使用默认引擎。
  - 事件通道 `engine.event`，载荷为 `{ engineId, event: EngineEvent }`。
- `window.handheld.engine` 暴露上述 IPC 形态。渲染进程看到的永远是 `SessionRef`。
- StatusBar 右侧加一个引擎状态点：绿色表示 ready，黄色表示 starting 或 reconnecting，红色表示 down。
- `Ctrl+Shift+E` 打开**引擎调试页**，显示：
  - 当前状态、模式、版本、工作区、pid；
  - 会话列表；
  - 待处理的权限请求和提问；
  - 最近 100 条 `EngineEvent`，可展开查看 JSON；
  - 按钮：新建会话、向选中会话发送一句测试文本、中止、重启 server（attached / detached 模式下可用）。

### 8. 脚本与测试（必须）

- **引擎契约测试**（`tests/engine-contract/`）：针对 `AgentEngine` 接口写一套与具体底座无关的测试，**任何引擎实现都必须通过**。
  - 测试按 `capabilities()` 跳过该引擎不支持的用例，比如 `transcriptReplay: false` 时跳过历史回放的断言。
  - 用例至少覆盖：建会话、发消息、等待 idle、读消息、设置会话模型、中止、删除（或按能力跳过）、事件顺序（message → part → idle）。
  - 本 spec 只用它跑 OpenCode；03 完成后，Fake 引擎也要通过。
- `npm run engine:smoke -- --engine opencode`：通过 `tsx` 在 Node 中运行，不启动 Electron。它就是用 `attached` 模式和临时数据目录，对真实 OpenCode 跑一遍契约测试中的端到端用例：
  1. 启动 server；
  2. `listModels()`；
  3. `createSession()`；
  4. `prompt("Reply with exactly: PONG")`；
  5. 等待会话变为 idle，超时 120 秒；
  6. `getMessages()`，断言 assistant 的文本包含 `PONG`；
  7. `deleteSession()`；
  8. 停止 server；
  9. 输出每一步的耗时，成功时退出码为 0。
- `npm run engine:record`：
  - 用一份临时配置，把 bash 权限设为 `ask`；配置项写法以锁定版本为准，可以通过 `OPENCODE_CONFIG_CONTENT` 传入。
  - 让 Agent 运行 `node -v`，脚本自动以 `once` 回复授权请求，然后等待完成。
  - 把全部**原始** SSE 事件写到 `tests/fixtures/opencode/1.18.34/basic-tool-permission.jsonl`。
  - 录制前先对事件里的路径、用户名做脱敏处理。
- 单元测试（Vitest）：
  - 用夹具驱动 `normalize.ts`，至少覆盖：
    - 文本 delta 能拼成完整文本；
    - 工具调用的 `pending → running → completed` 状态流转；
    - `permission.asked` / `permission.replied`；
    - 会话 busy → idle；
    - 未知事件被忽略。
  - 二进制定位顺序（mock 文件系统）。
  - 登记文件的 key 计算（路径大小写、分隔符的规范化）和复用判断：健康检查失败、进程已不存在、登记文件损坏三种情况。
  - delta 合并的节流逻辑（用假时钟）。
  - `EngineManager` 按 `SessionRef.engineId` 路由；遇到未知 `engineId` 时返回明确的错误。
  - "会话 → 模型"表的回退顺序。
- **ESLint 边界规则**：
  - `src/renderer` 和 `src/shared` 不得 import `@opencode-ai/*`，也不得 import `src/main/engine/opencode/**`；
  - `src/renderer` 中不得出现 `kind === '...'` 这种按底座类型的分支（可以用 `no-restricted-syntax` 规则，或者写一个简单的测试来检查）。

### 9. 多引擎扩展点（必须遵守，v1 不实现新底座）

v1 不实现第二种底座，但以下约定要从第一天开始遵守。这样以后接入新底座时，只需要新增一个适配器，不需要改 UI：

1. 所有底座差异都通过 `EngineCapabilities` 表达。新增底座缺少某项能力时，UI 按能力降级，例如：
   - 没有 `permissionAlways`：隐藏"始终允许"按钮；
   - 没有 `streamingDeltas`：整条消息一次性出现；
   - 没有 `commands`：列表输入里不显示命令类条目。
2. 所有持久化的会话引用都用 `SessionRef`。以后支持多个底座时，可以在不同任务上使用不同底座。
3. 进程管理按引擎类型分目录登记。
4. 预留一种 `stdio-bridge` 进程拓扑：对于只提供 stdio 协议（如 ACP）的底座，由一个 detached 的中继进程持有它的 stdio，再通过本地 socket 提供给主进程。这样它也能满足"Electron 重启时 Agent 不中断"和"多客户端共享"两条要求。**v1 只在 `EngineMode` 和 host 的结构里留出这个位置，不实现。**
5. **新增底座的检查清单**：
   - 实现 `AgentEngine`；
   - 如实声明 `capabilities()`；
   - 通过 `tests/engine-contract/`；
   - 提供录制的事件夹具和 normalize 测试；
   - 在 `EngineKind` 中登记；
   - 在 15 的系统菜单中提供选择入口。

#### 附录：DeepSeek Harness（DSH）评估备忘（2026-10-06，基于 `deepseek-ai/deepseek-harness` master 5badb15，npm `@deepseek-ai/dsh` 0.2.x）

以后决定接入 DSH 时，从这里开始。**届时必须重新核实**，因为 DSH 当时处于 developer preview，每周发 2–4 个预发布版本，并且明确声明会有不兼容的变更。

- **理念差异**：
  - OpenCode 是"服务端即产品"，对外提供完整、自己也在用的 HTTP + SSE API；
  - DSH 是"Everything is a Plugin"（基于 Cordis 框架，没有特权内核），扩展方式主要是在进程内写插件。
  - 现有第三方 DSH 桌面端全部是套壳它的 Web UI，没有一个自写客户端。
- **公开接口**：
  - `--profile sdk`（stdio JSON-RPC）：没有中止，没有授权，没有会话列表和删除。
  - `--profile acp`（ACP v1，stdio）：有 new / list / resume / close / prompt / cancel / request_permission / set_config_option，**缺少**删除、历史回放、提问、命令和逐字流式输出。逐字流式这一项待核实。
  - Web Host API（HTTP 加 WebSocket 多路复用）：能力最全，但属于内部接口。
- **能力映射**（相对 OpenCode 的缺口）：
  - `deleteSession`、`transcriptReplay`、`questions`、`commands`、`streamingDeltas`、`permissionAlways` 为 false；
  - stdio 协议下 `multiClient` 为 false，需要 `stdio-bridge` 才能补上。
- **候选路线**，按推荐顺序：
  1. ACP 加 `stdio-bridge`，做一个能力降级的"精简版"；
  2. 锁定版本，调用 Web Host 内部 API，追求能力对齐；
  3. 自写 Cordis 插件，在 DSH 进程内暴露与本应用 `AgentEngine` 一致的 HTTP + SSE 接口。能力最全，但耦合最深。
- **重新评估的时机**：DSH 发布带版本号的公开客户端协议，或者到 1.0。

## 验收标准

| # | 标准 | 验证方法 |
|---|---|---|
| 1 | 端到端冒烟 | 在掌机上运行 `npm run engine:smoke -- --engine opencode`，退出码为 0 |
| 2 | 归一化测试 | 已提交录制的夹具，`npm test` 通过 |
| 3 | dev 模式复用 | 运行 `npm run dev`，状态点变绿；关闭窗口后，`npm run server:status` 显示 server 仍然健康；再次运行 `npm run dev`，日志中出现 `reused server`，pid 不变 |
| 4 | 停止 | `npm run server:stop -- --all` 之后，`Get-Process opencode -ErrorAction SilentlyContinue` 没有输出 |
| 4b | 跨 profile 共享 | `npm run dev` 运行时，另开一个终端执行 `npm run build; $env:HANDHELD_PROFILE='p2'; $env:HANDHELD_ENGINE_MODE='detached'; npm run start`：两个实例的 pid 相同，在一个实例里新建的会话会出现在另一个实例的调试页中 |
| 5 | 生产模式清理 | 运行 `npm run build; npm run start`，退出应用后，`Get-Process opencode` 没有残留 |
| 6 | 崩溃恢复 | 应用运行中执行 `Stop-Process -Name opencode -Force`，状态点先变黄，10 秒内恢复绿色 |
| 7 | 只监听本机 | `Get-NetTCPConnection -OwningProcess <pid> -State Listen` 只显示 `127.0.0.1` |
| 8 | 需要认证 | 不带密码执行 `Invoke-WebRequest http://127.0.0.1:<port>/doc` 返回 401，或者锁定版本规定的未授权响应 |
| 9 | 调试页 | 在 `Ctrl+Shift+E` 中新建会话、发送测试文本，能看到事件流，状态最终变为 idle |
| 10 | 日志脱敏 | 搜索所有日志文件，找不到本次运行的密码 |
| 11 | 自检 | `npm run check` 通过，其中包括第 8 节的 ESLint 边界规则 |
| 12 | 扩展点 | 代码审查确认：`shared` / `renderer` 中没有 OpenCode 专有的类型；IPC 中与会话有关的调用都使用 `SessionRef`；`capabilities()` 已实现；在调试页设置会话模型后，下一条消息使用新模型（脚注可见） |

## 待定输入

- 无。P-10（只支持本地）、P-11（退出时任务一起结束）都已决定，`attached` 作为生产默认值。

## 给实现 Agent 的注意事项

- 写代码前先打开 `node_modules/@opencode-ai/sdk/dist/v2/gen/sdk.gen.d.ts` 和 `types.gen.d.ts`，确认方法签名和事件结构。运行中的 server 在 `/doc` 提供 OpenAPI 文档。
- 本 spec 中的 OpenCode 方法名和事件名是 2026-10 按 1.18.34 核实过的。与实际不符时**以实际为准**，并在实现记录中注明。
- 不要在渲染进程直接使用 SDK，也不要把密码传给渲染进程。

## 实现记录

（由实现 Agent 填写。）
