# 00 · Windows 11 开发环境部署

## 目标

让 Windows 11 掌机具备以下能力：

1. 能克隆、安装、运行和测试 HANDHELD.AI 仓库；
2. 能运行一个 AI 编码 Agent，用来执行后续 specs；
3. OpenCode 能调用至少一个 LLM 服务商；
4. 麦克风、手柄和系统语音输入（Win+H）都已确认可用。

完成后，在"环境记录"一节填好设备信息，供后续 Agent 参考。

## 范围

- **包含**：系统设置、开发工具安装、Git 和凭据配置、AI Agent 安装、设备能力确认。
- **不包含**：创建工程（spec 01）；原生编译工具链，只有 spec 16 / 19 需要时才装。

## 依赖

- 一台 Windows 11 掌机：23H2 或更新，内存 ≥ 16 GB，可用磁盘 ≥ 30 GB。
- 自举阶段**强烈建议**接上蓝牙或 USB 键鼠（可以接扩展坞），否则会大量依赖触屏键盘。
- 一个 LLM 服务商的 API key（如 Anthropic）。
- 一个 GitHub 账号（可选，用来托管仓库）。

## 步骤

以下命令都在 **PowerShell 7** 中执行。标注了"管理员"的步骤需要以管理员身份运行终端。第 2 步装好 PowerShell 7 之前，可以先用系统自带的 Windows PowerShell 5.1 运行 winget。

### 1. 系统设置

| # | 操作 | 位置 / 命令 |
|---|---|---|
| 1.1 | 打完系统更新 | 设置 › Windows 更新 |
| 1.2 | 开启开发人员模式（会允许创建符号链接） | 设置 › 系统 › 开发者选项 › 开发人员模式 |
| 1.3 | 开启长路径（管理员） | `New-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force` |
| 1.4 | 接通电源时不休眠，电源模式设为"最佳性能" | 设置 › 系统 › 电源和电池 |
| 1.5 | 记录屏幕分辨率和缩放比例 | 设置 › 系统 › 屏幕 |

### 2. 安装工具（winget）

```powershell
winget --version   # 没有的话，先从 Microsoft Store 安装 "App Installer"
winget install --id Microsoft.PowerShell -e
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e        # 需要 Node 24.x LTS
winget install --id GitHub.cli -e
winget install --id Microsoft.VisualStudioCode -e   # 可选，用来查看代码
```

