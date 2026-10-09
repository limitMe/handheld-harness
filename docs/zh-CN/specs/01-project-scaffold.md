# 01 · 工程脚手架

## 目标

在 `C:\dev\handheld-ai` 建立一个 Electron + React + TypeScript 工程，满足以下要求：

- 在掌机上 `npm run dev` 能启动应用，并支持热更新（HMR）；
- 类型检查、lint、单元测试、端到端冒烟测试都能运行；
- 自带**手柄调试页**和**麦克风调试页**，用来尽早验证调研中风险最高的两项：手柄输入和麦克风；
- 仓库里有给 AI Agent 看的 `AGENTS.md`。

## 范围

- **包含**：工程结构、构建与开发脚本、安全基线、主进程 / preload / 渲染进程骨架、类型化的 IPC、日志、设置存储骨架、多 profile、调试页、测试基建、仓库规范文件。
- **不包含**：OpenCode 集成（02）、聊天 UI（03）、正式的输入和焦点系统（10、11）、打包安装包（19）。

## 依赖

- spec 00 已通过验收。

## 设计

### 1. 技术选型（必须）

| 项 | 选择 |
|---|---|
| 包管理 | **npm**，提交 `package-lock.json`。不用 pnpm，它和 electron-builder 搭配有已知问题 |
| Node | `engines.node: ">=24 <25"`，并加 `.nvmrc` |
| Electron | 44.x，精确版本 |
| 构建 | electron-vite 5.x |
| UI | React 19.x + TypeScript（strict） |
| UI 组件 | **Base UI**（`@base-ui/react` 1.x），无样式组件库，只通过 `src/renderer/src/ui/` 包装后使用（见第 6 节） |
| 样式 | **Tailwind CSS 4.x**，在 electron-vite 的 renderer 配置里接 `@tailwindcss/vite`；用 `clsx` 加 `tailwind-merge` 封装一个 `cn()` 来合并类名 |
| TypeScript | 安装时选择 `typescript-eslint` 官方支持的最新 major，`tsconfig` 开启 `strict`、`noUncheckedIndexedAccess` |
| 运行时校验 | zod（用于 IPC 入参和设置文件） |
| 日志 | electron-log 5.x |
| 单元测试 | Vitest；渲染进程测试用 happy-dom + @testing-library/react |
| 端到端测试 | Playwright 的 `_electron` |
| 代码规范 | ESLint flat config + typescript-eslint + eslint-plugin-react-hooks，Prettier |

- 所有依赖都用精确版本。
- **不得**引入需要 node-gyp 本地编译的依赖。Tailwind 4 的引擎（oxide、Lightning CSS）通过 optionalDependencies 分发**预编译**的平台二进制，这是允许的，但第 1 条验收必须确认它在 Windows 上 `npm ci` 不触发编译。
- 可以用 `npm create @quick-start/electron` 的 react-ts 模板起步，但最终结构必须符合下文。

### 2. 目录结构（必须）

