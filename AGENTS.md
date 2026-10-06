# HANDHELD.AI

掌机（Windows 11 掌上游戏机）上的 AI Agent harness：Electron 外壳 + React UI，用游戏手柄在客厅 / 掌机场景里驱动 AI 编码会话。产品定义见 `docs/HANDHELD.AI.md`，规格源头见 [`docs/specs/README.md`](docs/specs/README.md)。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | electron-vite 开发模式。渲染进程走 HMR，main / preload 改动自动重启 Electron |
| `npm run build` | 构建到 `out/` |
| `npm run start` | 运行构建产物（electron-vite preview） |
| `npm run typecheck` | 分别检查 main / preload / renderer 三个 tsconfig |
| `npm run lint` | ESLint，零 warning |
| `npm run format` | Prettier 写回 |
| `npm test` | Vitest 单元测试 |
| `npm run test:e2e` | 先构建，再用 Playwright `_electron` 跑冒烟测试（会打开 GUI，只在本地跑） |
| `npm run check` | 依次运行 typecheck、lint、test，完成任务前的统一自检 |
| `npm run clean` | 删除 `out/` 与 e2e 截图产物 |

**完成任何改动之前必须运行 `npm run check`，而且必须通过。**

## 目录结构

```
electron.vite.config.ts   # main / preload / renderer 三段构建配置
scripts/                  # 跨平台 Node 脚本（不用 .sh）
src/
  shared/                 # 主进程与渲染进程共用的纯 TS：IPC 契约、zod schema、设置类型
  main/                   # 主进程：系统能力、网络、Agent 引擎、IPC、设置、日志
  preload/                # contextBridge，只暴露 window.handheld
  renderer/               # UI，只负责渲染
    src/ui/               # 第三方 UI 库（Base UI）的唯一入口
    src/components/       # 业务组件
    src/debug/            # 手柄 / 麦克风调试页
    src/styles/           # Tailwind 入口、语义 token、主题取值
tests/
  unit/                   # Vitest
  e2e/                    # Playwright 冒烟测试（artifacts/ 不入库）
```

职责边界：

- **main 进程**负责系统能力、网络和 Agent 引擎；渲染进程不直接访问网络或 Node。
- **renderer** 只负责 UI。
- **shared** 里只放纯 TS，**不得** import electron 或 react。

## 运行时数据（profile 私有）

设置在 `%APPDATA%\handheld-ai\<profile>\settings.json`（首次启动写入默认值），日志在 `<profile>\logs\main.log`。dev 模式的 profile 是 `dev`，构建产物是 `default`，可用 `HANDHELD_PROFILE` 覆盖；跨 profile 共享的状态由 spec 02 定义。

## 平台约定（Windows 优先）

- 所有脚本必须能在 Windows 11 的 PowerShell 7 中运行；跨平台脚本用 Node 写，不依赖 bash 专有语法。
- 路径一律用 `node:path` 拼接，不得硬编码 `/` 或盘符路径。
- 仓库统一 LF 换行（`.gitattributes` 控制），提交前不要引入 CRLF。

## 安全约定

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`；渲染进程拿不到 `require`。
- preload 只暴露契约定义的 `window.handheld`，不暴露 `ipcRenderer` 本身；主进程在每个 handle 入口用 zod 校验入参。
- 不在渲染进程里访问网络；所有网络请求走主进程。
- 不把 API key 写进仓库或日志。

## 依赖约定

- 依赖使用精确版本（不带 `^` / `~`），升级单独提交。
- 阶段 A **禁止**引入需要 node-gyp 本地编译的依赖。
- preload 在 `sandbox: true` 下以 CommonJS 单文件打包，不要改成 ESM。

## 代码风格

- 代码、注释、提交信息一律用英文；命名遵循业界常用实践（组件 PascalCase、函数/变量 camelCase、常量 UPPER_SNAKE_CASE）。
- 注释精简：只解释意图、约束和非显而易见的取舍，方法名能说明的不写注释。

## UI 约定

- 第三方 UI 组件只能通过 `src/renderer/src/ui/` 使用，业务代码不得直接 import `@base-ui/react`（ESLint 会拦截）。
- 样式用 Tailwind；设计变量只能来自语义 token（`src/renderer/src/styles/tokens.css`），组件里不得硬编码颜色 / 字号 / 时长，也不得使用 Tailwind 调色板类名（如 `bg-zinc-900`）。
- 主题的具体取值只放在 `src/renderer/src/styles/theme/` 下；整体换主题只替换该目录。
- 新组件先在 `ui/` 里找有没有可以复用的。

## 网络

- 需要访问外文资源或遇到网络超时时，先设置代理再重试：
  `$env:HTTP_PROXY="http://127.0.0.1:7890"; $env:HTTPS_PROXY="http://127.0.0.1:7890"`
- 访问境内服务（如国内 npm 镜像）时直连，不要设代理。

## Git 管理

- 不在 master 上提交。简单任务在 master 上改完文件、验证后提醒用户自行提交；复杂任务新开 branch、做多个 commit，完成后提醒用户自行 squash and merge。

## 自举开发规则

（由 spec 04 追加。）

### Dogfooding rules (spec 04)

1. **You may be running inside the app you are editing.** Never terminate `opencode`, `electron`, or `node` processes. Never run `server:stop`. Never run `taskkill` or `Stop-Process`.
2. **Do not launch a GUI yourself.** Never run `npm run dev`, `npm run start`, or `stable:*`; the user already has these instances open. `npm run test:e2e` is allowed: it uses an isolated `e2e` profile and the fake engine, so it does not disturb the running instances.
3. **Edit only the main repository** (`C:\Apps\handheld-harness`). Never modify the `handheld-harness-stable` directory.
4. Run `npm run check` after every change, then tell the user:
   - what changed and where to look;
   - whether the change is live immediately through HMR (renderer) or restarts the dev instance (main / preload).
5. **Dependency changes:** on Windows, the Electron binary and files under `node_modules` are locked while the dev instance runs, so `npm install` fails with EBUSY or EPERM. Before adding or removing a dependency, tell the user the reason and the package name, and ask them to close the dev instance before installing.
6. Without an explicit user instruction, never `git commit`, `git push`, or `git reset --hard`, and never delete branches. When the user says "commit", follow the agreed format and make one commit per feature.
7. specs are the source of requirements. If the implementation diverges, say so first and record it in that spec's "实现记录". Stage B specs are directional: for open inputs (`P-xx`), propose an option and get the user's confirmation before acting.
8. Keep changes small and verifiable. One conversation does one thing; let the user verify before moving on.

Recovery procedures: [`docs/recovery.md`](docs/recovery.md). Daily workflow: [`docs/dogfooding.md`](docs/dogfooding.md).
