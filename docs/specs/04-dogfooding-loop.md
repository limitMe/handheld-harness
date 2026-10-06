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

实现日期：2026-10-06（分支 `feat/dogfooding-loop`）。

### 交付物

- **稳定版脚本**（`package.json` 新增，均用 `tsx` 运行，与 `server:*` 一致）：
  - `npm run stable:setup` / `stable:update` / `stable:rollback` / `stable:start` / `stable:shortcut`，实现于 `scripts/stable-*.ts`，公共逻辑在 `scripts/lib/stable.ts`。
- **状态栏 profile 标记**：`src/renderer/src/components/StatusBar.tsx` 增加 `profileBadge()`，`stable` → `STABLE`、`dev` → `DEV`、其余（含 `default`）不显示；profile 来自 `app.getInfo()`。
- **文档**：`docs/recovery.md`（故障恢复手册）、`docs/dogfooding.md`（日常工作流）；`AGENTS.md` 的"自举开发规则"按 spec 第 4 节翻译成英文并引用上述两份文档。
- **测试**：`tests/unit/stable.test.ts`（路径 / 标签纯函数）、`tests/unit/statusbar.test.tsx`（`profileBadge` 与 STABLE 徽标渲染）。
- **仓库配置**：`.gitignore` 放行 `docs/recovery.md`、`docs/dogfooding.md`，并忽略构建暂存目录 `.stable-out-tmp/`、`out.stable-backup/`；`README.md` 状态表把 00–03 标为"已完成"（04 待验收），环境变量表补充 `HANDHELD_STABLE_DIR`。

### 与 spec 的偏差 / 以实际为准的修正

- **路径**：沿用 01 的偏差，主仓库是 `C:\Apps\handheld-harness`，稳定版 worktree 是同级 `C:\Apps\handheld-harness-stable`（而不是 spec 示例里的 `handheld-ai-stable`）。新增 `HANDHELD_STABLE_DIR` 覆盖。
- **脚本运行时**：用 `tsx` 运行 TypeScript 脚本，与既有 `server:*` 脚本一致，便于复用类型并给纯函数写单测。
- **Electron 44.5.1 没有 `postinstall`**：`npm ci` **不会**下载 Electron 二进制（`node_modules/electron/package.json` 无 `scripts`，只有 `install-electron` bin）。因此 `stable:setup` / `stable:update` / `stable:rollback` 在 `npm ci` 之后会补跑一次 `node node_modules/electron/install.js`（幂等，已安装时立即退出）。这是 spec 第 3 节"`npm ci` 和 `npm run build`"的必要补充；否则 `stable:start` 会因缺少 `electron.exe` 失败。
- **"先构建到临时目录"**：`stable:update` / `stable:rollback` 用 `electron-vite build --outDir .stable-out-tmp` 构建到暂存目录，成功后再把旧 `out/` 改名为 `out.stable-backup/`、把暂存目录改名成 `out/`。构建失败或替换失败时旧 `out/` 保持不动（替换失败会回滚改名），不会留下半成品。
- **`stable:start`**：用 `electron-vite preview --skipBuild` 运行已有构建，不触发重新构建；显式设置 `HANDHELD_PROFILE=stable`、`HANDHELD_WORKSPACE=<主仓库>`、`HANDHELD_ENGINE_MODE=detached`、`HANDHELD_WINDOW=fullscreen`，并清掉可能残留的 `ELECTRON_RENDERER_URL`。
- **`stable:shortcut`**：生成 `%LOCALAPPDATA%\handheld-ai\stable-launch.cmd`（绝对 `node` + `electron-vite.js` 路径，避免依赖 PATH），再用 PowerShell `WScript.Shell` 在桌面和开始菜单创建 "HANDHELD.AI (stable)" 快捷方式（目标 `cmd /c <launcher>`，图标用 Electron 可执行文件）。仅 Windows 支持。
- **`stable:update` 顺序**：先检查主仓库工作区干净 → 跑 `npm run check` → `git merge --ff-only <main>` → 打 `stable-YYYYMMDD-N` 标签 → 仅当 `package-lock.json` 在两个 commit 间有变化时 `npm ci` → 构建。`stable:rollback` 用同一套构建/安装步骤回退到上一个 `stable-*` 标签。
- **进程规则**：未运行 `npm run dev` / `npm run start` / `stable:start`，没有启动任何 GUI；也没有结束任何 opencode / electron / node 进程。

### 已自动验证

- `npm run stable:setup` 成功且幂等（连跑两次）：创建 `stable` 分支（从 `main`）与 worktree，`npm ci`，补装 Electron 二进制，构建到 `out/`。已验证 `out/main/index.js` 与 `node_modules/electron/dist/electron.exe` 存在，`electron --version` 输出 `v44.5.1`。
- `npm run stable:shortcut` 成功：桌面与开始菜单出现 "HANDHELD.AI (stable)" 快捷方式；实测 lnk 的 Target 为 `cmd.exe`、Arguments 为 `/c "<launcher>"`、WorkingDirectory 为稳定版目录、图标为 Electron。
- `--outDir .stable-out-tmp` 的产物结构正确（`main/`、`preload/`、`renderer/`），可被改名成 `out/`。
- 守卫路径：`stable:start` / `stable:update` 在 worktree 缺失时、`stable:rollback` 在没有 `stable-*` 标签时、`stable:update` 在主仓库不干净时，都输出明确错误并以退出码 1 结束。
- `npm run check` 通过（typecheck、lint 零 warning、18 个测试文件 94 个用例）。

### 未完成 / 需要用户验证

- **验收 1（STABLE 标记）**：当前稳定版由 `main`（`f9c729d`）构建，不含本分支的状态栏标记。需要把本分支合并进 `main` 后运行 `npm run stable:update`、重启稳定版，才能看到 `STABLE`；`DEV` 在 `npm run dev` 下显示。
- **`stable:update` 的升级路径**：实现时 `stable` 与 `main` 相同，只验证到"无变化"分支；fast-forward + 打标签 + 按 lock 变化重装 + 重建的完整路径需在真实升级时确认。
- **验收 2–6、8–10** 涉及 GUI、手柄、真实引擎与最终提交，需要用户在掌机上按 spec 步骤验证；本实现遵守自举规则，未启动 GUI。
- 实现过程中创建了 `stable` 分支、`C:\Apps\handheld-harness-stable` worktree 以及两个快捷方式；用户可用 `git worktree remove` / 删除快捷方式撤销。

