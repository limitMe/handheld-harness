# 19 · 打包、原生辅助进程与设备集成

> 阶段 B · 方向性 spec。优先级最低，按需推进。如果 01 / 10 的手柄风险测试结果很差，"原生辅助进程"这部分要提前做。

## 目标

把 HANDHELD.AI 做成可以安装、可以更新、像主机应用一样启动的 Windows 应用，并补上 Web API 覆盖不到的设备能力。

## 依赖

- 阶段 A 完成。其余部分可以独立推进。

## 方向

### 打包与更新

- 用 electron-builder 生成 NSIS 安装包（x64；有 ARM 设备时再加 arm64）。
- OpenCode 平台二进制作为 `extraResources` 打包进去，02 的二进制定位逻辑要能处理打包后的路径。
- 自动更新：electron-updater 配合 GitHub Releases（私有仓库需要 token）。是否需要自动更新，待定。
- 代码签名：没有签名时 SmartScreen 会弹出警告。个人使用可以接受，记录在案。
- 安装包和 04 的稳定版是什么关系？可以考虑让稳定版也改用安装包分发。

### 原生辅助进程（触发条件：Web Gamepad API 不够用）

- 用一个小的独立进程（Rust 加 gilrs，或者 SDL3）读取 XInput 或 Windows.Gaming.Input，通过 stdio 或命名管道把按键事件发给主进程，再转发给 10 的输入管线。它相当于一个与 Gamepad API 并列的输入源。
- 能解决的问题：
  - 窗口失去焦点后仍能收到输入（例如在后台用快捷键唤起应用）；
  - Guide 键（如果没被系统占用）；
  - 更完整的震动支持；
  - Steam Overlay 等环境下 Web API 失效的情况。
- 需要 VS Build Tools 或 Rust 工具链，参考 00 第 10 步。产物以预编译的二进制形式提交或打包，不在 `npm install` 时编译。

### 设备集成

- **开机直接进入**：开机自启并全屏，提供一个类似主机的"启动即进入"选项。
- **从 Steam 或厂商启动器启动**：加为非 Steam 游戏时，Steam Input 会改写手柄输入。需要提供一份 Steam Input 模板（让 Steam 只透传 XInput），或者在文档中建议不要从 Steam 启动。
- **电源**：读取 AC / 电池状态，用电池时自动进入省电模式（18）。
- **震动**：封装 `haptics.pulse(kind)`，在长按开始、发送、授权请求、任务完成时触发。底层可以用 Web 的 `vibrationActuator`，也可以走原生辅助进程。
- **应用退出时任务一起结束**（P-11 已决定），所以不需要托盘或后台通知。可以考虑在有进行中的任务时退出，先弹出确认（P-19）。

## 待定输入

P-19：是否需要自动更新、开机自启、Steam Input 模板，以及有进行中的任务时退出是否确认。P-11 已决定。

## 实现记录

实现日期：2026-10-09（在主仓库工作区直接修改，未提交）。

### 本轮范围（用户已确认）

- 只做 **release 基础**：打包配置 + 发布版默认工作区；**不做**设备集成、自动更新、原生辅助进程与 `P-19` 的其余项。
- 打包产物由**用户自己运行** `npm run dist` 生成，实现 Agent 不运行打包、不启动 GUI（遵守自举规则）。
- release（无自举）时 OpenCode 的默认工作区 = 操作系统的"文档"目录（Windows `%USERPROFILE%\Documents`，与 OpenCode 默认一致），用户已确认。

### 实现说明

- **发布版默认工作区**：`src/main/engine/mode.ts` 的 `resolveWorkspaceDir` 新增可选 `defaultWorkspaceDir` 与来源 `release-default`，插在"开发模式仓库根目录"之后；`engine-runtime.ts` 传 `app.getPath('documents')`，并在该来源下递归创建目录。已同步 spec 02 第 4 节与实现记录。
- **打包态二进制定位**：`src/main/engine/binary.ts` 新增 `resourcesDir` 查找档（`<process.resourcesPath>/opencode/opencode.exe`，来源 `bundled resources`），排在 `node_modules` 与 PATH 之间；`OpenCodeEngine` 新增 `resourcesDir` 选项，`engine-runtime.ts` 传 `process.resourcesPath`。
- **打包配置**：新增 `electron-builder.yml`（NSIS、x64、`oneClick: false`、可改安装目录、桌面 / 开始菜单快捷方式、`artifactName: HANDHELD.AI-<version>-setup.exe`）。`extraResources` 把 `node_modules/opencode-windows-x64/bin/opencode.exe` 复制到 `resources/opencode/opencode.exe`；`files` 排除 `node_modules/opencode-*/**` 与 `node_modules/opencode-ai/bin/**`，避免把不能执行的二进制塞进 asar。图标复用 `resources/icons/handheld-ai.ico`。未配置代码签名（SmartScreen 会警告，个人使用可接受）；未配置 `publish`（自动更新待 `P-19`）。
- **脚本**：`package.json` 新增 `"dist": "npm run build && electron-builder --win --x64"`。
- **自举解耦**：`stable:*` 脚本、`HANDHELD_STABLE_DIR`、`STABLE`/`DEV` 徽标都只存在于仓库或开发 profile，安装包不包含；本轮无需改动。`README` 里 04 的状态修正为"已完成"。