```
handheld-ai/
├─ AGENTS.md                 # 给 AI Agent 的工程说明（见第 9 节）
├─ CLAUDE.md                 # 只有一行：@AGENTS.md
├─ specs/                    # 把本 specs 目录拷进来，后续在仓库内维护
├─ electron.vite.config.ts
├─ package.json
├─ .gitattributes            # * text=auto eol=lf
├─ .editorconfig  .nvmrc  .prettierrc  eslint.config.js
├─ scripts/                  # Node 脚本（跨平台），不用 .sh
├─ src/
│  ├─ shared/                # 主进程和渲染进程共用的纯 TS：类型、IPC 契约、zod schema
│  │  ├─ ipc.ts
│  │  └─ settings.ts
│  ├─ main/
│  │  ├─ index.ts            # 入口：profile、单实例锁、生命周期
│  │  ├─ window.ts           # 创建窗口、全屏策略
│  │  ├─ ipc.ts              # 注册 handle，用 zod 校验入参
│  │  ├─ permissions.ts      # 媒体等权限处理
│  │  ├─ settings-store.ts   # userData/settings.json 读写
│  │  └─ log.ts
│  ├─ preload/
│  │  └─ index.ts            # contextBridge 暴露 window.handheld
│  └─ renderer/
│     ├─ index.html
│     └─ src/
│        ├─ main.tsx
│        ├─ App.tsx
│        ├─ ui/                  # 第三方 UI 库的唯一入口：包装 Base UI，统一样式和焦点行为
│        │  ├─ cn.ts
│        │  ├─ Button.tsx
│        │  ├─ Overlay.tsx      # 基于 Base UI Dialog，调试页使用
│        │  └─ index.ts
│        ├─ components/StatusBar.tsx
│        ├─ debug/GamepadDebug.tsx
│        ├─ debug/MicDebug.tsx
│        └─ styles/
│           ├─ app.css           # Tailwind 入口：依次引入 tailwindcss、tokens.css、theme/default.css
│           ├─ tokens.css        # 语义 token 的名字（用 @theme 声明），组件只认这里的名字
│           └─ theme/
│              └─ default.css    # 主题取值：颜色、圆角、阴影、字体等具体数值。换主题只换这个文件
└─ tests/
   ├─ unit/
   └─ e2e/smoke.spec.ts
```

### 3. npm scripts（必须，PowerShell 中可直接运行）

| script | 作用 |
|---|---|
| `dev` | electron-vite dev。改渲染进程代码走 HMR，改 main / preload 会自动重启 Electron |
| `build` | 构建到 `out/` |
| `start` | 运行构建产物（electron-vite preview） |
| `typecheck` | 分别检查 main / preload / renderer 三个 tsconfig |
| `lint` | eslint，零 warning |
| `format` | prettier --write |
| `test` | vitest run |
| `test:e2e` | 先 build，再用 Playwright 启动应用跑冒烟测试 |
| `check` | 依次运行 typecheck、lint、test，作为 Agent 完成任务前的统一自检命令 |

### 4. 主进程（必须）

- **Profile**：启动时读取环境变量 `HANDHELD_PROFILE`。开发模式默认 `dev`，构建产物默认 `default`。在 `app.whenReady()` **之前**把 `userData` 设为 `<appData>/handheld-ai/<profile>`。单实例锁按 profile 生效，这样稳定版和开发版两个实例可以同时运行（spec 04 会用到）。
- **单实例**：`app.requestSingleInstanceLock()`。第二个实例启动时，把已有窗口带到前台后退出。
- **窗口**：
  - 无边框，背景色与主题一致，避免白屏闪烁；等 `ready-to-show` 之后再显示。
  - 窗口模式由 `HANDHELD_WINDOW=windowed|fullscreen` 决定。开发模式默认 `windowed`（最大化），构建产物默认 `fullscreen`。
  - `F11` 切换全屏，`Ctrl+Shift+I` 打开 DevTools，`Ctrl+R` 重新加载。这些快捷键在应用内生效，不依赖菜单栏。
  - `webPreferences`：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、`backgroundThrottling: false`。
- **权限**（`permissions.ts`）：用 `session.setPermissionRequestHandler` 和 `setPermissionCheckHandler` 处理权限。只对本应用页面的 `media`（且 `mediaTypes` 只含 `audio`）放行，其他一律拒绝。
- **CSP**：渲染进程 `index.html` 设置 `default-src 'self'`、`style-src 'self' 'unsafe-inline'`、`img-src 'self' data:`。开发模式按 electron-vite 的要求放行 HMR。渲染进程**不直接访问外网**，所有网络请求都走主进程。
- **日志**：electron-log 写到 `<userData>/logs/main.log`。渲染进程通过 preload 转发日志。启动时记录应用版本、Electron/Chrome/Node 版本、profile、窗口模式和屏幕信息（分辨率、缩放比例）。
- **设置存储**（`settings-store.ts`）：
  - 文件为 `<userData>/settings.json`，带 `schemaVersion`，用 zod 校验。校验失败时备份为 `settings.invalid-<时间戳>.json`，然后回退到默认值。
  - 本 spec 只需要 `{ schemaVersion: 1, window: { mode } }`，后续 spec 往里加字段。
  - 写入采用原子写（先写临时文件，再 rename）。

