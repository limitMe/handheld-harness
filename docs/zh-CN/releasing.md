> Archived Chinese original · English: [docs/releasing.md](../releasing.md)

# 发版与自动更新（spec 19）

把 Handheld Harness 打包成 NSIS 安装包，并通过 GitHub Releases 分发更新。应用内「设置 → 关于与诊断 → 软件更新 → 检查更新」手动检查，确认后下载，下载完成弹「立即重启 / 稍后」。

仓库：`https://github.com/limitMe/handheld-harness`（公开）。运行时匿名读取 Releases，**应用内不携带任何 token**；token 只在发版时用于上传。

## 前置条件

- 构建机已 `npm install`（会带出 `electron-builder`、`electron-updater` 和 OpenCode 平台二进制）。
- 发版时提供 `GH_TOKEN`：
  - classic PAT，勾选 `repo`；或
  - fine-grained token，仅本仓库，权限 `Contents: Read and write`。
- 关闭正在运行的开发版实例：运行中 `node_modules` 与 Electron 二进制被锁定，`npm install` 会报 EBUSY / EPERM。

## 发版步骤

```powershell
# 1) 递增版本：package.json 的 "version" 和 package-lock.json 里的两处
#    （顶层 "version" 与 packages."".version）。例如 0.1.0 -> 0.2.0。
#    版本号决定用户是否收到更新，必须是严格变大的 semver

# 2) 确保开发版已关闭，然后安装依赖（首次或 lock 变化时）
npm install

# 3) 自检必须通过
npm run check

# 4) 先提交并推送版本号，再发布。
#    GitHub 会用默认分支 HEAD 创建 v<version> tag，bump 未提交/未推送的话，
#    tag 会指向没有这次 bump 的旧提交
git add package.json package-lock.json
git commit -m "chore: release <version>"
git push origin main

# 5) 构建 + 打包 + 发布到 GitHub Releases
$env:GH_TOKEN = "<你的 token>"
npm run dist:publish

# 6) 核对 Release 是否带齐三个资产（见「产物」）
npm run release:verify
```

`dist:publish` 等价于：

```
npm run build && electron-builder --win --x64 --publish always
```

## 产物

electron-builder 会在 `dist/` 生成并在 GitHub 上创建 release，`npm run release:verify` 用来核对已发布 Release 的资产。每个 Release 必须带齐：

| 资产 | 作用 |
|---|---|
| `handheld-harness-<version>-setup.exe` | NSIS 安装包（x64） |
| `handheld-harness-<version>-setup.exe.blockmap` | 差量更新用 |
| `latest.yml` | **更新清单**，electron-updater 靠它判断新版本 |

安装包内嵌 `app-update.yml`（记录 `provider/owner/repo`），安装版据此查更新。

## 补救失败或半成品的 Release

如果同名 tag 的 Release 已存在，发布可能报 `422 ... "Published releases must have a valid tag"` 并中断；中断点通常早于 `latest.yml` 的生成与上传，于是留下一个"看起来成功、但自动更新永远看不到"的 Release。修复方式是复用已有 Release 重跑，而不是再次创建：

```powershell
$env:GH_TOKEN = "<你的 token>"
$env:EP_GH_IGNORE_TIME = "true"   # 复用已存在的 Release（绕过 2 小时窗口）
npm run dist:publish
```

重跑会覆盖 exe，并依据上传的 exe 重新生成 `latest.yml`，所以不要手动编辑/上传 `latest.yml`。若仍然失败，在 GitHub 上删掉该 Release（保留 `v<version>` tag）再 `npm run dist:publish`；tag 已存在时创建不会再冲突。

最后用 `npm run release:verify` 核对。

## 发布规则（自动更新依赖）

- tag 用 `v<version>`（electron-builder 默认）。
- **不能是 draft**，正式版**不能勾 prerelease**，否则 electron-updater 会忽略。已在 `electron-builder.yml` 用 `releaseType: release` 强制。
- 版本必须严格大于已安装版本；electron-updater **不会降级**。要"回退"只能发一个版本号更大的包，或让用户手动装旧安装包。
- release note 写进 GitHub Release 正文；应用优先用 update 元数据，缺失时按 tag 调 GitHub API 取正文。

## 应用内的更新流程

1. 用户打开「关于与诊断 → 软件更新 → 检查更新」。
2. 有新版本 → 弹窗显示 release note，按钮「更新 / 取消」。
3. 点「更新」→ 后台下载，显示百分比。
4. 下载完成 → 弹「立即重启 / 稍后」；「立即重启」走 `quitAndInstall`，退出时会按 P-11 结束正在运行的任务。
5. 「稍后」只关闭弹窗，更新文件已缓存，下次检查可继续。

仅在 **NSIS 安装版**可用；`npm run dev` 和 `stable:start`（preview）会提示"仅安装版可用"。

## 测试一次更新

1. 装一个旧版本（例如把 `version` 设为 `0.1.0` 发一版并安装）。
2. 把 `version` 改成 `0.2.0`，`npm run dist:publish`。
3. 在已安装的 `0.1.0` 里点「检查更新」，确认弹出 `0.2.0` 的 release note，更新后版本变为 `0.2.0`。

## 手动发布（备选）

不带 `--publish` 的 `npm run dist` 只产出文件、不建 Release。若想手动上传：

1. `npm run dist`。
2. 在 GitHub 建一个 `v<version>` 的 Release（非 draft、非 prerelease）。
3. 上传上表的 3 个资产。
4. 漏传 `latest.yml` 会导致更新查不到。

## 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 应用里提示"仅安装版可用" | 当前是 dev / preview，不是安装版 |
| 查不到新版本 | Release 是 draft / prerelease；或没传 `latest.yml`；或版本号没有变大 |
| 首次安装被 SmartScreen 拦 | 未做代码签名，个人使用可接受；点"仍要运行"。签名的证书不是自动更新的前提 |
| `npm install` 报 EBUSY / EPERM | 开发版在运行，先关掉 |
| 报 `422 ... "Published releases must have a valid tag"` | 该版本的 Release 已存在；用 `EP_GH_IGNORE_TIME=true` 重跑，或删掉 Release（保留 tag）再重试 |
| Release 建好了但应用查不到更新 | 发布在传 `latest.yml` 之前中断了；用 `EP_GH_IGNORE_TIME=true` 重跑，再用 `npm run release:verify` 核对 |
| 发布报 401 / 403 | `GH_TOKEN` 缺失或权限不足（需要 `repo` 或 `Contents: write`） |
| release note 为空 | Release 正文为空；应用会显示"该版本没有提供更新说明" |
