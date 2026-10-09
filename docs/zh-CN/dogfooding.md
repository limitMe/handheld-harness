> Archived Chinese original · English: [docs/dogfooding.md](../dogfooding.md)

# 日常自举工作流（spec 04）

"用 Handheld Harness 开发 Handheld Harness"：用户在稳定版里向 Agent 提需求，Agent 修改主仓库，用户在开发版里立刻看到效果，满意后提交，定期升级稳定版。

## 拓扑

```
C:\Apps\handheld-harness-stable   稳定版（stable 分支 worktree，已构建，全屏）
   └─ profile=stable，workspace=C:\Apps\handheld-harness   ←── 用户在这里和 Agent 对话
            │
            ▼
   OpenCode server（detached，按"工作区 + 版本"共享）
            ▲
   └─ profile=dev，npm run dev，窗口化                    ←── 用户在这里看修改效果（HMR）
C:\Apps\handheld-harness          主仓库（main / 功能分支）
```

- 稳定版跑上一个确认可用的构建产物，Agent 改代码不会影响它。
- 开发版跑正在修改的代码；两个实例指向同一工作区、同一 OpenCode 版本时会复用同一个 server，因此看到同样的会话。
- **简化模式**：只开开发版，直接在开发版里对话。只改渲染进程的小修改可以这样；改坏时用 [`recovery.md`](recovery.md)。

## 步骤

1. 打开稳定版（桌面 / 开始菜单快捷方式）和开发版（终端里 `npm run dev`）。
2. 在**稳定版**里新建任务，例如："实现 `docs/specs/13-screen-current-work.md` 里的『输入框：收起与展开』"。
3. Agent 若提出待定问题（`P-xx`），用户回答。
4. Agent 修改代码并运行 `npm run check`，然后说明改了什么、应该去哪里看、走 HMR 还是重启。用户切到开发版窗口（`Alt+Tab` 或厂商的任务切换键）验证。
5. 不满意就在同一个任务里继续反馈；满意就说"**提交**"。
6. 积累一批可用的修改后，运行 `npm run stable:update`，然后重启稳定版。之后就可以用新功能（比如手柄操作）继续开发。

## 约定

- 一个任务只做一件事；小步、可验证。
- 用户说"提交"时，Agent 按仓库约定的格式提交，一个功能一个提交；没有明确指令不得 `commit` / `push` / `reset --hard` / 删分支。
- 依赖变更：开发版运行时 Electron 和 `node_modules` 被锁定，`npm install` 会失败。Agent 必须先把包名和原因告诉用户，由用户关闭开发版后再装。
- 升级稳定版前，Agent 需要保证主仓库工作区干净且 `npm run check` 通过；`stable:update` 会自己再跑一次 check。

## 相关命令

| 命令 | 作用 |
|---|---|
| `npm run stable:setup` | 首次创建 stable 分支 / worktree，`npm ci` 并构建 |
| `npm run stable:start` | 以 `profile=stable`、共享 server、全屏启动稳定版 |
| `npm run stable:shortcut` | 在桌面和开始菜单创建 "Handheld Harness (stable)" 快捷方式 |
| `npm run stable:update` | 把 stable fast-forward 到 main、打标签、必要时 `npm ci`、重新构建 |
| `npm run stable:rollback` | 回退到上一个 `stable-*` 标签并重新构建 |