### 5. IPC 契约（必须）

- 在 `src/shared/ipc.ts` 集中定义所有通道，分两类：
  - **invoke**：请求-响应，要定义请求和响应类型；
  - **event**：主进程推送到渲染进程。
- preload 只暴露 `window.handheld`，**不暴露** `ipcRenderer` 本身。暴露的 API 由契约自动推导类型，渲染进程里 `window.handheld.xxx` 有完整的类型提示。
- 主进程在每个 handle 入口用 zod 校验参数。
- 本 spec 至少实现：
  - `app.getInfo()`：返回版本、profile、平台、是否为开发模式；
  - `log.write(level, message, meta?)`；
  - `settings.get()` / `settings.update(patch)`。

> iOS 类比：preload ≈ `WKScriptMessageHandler` 桥。契约文件 ≈ 一份两端共用的 Swift protocol 定义。

### 6. 渲染进程骨架（必须）

- `App.tsx` 的布局是：顶部 `StatusBar`，下方是主区域（本 spec 只放一个占位欢迎页）。
- `StatusBar`：
  - 居中显示标题（本 spec 固定为 `HANDHELD.AI`）；
  - 右侧依次是听写指示图标（占位，默认隐藏）、网络状态（`navigator.onLine` 加 `online` / `offline` 事件）、电量（`navigator.getBattery()`，拿不到时隐藏）、时间（`HH:mm`，每分钟对齐刷新）。
- **主题与 token 分离**（P-08：视觉主题要独立，MVP 之后方便整体替换）：
  - `tokens.css` 在 Tailwind 4 的 `@theme` 中声明**语义 token** 的名字，让它们同时成为 CSS 变量和 Tailwind 工具类。例如 `surface`、`surface-raised`、`card`、`on-card`、`text`、`text-muted`、`accent`、`focus-ring`、`danger`，以及动效的 `duration-ui`、`ease-standard`。
  - `theme/default.css` 给这些语义 token 提供具体取值。实现方式（例如 `@theme inline` 引用 `:root` 变量）以 Tailwind 4 文档为准。
  - **组件只能使用语义 token**，不得直接写具体颜色，也不得引用 Tailwind 的调色板（如 `bg-zinc-900`）。这样以后整体换主题，只需要替换 `theme/default.css`，不用改组件。
  - 默认主题：参考 Base UI 官方文档示例的观感（中性、简洁），先做深色；Base UI 本身是无样式的。
  - 正文字号 ≥ 18px，代码字号 ≥ 15px；
  - 动效时长 `--t-fast: 120ms`、`--t-ui: 220ms`、`--t-scene: 450ms`；
  - 缓动 `--ease-standard`。
- `prefers-reduced-motion` 生效时，全局把动画时长降到接近 0。
- **样式约定**：
  - 优先使用 Tailwind 工具类；
  - 颜色、字号、时长、缓动只能来自语义 token，组件里不得硬编码具体数值；
  - 复杂的 `@keyframes` 写在 `styles/` 下的 CSS 文件里。
- **UI 包装层**（`ui/`）：
  - 业务代码不得直接 import `@base-ui/react`，只能从 `ui/` 引入。用 ESLint 的 `no-restricted-imports` 规则强制，`ui/**` 除外。
  - 本 spec 至少实现 `Button` 和 `Overlay`（基于 Base UI Dialog），**调试页用 `Overlay` 实现**，借此尽早验证 Base UI、Tailwind 和 HMR 能一起正常工作。
  - 包装组件把 Base UI 的状态属性（如 `data-open`、`data-starting-style`、`data-ending-style`）接到 tokens 定义的过渡上。

