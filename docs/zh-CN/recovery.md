> Archived Chinese original · English: [docs/recovery.md](../recovery.md)

# 故障恢复手册（spec 04）

自举开发时有两类实例：**稳定版**（`handheld-harness-stable`，全屏，用上一个确认可用的构建）和**开发版**（主仓库，`npm run dev`，正在修改的代码）。稳定版是"救生艇"：只要它还能用，就总能通过它指挥 Agent 修复开发版。

本手册只列出人工（或用户指挥 Agent）执行的恢复动作。**Agent 不得自行结束 opencode / electron / node 进程，也不得运行 `server:stop`、`taskkill`、`Stop-Process`**（见 `AGENTS.md` 的自举开发规则）。

| 症状 | 恢复方式 |
|---|---|
| 开发版白屏，或出现编译错误浮层 | 在**稳定版**里把错误现象告诉 Agent，Agent 运行 `npm run typecheck` 定位并修复 |
| 开发版主进程反复崩溃重启 | 同上。必要时在开发版终端里按 `Ctrl+C` 停掉它，修好之后再 `npm run dev` |
| 稳定版也出了问题 | 运行 `npm run stable:rollback`，或双击上一个可用的快捷方式 |
| 两个实例都不能用 | 在 Windows Terminal 中进入主仓库，运行 `opencode`（TUI）。若锁定版本支持连接已有 server（例如 `opencode attach <url>`，以 `opencode --help` 为准），可以直接接管原来的会话 |
| 代码被改乱，想放弃这次修改 | **用户手动**执行 `git stash` 或 `git checkout -- .`。Agent 不得自行执行 |
| server 卡死 | 用户运行 `npm run server:status` 查看，然后 `npm run server:stop -- <workspace>`，再重启实例 |

## 常用命令

```powershell
# 查看所有登记的 OpenCode server（pid、地址、版本、工作区、是否健康）
npm run server:status

# 结束指定工作区的 server 并删除登记文件
npm run server:stop -- C:\Apps\handheld-harness

# 回退稳定版到上一个 stable-* 标签并重新构建
npm run stable:rollback

# 重新构建并升级稳定版（要求主仓库干净且 npm run check 通过）
npm run stable:update
```

## 兜底：TUI

两个实例都打不开时，OpenCode 的 TUI 仍然可用：

```powershell
cd C:\Apps\handheld-harness
opencode
```

TUI 直接使用主仓库的工作区。如果 `opencode` 支持 `attach`，还能接管应用正在使用的同一个会话；否则从 TUI 里重新描述需求即可，代码改动落在同一个仓库，开发版恢复后能看到。