装完后**关掉所有终端重新打开**，以刷新 PATH。

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned   # 允许运行 npm.ps1 等脚本
```

### 3. Git 配置

```powershell
git config --global user.name  "<你的名字>"
git config --global user.email "<你的邮箱>"
git config --global init.defaultBranch main
git config --global core.autocrlf false      # 仓库统一用 LF，由 .gitattributes 控制
git config --global core.longpaths true
gh auth login                                 # 可选
```

### 4. 工作目录

```powershell
New-Item -ItemType Directory -Force C:\dev
```

- 仓库放在 `C:\dev\handheld-ai`，路径短，能避开很多 Windows 工具链的问题。**不要**放进 OneDrive 同步目录。
- 可选（管理员）：把 `C:\dev` 加进 Defender 排除项，`npm install` 和构建会明显变快：`Add-MpPreference -ExclusionPath C:\dev`。代价是这个目录不再被实时扫描，请自行权衡。

### 5. OpenCode CLI 与 LLM 凭据

全局装一份 OpenCode CLI。它有三个用途：配置凭据、让 OpenCode 充当实现 Agent，以及在 spec 04 中作为应用崩溃时的 TUI 兜底。

```powershell
npm install -g opencode-ai@1.18.34     # 版本要和工程里锁定的一致，见 spec 02
opencode --version
opencode auth login                     # 选择服务商并填入 API key
opencode models                         # 能列出模型就说明凭据可用
```

在任意空目录里冒烟测试：

```powershell
mkdir C:\dev\oc-smoke; cd C:\dev\oc-smoke
opencode run "Reply with exactly: OK"
```

> 如果锁定版本中 `opencode run` 或 `opencode auth login` 的子命令名称变了，以 `opencode --help` 为准，并更新本 spec。

### 6. 实现用的 AI 编码 Agent（二选一或都装）

- **Claude Code**：按官方文档的 Windows 安装方式安装（原生安装器或 npm 均可，以 <https://code.claude.com/docs> 为准）。它依赖 Git for Windows，第 2 步已经装好。
- **OpenCode**：第 5 步已经装好，在仓库目录里运行 `opencode` 即可。

两者都会读仓库根目录的 `AGENTS.md`（Claude Code 读 `CLAUDE.md`，spec 01 会让它引用 `AGENTS.md`）。

### 7. 麦克风与系统语音输入

1. 设置 › 隐私和安全性 › 麦克风：打开"麦克风访问权限"，以及"**允许桌面应用访问你的麦克风**"。
2. 设置 › 时间和语言 › 语言和区域：添加"中文（简体）"，并在语言选项中勾选语音识别相关功能。
3. 打开记事本按 **Win+H**，分别说一句中文和一句英文，确认能识别。在掌机上，这是自举阶段的**语音输入方案**。

### 8. 手柄

1. 在厂商软件中把控制器切换到**手柄（XInput）模式**，不要用桌面 / 鼠标模式。例如 ROG Ally 的 Armoury Crate SE、Legion Go 的 Legion Space、MSI Claw 的 MSI Center M。
2. `Win+R` 运行 `joy.cpl`，确认能看到控制器，按键有反应。
3. 用 Edge 打开任意 Gamepad API 测试页（例如搜索 "gamepad tester"），确认浏览器能读到按键，并记下手柄的 `id` 字符串。
4. 记录 Steam 是否在后台运行，以及是否开启了"Xbox 控制器的 Steam 输入"。spec 01 的手柄调试页会分别测试开启和关闭两种情况。
5. 记录 Guide / 厂商快捷键是否被系统或厂商软件占用。

### 9. 可选：从 Mac 远程操作

```powershell
# 管理员
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd; Set-Service -Name sshd -StartupType Automatic
```

注意：通过 SSH 启动的 GUI 程序**不会显示在掌机桌面上**（属于不同的会话）。SSH 只适合跑安装、测试和构建；`npm run dev` 必须在掌机本地的终端里启动。

### 10. 暂时不装

- Visual Studio 2022 Build Tools（C++ 工作负载）：只有在需要编译原生模块时才装（spec 16 本地语音、spec 19 原生辅助进程）。阶段 A 的工程**不得**引入需要本地编译的依赖。

## 验收标准

在新打开的 PowerShell 7 中运行下面的检查脚本，每一项都必须是 `OK`：

```powershell
$checks = [ordered]@{
  'PowerShell 7'     = { $PSVersionTable.PSVersion.Major -ge 7 }
  'Node 24.x'        = { (node -v) -match '^v24\.' }
  'npm'              = { [bool](npm -v) }
  'git'              = { [bool](git --version) }
  'autocrlf=false'   = { (git config --global core.autocrlf) -eq 'false' }
  'longpaths'        = { (Get-ItemPropertyValue HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem LongPathsEnabled) -eq 1 }
  'opencode 1.18.34' = { (opencode --version) -match '1\.18\.34' }
  'C:\dev exists'    = { Test-Path C:\dev }
  'ExecutionPolicy'  = { (Get-ExecutionPolicy -Scope CurrentUser) -in 'RemoteSigned','Unrestricted','Bypass' }
}
foreach ($k in $checks.Keys) {
  try { $ok = & $checks[$k] } catch { $ok = $false }
  '{0,-18} {1}' -f $k, ($(if ($ok) { 'OK' } else { 'FAIL' }))
}
```

另外需要手动确认：

- [ ] `opencode run "Reply with exactly: OK"` 返回了 OK。
- [ ] 在记事本里用 Win+H 能输入中文和英文。
- [ ] `joy.cpl` 和浏览器测试页都能读到手柄按键。
- [ ] 下面的"环境记录"已填写。

## 环境记录（由用户填写，后续 spec 会引用）

| 项 | 值 |
|---|---|
| 设备型号 | ASUS ROG Xbox Ally X（RC73XA） |
| Windows 版本（`winver`） | Windows 11 专业版 26H2，build 26300.9457 |
| 屏幕分辨率 / 缩放比例 | 1920×1080，系统 DPI 96（100%）；GPU 报告 3840×2160 |
| 内存 | 13.6 GB 可用（4×6 GB @ 8000 MT/s）——**低于 spec 建议的 ≥16 GB** |
| 手柄 `id` 字符串（Gamepad API） | （待用户用浏览器测试页确认） |
| 厂商控制软件 / 手柄模式名称 | （待用户确认，预期 Armoury Crate SE + 手柄模式） |
| Steam 是否常驻 / 是否开启 Steam 输入 | （待用户确认） |
| Guide 等键是否被占用 | （待用户确认） |
| Node / npm / opencode 版本 | v24.11.1 / 11.6.2 / 1.18.34 |
| LLM 服务商 / 默认模型 | **未配置**（`opencode auth list` 为 0 credentials，需用户执行 `opencode auth login`） |
| 实现 Agent（Claude Code / OpenCode） | OpenCode 1.18.34（用户选择不安装 Claude Code） |

## 给实现 Agent 的注意事项

- 本 spec 主要由用户手动执行，Agent 可以协助生成命令、排查问题。
- 不要替用户输入或保存 API key。凭据只能通过 `opencode auth login` 交互式录入。