### 7. 调试页（必须，阶段 A 的关键风险验证）

用 `Ctrl+Shift+G` 打开 / 关闭**手柄调试页**，`Ctrl+Shift+M` 打开 / 关闭**麦克风调试页**。两者都以浮层形式显示，开发模式和构建产物里都能用。

**手柄调试页**

- 每帧（requestAnimationFrame）轮询 `navigator.getGamepads()`。对每个手柄显示：`index`、`id`、`mapping`、`connected`、`timestamp`，以及全部 `buttons`（`pressed`、`value`）和 `axes` 的实时数值。用标准映射的按钮名标注：A B X Y LB RB LT RT Back Start LS RS ↑ ↓ ← →，第 16 号为 Guide。
- 同时显示 `document.visibilityState`、`document.hasFocus()`，以及距最近一次输入变化过去的毫秒数。
- 记录 `gamepadconnected` / `gamepaddisconnected` 事件，显示最近 20 条。
- "测试震动"按钮：调用 `vibrationActuator.playEffect('dual-rumble', …)`，显示成功或失败的原因。
- "记录 10 秒"按钮：把 10 秒内所有按键变化写进日志（`category: gamepad-probe`），便于事后分析。

**麦克风调试页**

- 列出 `navigator.mediaDevices.enumerateDevices()` 中的音频输入设备，可以切换选择。
- 显示 `getUserMedia({ audio: true })` 的结果。失败时显示错误名称和消息，并提示用户检查系统设置（spec 00 第 7 步）。
- 显示实时电平表（AnalyserNode），以及采样率和声道数。

### 8. 测试基建（必须）

- 单元测试至少包括：
  - settings schema 的默认值、非法文件回退和备份；
  - IPC 契约的类型推导：用一个类型测试或运行时 smoke 测试保证每个通道在 preload 中都有暴露。
- `tests/e2e/smoke.spec.ts`（Playwright `_electron`）：
  1. 用 `HANDHELD_PROFILE=e2e`、`HANDHELD_WINDOW=windowed` 启动构建产物；
  2. 断言窗口出现、StatusBar 标题是 `HANDHELD.AI`、时间文本符合 `HH:mm`；
  3. 截图保存到 `tests/e2e/artifacts/`（该目录加入 `.gitignore`）；
  4. 关闭应用。
- e2e 测试会打开 GUI，只在本地掌机上运行，不放进 `check`。

### 9. AGENTS.md（必须）

至少包含以下内容：

- 一句话介绍项目，并指向 `specs/README.md`。
- 常用命令表（第 3 节），并明确规定：**完成任何改动之前必须运行 `npm run check`，而且必须通过**。
- 目录结构，以及每个目录的职责边界：
  - 主进程负责系统能力、网络和 Agent 引擎；
  - 渲染进程只负责 UI；
  - `shared` 里只放纯 TS，不得 import electron 或 react。
- Windows 约定：脚本用 Node 写，路径用 `path`，统一 LF 换行。
- 安全约定：不在渲染进程里访问网络或 Node；不把 API key 写进仓库或日志。
- 依赖约定：精确版本；禁止需要本地编译的依赖（阶段 A）。
- 代码风格：注释精简；代码、注释、提交信息用英文。
- UI 约定：
  - 第三方 UI 组件只能通过 `src/renderer/src/ui/` 使用；
  - 样式用 Tailwind，设计变量只能来自语义 token（`tokens.css`），具体取值只放在 `styles/theme/` 下；
  - 新组件先在 `ui/` 里找有没有可以复用的。
- 本节之后由 spec 04 追加"自举开发规则"。

## 验收标准

都在掌机上验证。命令在 PowerShell 7 中执行。

