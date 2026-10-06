# 04 · 自举开发闭环（Dogfooding）

## 目标

建立"**用 HANDHELD.AI 开发 HANDHELD.AI**"的工作流：

- 用户在掌机上通过应用向 Agent 提需求；
- Agent 修改本仓库，用户马上在应用里看到效果，验证后提交；
- 就算 Agent 把应用改坏了，用户仍然有办法让 Agent 把它修好。

本 spec 是阶段 A 的终点。验收通过之后，阶段 B 的所有 spec 都通过这个闭环来实现。

## 范围

- **包含**：双实例拓扑、跨 profile 共享 server、稳定版的脚本和桌面快捷方式、AGENTS.md 里的自举规则、故障恢复手册。
- **不包含**：任何新的产品功能。

## 依赖

- spec 03 已通过验收。

## 设计

### 1. 拓扑：稳定版驱动 + 开发版预览（必须）

```
C:\dev\handheld-ai-stable   (git worktree，分支 stable，已构建)
   └─ 稳定版实例  profile=stable  全屏  ←── 用户在这里和 Agent 对话
            │  workspace = C:\dev\handheld-ai
            ▼
   OpenCode server（detached，按 工作区+版本 共享）── Agent 修改 C:\dev\handheld-ai
            ▲
   └─ 开发版实例  profile=dev  窗口化  npm run dev  ←── 用户在这里看修改效果（HMR）
C:\dev\handheld-ai          (主仓库，分支 main)
```

- **稳定版**跑的是上一个确认可用的构建产物，Agent 修改代码不会影响它。所以就算开发版改坏了，用户也总能通过稳定版继续指挥 Agent。
- **开发版**跑的是正在修改的代码，用来预览和验证。它连接同一个 server，所以两个实例看到的会话完全一样。
- **简化模式**：只开开发版，在开发版里直接对话。改坏时用第 5 节的恢复手册。适合只改渲染进程的小修改。

> iOS 类比：稳定版相当于你从 TestFlight 装的上一个可用版本，开发版相当于 Xcode 正在 Run 的 Debug 版本，两者共用同一个后端。

### 2. server 跨 profile 共享（spec 02 已实现，这里验证）

- spec 02 的登记文件按"工作区 + 版本"共享，所以稳定版和开发版只要指向同一个工作区，而且 OpenCode 版本相同，就会复用同一个 server。
- 稳定版和开发版的 OpenCode 版本不同（例如开发版刚升级）时，会各自启动一个 server，两边的会话互相看不到。这是预期行为，`stable:update` 之后两边会重新统一。

### 3. 稳定版脚本（必须）

以下都是 Node 脚本，在主仓库中运行：

| 脚本 | 行为 |
|---|---|
| `npm run stable:setup` | 如果没有 `stable` 分支，就从当前 `main` 创建；然后 `git worktree add ..\handheld-ai-stable stable`，进入该目录运行 `npm ci` 和 `npm run build` |
| `npm run stable:update` | 要求主仓库工作区干净，并且 `npm run check` 通过；把 `stable` 分支 fast-forward 到 `main`，打上标签 `stable-YYYYMMDD-N`；在稳定版目录里运行 `npm ci`（仅当 lock 文件有变化时）和 `npm run build`；最后提示用户重启稳定版 |
| `npm run stable:rollback` | 把 `stable` 分支回退到上一个 `stable-*` 标签，然后重新构建 |
| `npm run stable:start` | 用 `HANDHELD_PROFILE=stable`、`HANDHELD_WORKSPACE=<主仓库>`、`HANDHELD_ENGINE_MODE=detached`，以全屏模式运行稳定版目录中的构建产物 |
| `npm run stable:shortcut` | 在桌面和开始菜单创建"HANDHELD.AI (stable)"快捷方式，效果等同于 `stable:start`，方便在没有键盘时用触屏或手柄启动 |

- 稳定版窗口的状态栏要显示一个 `STABLE` 小标记，开发版显示 `DEV`，避免用户分不清。标记根据 `app.getInfo().profile` 决定：profile 为 `stable` 显示 `STABLE`，为 `dev` 显示 `DEV`，为 `default`（正式发布）时不显示。这个组件放在 01 的 StatusBar 里实现。
- `stable:start` 显式指定 `detached` 只是自举开发的需要：开发版和稳定版共享同一个 server，任何一边关闭都不应该中断任务。正式发布版的默认值仍是 `attached`，退出时任务一起结束（P-11）。
- `stable:update` 失败时，不得留下构建了一半的稳定版：先构建到临时目录，成功后再替换。

### 4. AGENTS.md 追加"自举开发规则"（必须）

把以下规则原样（翻译成英文）追加到 AGENTS.md：

1. **你可能正运行在你要修改的这个应用里。** 不得结束 opencode、electron、node 进程；不得运行 `server:stop`；不得运行 `taskkill`、`Stop-Process` 这类命令。
2. **不要自己启动 GUI。** 不得运行 `npm run dev`、`npm run start` 或 `stable:*`，用户已经开着这些实例。可以运行 `npm run test:e2e`，它使用独立的 e2e profile 和 fake 引擎，不会干扰正在运行的实例。
3. **只修改主仓库**（`C:\dev\handheld-ai`），**不得修改** `handheld-ai-stable` 目录。
4. 每次修改完成后运行 `npm run check`，然后告诉用户：
   - 改了什么，应该去看哪里；
   - 这个修改走 HMR 立即生效（渲染进程），还是会触发开发版自动重启（main / preload）。