### 新增依赖（需用户安装）

- `electron-builder@26.15.3`（devDependency，精确版本）。Windows 上开发版运行时 `node_modules` 被锁定，`npm install` 会报 EBUSY / EPERM。**请先关闭开发版实例，再在仓库里运行 `npm install`**，之后 `npm run dist` 才可用。
- 实现 Agent 未执行 `npm install`，因此本轮 `npm run check` 不覆盖打包脚本本身；打包需用户在安装依赖后自行验证。

### 未完成 / 需要用户验证

- 运行 `npm run dist` 生成安装包，安装后确认：应用全屏启动；状态栏无 `STABLE`/`DEV` 标记；引擎状态为 ready，工作区为"文档"目录；新建任务能正常对话；退出后 `npm run server:status` 无残留（`attached` 模式）。
- 掌机上不同分辨率 / 高 DPI 的图标与安装目录表现。
- `P-19` 的开机自启、Steam Input 模板、退出确认，以及原生辅助进程，均未实现，留待后续。

### 自动更新（2026-10-09）

用户已确认：**仅手动检查**（关于页按钮，启动时不自动检查）；发现新版本后弹 release note，确认后下载，**下载完成弹"立即重启 / 稍后"**；发布方式采用 `electron-builder --publish always` 自动发布到 GitHub Releases。

- **仓库**：`limitMe/handheld-harness`，公开仓库，因此运行时匿名读取 release，**应用内不携带任何 token**。
- **打包配置**：`electron-builder.yml` 新增 `publish: { provider: github, owner: limitMe, repo: handheld-harness, releaseType: release }`，构建时生成 `latest.yml`（并在应用里嵌入 `app-update.yml`）。`releaseType: release` 是必须的：electron-builder 默认建 draft，而 electron-updater 会忽略 draft。
- **脚本**：`package.json` 新增 `"dist:publish": "npm run build && electron-builder --win --x64 --publish always"`；发布需在环境变量 `GH_TOKEN` 提供有 `repo`（或 fine-grained `Contents: write`）权限的 token。
- **主进程**（`src/main/update/`）：
  - `service.ts`：与 Electron 无关的更新状态机（check / download / install + 订阅），未打包时返回 `unavailable`；
  - `notes.ts`：`normalizeReleaseNotes`（string / 数组）与 `fetchReleaseNotes`（GitHub Releases API，作为 latest.yml 未带 release note 时的兜底）；
  - `updater-loader.ts`：用变量 specifier 懒加载 `electron-updater`（避免 `npm install` 前类型检查失败，同时让主进程在缺依赖时优雅报错）；
  - `index.ts`：主进程单例 + 向所有窗口广播 `update:event`。
- **依赖**：新增运行时依赖 `electron-updater@6.8.9`（精确版本）。
- **IPC / preload**：`update:getStatus` / `update:check` / `update:download` / `update:install` 与事件 `update:event`；`window.handheld.update`。
- **界面**：关于与诊断新增"软件更新 › 检查更新"行；新组件 `ui/UpdateDialog.tsx` 覆盖检查中 / 已是最新 / 有新版本（可滚动 release note）/ 下载中 / 已下载 / 失败 / 仅安装版可用各状态；中英文案。
- **测试**：`update-service.test.ts`、`update-notes.test.ts`，`ipc-contract.test.ts` 覆盖新通道。

### 自动更新：未完成 / 需要用户验证

- `npm install` 安装 `electron-updater` 后运行 `npm run dist:publish`（带 `GH_TOKEN`）：确认生成 `latest.yml`、Release 带齐 3 个资产、已安装的旧版本能检测到并更新。
- `updateInfo.releaseNotes` 是否随 `latest.yml` 下发尚未实测；代码已加 GitHub API 兜底，但需在真实 Release 上确认弹窗能显示正文。
- 未实现进度条的取消下载（关闭弹窗不影响后台下载）。