| # | 标准 | 验证方法 |
|---|---|---|
| 1 | 全新克隆能安装 | `git clone` 后运行 `npm ci`，没有报错，没有 node-gyp 编译 |
| 2 | 开发模式能启动 | `npm run dev`，15 秒内出现窗口，StatusBar 显示标题、时间、电量、网络状态 |
| 3 | HMR | dev 运行时改 `StatusBar.tsx` 里的文案，窗口在不重启的情况下更新 |
| 4 | 主进程热重启 | dev 运行时改 `src/main/log.ts`，Electron 自动重启，窗口重新出现 |
| 5 | 构建产物能运行 | `npm run build`，然后 `npm run start` 全屏启动，按 F11 退出全屏 |
| 6 | 自检通过 | `npm run check` 退出码为 0，lint 零 warning |
| 7 | 端到端测试 | `npm run test:e2e` 通过，并生成截图 |
| 8 | 安全基线 | dev 模式的 DevTools 控制台里**没有** Electron Security Warning；在控制台中 `typeof require` 为 `undefined`，`window.handheld` 存在 |
| 9 | 多 profile | 先 `$env:HANDHELD_PROFILE='a'; npm run start`，再在另一个终端用 `HANDHELD_PROFILE=b` 启动，两个实例能同时运行；在 profile `a` 下第二次启动只会激活已有窗口 |
| 10 | 设置容错 | 手动把 `settings.json` 改成非法 JSON 后启动，应用正常运行，并生成 `settings.invalid-*.json` 备份 |
| 11 | 手柄调试页 | 按 `Ctrl+Shift+G`，掌机自带手柄的每个按键和摇杆都有实时反馈；震动测试有结果（成功或明确的失败原因） |
| 12 | 手柄风险记录 | 分别在 ① Steam 未运行、② Steam 运行且开启 Steam 输入、③ 打开 Game Bar 叠层这三种情况下用调试页测试，把结果追加到本 spec 末尾的"实现记录" |
| 13 | 麦克风调试页 | 按 `Ctrl+Shift+M`，选择内置麦克风后说话，电平表有变化 |
| 14 | 日志 | `<appData>\handheld-ai\dev\logs\main.log` 中有启动信息，以及渲染进程转发来的日志 |
| 15 | Agent 说明 | 仓库根目录有 `AGENTS.md` 和 `CLAUDE.md`，内容符合第 9 节 |
| 16 | UI 基建 | 调试页基于 `ui/Overlay`，打开和关闭有 tokens 定义的过渡效果；dev 模式下修改 `styles/theme/default.css` 中的颜色，界面通过 HMR 立即变化；在组件里写死一个十六进制颜色或 Tailwind 调色板类名，lint 会报错（可用 `no-restricted-syntax` 或 Tailwind 的 lint 插件实现，做不到时在 AGENTS.md 里作为人工规则）；在 `components/` 下临时写一个直接 import `@base-ui/react` 的文件，`npm run lint` 会报错 |

## 待定输入

- 无。P-08 已决定：主题与 token 分离，默认主题参考 Base UI 文档示例的观感，MVP 之后整体替换。

## 给实现 Agent 的注意事项

- electron-vite 和 Electron 的配置项，请以锁定版本的文档为准，例如 `sandbox: true` 下 preload 只能是 CommonJS 或打包成单文件。
- 第 12 条要求用户配合，请把测试步骤写清楚，引导用户完成。
- 不要实现聊天、OpenCode 集成或焦点导航，这些在后续 spec 里。

## 实现记录

实现日期：2026-10-06（分支 `feat/project-scaffold`）。

### 与 spec 的偏差