5. **依赖变更**：Windows 上，开发版运行时 Electron 二进制和 `node_modules` 中的文件被锁定，`npm install` 会报 EBUSY 或 EPERM。所以要加或删依赖时，先告诉用户原因和包名，**请用户关闭开发版之后**再安装。
6. 没有用户明确指令时，不得 `git commit`、`git push`、`git reset --hard`，也不得删除分支。用户说"提交"时，按约定格式提交，一个功能一个提交。
7. specs 是需求的来源。实现与 spec 有出入时，先说明，再在对应 spec 的"实现记录"里记下来。阶段 B 的 spec 是方向性的：遇到待定输入（`P-xx`）时，先给出方案让用户确认，再动手。
8. 修改要小步、可验证。一次对话只做一件事，做完让用户验证。

### 5. 故障恢复手册（必须，写进 `docs/recovery.md`，并在 AGENTS.md 中引用）

| 症状 | 恢复方式 |
|---|---|
| 开发版白屏，或出现编译错误浮层 | 在稳定版里告诉 Agent 错误现象，Agent 运行 `npm run typecheck` 定位并修复 |
| 开发版主进程反复崩溃重启 | 同上。必要时用户在开发版终端里按 Ctrl+C 停掉它，修好之后再启动 |
| 稳定版也出了问题 | 运行 `npm run stable:rollback`，或者双击上一个可用的快捷方式 |
| 两个实例都不能用 | 在 Windows Terminal 中进入主仓库，运行 `opencode`（TUI）。如果锁定版本支持连接已有的 server（例如 `opencode attach <url>`，以 `opencode --help` 为准），可以直接接管原来的会话 |
| 代码被改乱，想放弃这次修改 | 用户手动执行 `git stash` 或 `git checkout -- .`。Agent 不得自行执行 |
| server 卡死 | 用户执行 `npm run server:status` 查看，然后 `npm run server:stop -- <workspace>`，再重启实例 |

### 6. 日常工作流（写进 `docs/dogfooding.md`）

1. 打开稳定版（快捷方式）和开发版（终端里 `npm run dev`）。
2. 在稳定版里新建任务，例如："实现 specs/13 里的『输入框：收起与展开』"。
3. 如果 Agent 提出待定问题，用户回答。
4. Agent 修改代码并运行 check，用户切到开发版窗口（Alt+Tab 或厂商的任务切换键）验证。
5. 不满意就继续在同一个任务里反馈；满意就说"提交"。
6. 积累一批可用的修改后，运行 `npm run stable:update`，然后重启稳定版。之后就可以用新功能（比如手柄操作）来继续开发了。

## 验收标准

| # | 标准 | 验证方法 |
|---|---|---|
| 1 | 稳定版搭建 | `npm run stable:setup` 成功；`npm run stable:shortcut` 生成快捷方式，双击后稳定版全屏启动，状态栏显示 `STABLE` |
| 2 | 共享 server | 稳定版和开发版同时运行时，`Get-Process opencode` 只有一个与本工作区对应的 server；两个实例的任务切换器里看到同样的会话 |
| 3 | 渲染进程闭环 | 在稳定版里让 Agent "把状态栏时间改成显示到秒"：开发版通过 HMR 显示秒，稳定版不变，`npm run check` 通过 |
| 4 | 主进程闭环 | 让 Agent 在主进程启动日志里加一行内容：开发版自动重启，稳定版里的对话不中断，开发版重启后能看到同一个会话 |
| 5 | 改坏后恢复 | 让 Agent 故意在 `App.tsx` 里制造一个语法错误：开发版出现错误浮层，稳定版仍然可用；再让 Agent 修复，开发版恢复 |
| 6 | 提交与升级 | 说"提交"后 Agent 完成提交；`npm run stable:update` 成功，重启稳定版后时间显示到秒 |
| 7 | 回滚 | `npm run stable:rollback` 后，稳定版恢复到上一个版本 |
| 8 | 依赖规则 | 让 Agent "加一个依赖 dayjs"：Agent 先请求用户关闭开发版，而不是直接安装 |
| 9 | 进程规则 | 让 Agent "帮我重启一下 opencode server"：Agent 拒绝自己执行，并告诉用户应该运行哪条命令 |
| 10 | TUI 兜底 | 关掉两个实例，在终端里运行 `opencode`，能继续和 Agent 对话。如果支持 attach，还要验证能接管已有会话 |

## 阶段 B 的进入方式

本 spec 通过后：

- 把 `specs/README.md` 中 00–04 的状态改为"已完成"。
- 之后每个阶段 B 的 spec，都在稳定版里以"实现 specs/1x"开始。Agent 先读 spec、列出待定输入和建议方案，等用户确认后再分步实现。
- **建议先做 10 和 11**，也就是手柄和焦点系统。做完并升级稳定版之后，就可以拔掉键盘，用手柄完成后续开发。

## 实现记录

（由实现 Agent 填写。）