- **工作目录**：按仓库 `AGENTS.md` 的约定，工程建在仓库根目录 `C:\Apps\handheld-harness`，不使用 spec 里的示例路径 `C:\dev\handheld-ai`。
- **specs 位置**：specs 保留在 `docs/specs/`（经用户确认未新建顶层 `specs/`），`AGENTS.md` 指向 `docs/specs/README.md`；`.gitignore` 改为忽略 `docs/*` 但跟踪 `docs/specs/`。
- **依赖版本修正**（均按锁定版本的实际 peer 元数据选定）：
  - TypeScript `6.0.3`：`typescript-eslint@8.71.1` 的 peer 为 `>=4.8.4 <6.1.0`，6.0 是官方支持的最新 major（7.x 尚不支持）。
  - Vite `7.3.6`：`electron-vite@5.0.0` 的 peer 为 `^5 || ^6 || ^7`。
  - `@vitejs/plugin-react` `5.2.0`：6.x 要求 Vite 8。
- **`duration-*` token**：Tailwind 4 没有 transition-duration 的 theme 命名空间，`duration-fast / duration-ui / duration-scene` 以 `@utility` 定义在 `tokens.css`；颜色、字号、圆角、阴影、缓动、字体等通过 `@theme inline` 引用 `theme/default.css` 中的 `--theme-*` 变量。
- **新增 `npm run clean`**（不在 spec 的脚本表内），清理 `out/` 与 e2e 截图。
- **`dev` 脚本加了 `--watch`**：electron-vite 默认只对渲染进程做 HMR，不监视 main / preload；必须 `electron-vite dev --watch` 才能满足验收 4（改 `src/main/log.ts` 自动重启 Electron）。
- **`settings.json` 首次启动即写入默认值**：设置存储只被 `app:getInfo` 之外的 `settings.get/update` 懒加载，启动时无人调用，会导致验收 10 无文件可改。现在 `registerIpc()` 启动时即实例化存储并落盘默认值。路径为 `<userData>/settings.json`，dev profile 即 `%APPDATA%\handheld-ai\dev\settings.json`，构建产物为 `%APPDATA%\handheld-ai\default\settings.json`。
- **开发 / 构建产物的默认值判定**：用 `ELECTRON_RENDERER_URL` 是否存在（`src/main/env.ts`）而不是 `app.isPackaged`。因为 `npm run start` 运行的是**未打包**的构建产物，`app.isPackaged` 为 false，用它会让验收 5 的默认全屏失效。现在 `npm run dev` 默认 `dev` + `windowed`，`npm run start` / 打包产物默认 `default` + `fullscreen`。
- **e2e 冒烟测试**在 spec 第 8 节四步之外，额外断言 `typeof require === 'undefined'`、`window.handheld` 存在，并调用 `app.getInfo()` 验证 IPC（覆盖验收 8 的自动化部分）。

### 已自动验证

- 验收 1：`npm ci` 成功，无 node-gyp 编译。
- 验收 4：`electron-vite dev --watch` 下修改 `src/main/log.ts` 会触发「electron main process rebuilt successfully / restarting electron app」并重新启动窗口。
- 验收 6：`npm run check` 退出码 0，lint 零 warning。
- 验收 7：`npm run test:e2e` 通过并生成截图。
- 验收 10：非法 JSON / schema 违规的备份与回退由 `tests/unit/settings.test.ts` 覆盖；并在 dev profile 实测：首次启动生成 `settings.json`，改成非法 JSON 后再次启动生成 `settings.invalid-<时间戳>.json` 且应用正常运行。
- 验收 14：`<appData>\handheld-ai\dev\logs\main.log` 写入启动信息与渲染进程加载记录。
- 验收 16：调试页基于 `ui/Overlay`；在 `components/` 下写死十六进制色、Tailwind 调色板类名或直接 import `@base-ui/react` 时 `npm run lint` 均报错（已实测）。
- 开发模式：`npm run dev` 能启动、renderer 经 `http://localhost:5173/` 加载。

### 未完成的验收（需要掌机硬件 / 人工确认）

2、3、4、5、9、11、12、13 需在掌机上人工验证（手柄、麦克风、Steam / Game Bar 组合场景）。

### 手柄风险测试结果（验收 12）

待用户在掌机上按 ① Steam 未运行 ② Steam 运行且开启 Steam 输入 ③ 打开 Game Bar 叠层三种情况测试后填写。

