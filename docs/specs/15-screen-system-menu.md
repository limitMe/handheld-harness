# 15 · 界面：系统菜单

> 阶段 B · 方向性 spec。

## 目标

按 Start 键打开系统设置界面。布局是左右两栏：左边是分类，右边是这个分类下的具体设置。

## 依赖

- 11、12。键位分类依赖 10，语音分类依赖 16。

## 设计方向

### 布局与导航

- 状态栏下方是两栏布局。
- 左栏是分类列表，上下键选择，按 → 或 A 进入右栏。
- 右栏是设置项，按 B 或 ← 回到左栏。
- 在左栏按 B 或再按一次 Start，退出系统菜单。
- 所有修改**即时生效、自动保存**，不需要"保存"按钮。不可逆的操作需要二次确认。

### 组件

- 分类列表和页签基于 Base UI 的 Tabs（左栏纵向）。
- 设置项用 Switch、Slider、Select、NumberField、Field 等组件，都通过 `ui/` 包装，并适配焦点树和手柄（10、11）。

### 分类（产品文档列出了前三个，后两个是建议）

1. **键位绑定**
   - 分手柄和键盘两个页签。
   - 按上下文分组列出全部动作和对应按键，例如"全局""当前工作 · 输入框""任务地图"等。
   - 选中某个动作按 A，进入"请按下新的按键"捕获状态（用 10 的捕获能力）。等待期间，按住 Start 2 秒可以取消。
   - 新绑定与已有绑定冲突时，提示用户：是交换、覆盖，还是取消。
   - 支持"恢复默认"，可以只恢复某一个上下文，也可以全部恢复。
   - 键位改完后，操作提示（12）立即更新。
2. **模型管理**（P-01）
   - 列出 `engine.listModels()` 返回的服务商和模型。
   - 设置默认模型，保存在应用设置里（`settings.model.default`）。新建任务时，用 `createSession({ model })` 把它带上；已有任务保持它自己的模型。
   - 不做"按任务切换模型"和快捷切换（P-01）。接口层面仍按会话设置（02 的 `setSessionModel`），为以后留余地。
   - 以后有多个底座时，这里还要增加"底座选择"（02 第 9 节）。v1 不做。
   - 是否在应用里配置服务商凭据（P-20）？阶段 A 依赖 `opencode auth login`。如果要在应用里配置，需要接 OpenCode 的认证 API，并通过主进程写入凭据。
3. **语音输入管理**（P-06）
   - 服务商还没有选定（P-06：MVP 之后再选），所以**先做成预留的页面**：显示当前状态（"使用系统语音输入 Win+H"），以及麦克风设备选择和电平测试（复用 01 的麦克风调试页逻辑）。
   - 服务商选定后再加：选择服务商、填写凭据（保存在主进程，用 `safeStorage` 加密）、选择语言、长按时长等参数。
4. **显示与提示**（建议）：
   - 字号缩放（03 的 zoom）、减少动效、省电模式（18）；
   - 操作提示：开关，以及等待时间（默认 2 秒），对应 `settings.hints = { enabled, delayMs }`（P-09，见 12）。
5. **关于 / 诊断**（建议）：
   - 应用版本、OpenCode 版本、引擎状态、工作区；
   - "打开日志目录"；
   - 01 / 02 的调试页入口，这样不用键盘也能打开调试页。

## 验收方向

- 只用手柄完成：把"发送"从 A 改成 X → 回到当前工作验证生效 → 操作提示同步变化 → 恢复默认。
- 设置在重启后保持。设置文件损坏时的回退行为沿用 01。

## 待定输入

P-20：是否在应用里配置模型服务商凭据。分类 4（显示与提示）和 5（关于 / 诊断）是建议，是否需要由用户确认。P-01、P-09、P-10 已决定。

## 实现记录

实现日期：2026-10-07（在 `main` 上直接开发，尚未提交）。按用户要求，本 spec 直接在仓库里开发，暂不经 dogfooding。

### 用户确认

- **分类 4（显示与提示）、5（关于 / 诊断）都实现**（spec 里标注为建议）。
- **P-20：不在应用里配置模型凭据**，沿用阶段 A 的 `opencode auth login`；模型页只负责列出模型、设置默认模型。

### 交付物

- **设置**（`shared/ipc.ts`、`main/settings-store.ts`）：
  - 新增 `settings.model.default`（`ModelRef | null`），新建任务时带上；已有任务保持自己的模型（P-01）。
  - `settings.input` 的 patch 增加 `resetContexts` / `resetKeyboard`：`null` 语义是“解绑”，无法表达“恢复默认”，所以用新的显式重置字段删除整段用户覆盖。
  - 新增 `app:openLogDir`：主进程用 `shell.openPath(<profile>/logs)` 打开日志目录。
- **纯逻辑**（`src/shared/bindings.ts`）：上下文显示名与排序、按设备列出各上下文的动作 → 按键、冲突检测、改键行（`rebindRows`，含 swap / overwrite）、按键格式化。全部可单测。
- **默认键位**（`src/shared/input.ts`）：新增 `systemMenu`（D-pad 导航、A 选择、B 返回、Start 关闭）与 `systemMenu.picker`（上下 / A / B），键盘对应方向键 / Enter / Escape。
- **共享组件包装**（`src/renderer/src/ui/`）：`Switch`、`Slider`（纯展示，激活由焦点树负责）、`ChoiceDialog`（模态多选项，用于改键冲突：交换 / 覆盖 / 取消）。
- **系统菜单**（`src/renderer/src/system/`）：
  - `SystemMenu.tsx`：状态栏下方左右两栏，`FocusContainer scope` 限制导航范围；左栏分类（上下选择，A / → 进入右栏，左栏 B 关闭），右栏随聚焦的分类切换。面板行统一用 `MenuRow`（div + `role="button"`，避免 Enter 同时触发原生 click 和焦点树激活）。
  - 分类 1 键位绑定（`KeyBindingsPage.tsx`）：手柄 / 键盘两个页签；按上下文分组列出动作与按键；A 进入“请按新键”捕获（手柄按住 Start 2 秒取消、键盘 Escape 取消）；新键冲突时弹 `ChoiceDialog` 询问交换 / 覆盖 / 取消；每个上下文有独立“Reset”，底部有“Restore all bindings”。写入 `settings.input` 后 `InputProvider` 立即重建 ActionMap，操作提示同步更新。
  - 分类 2 模型管理（`ModelsPage.tsx`）：`engine.listModels()` 按“服务商 → 模型”两级列出（默认只显示服务商，A 展开），A 设为默认（或选“Engine default”清空），写入 `settings.model.default`。
  - 分类 3 语音（`VoicePage.tsx`）：P-06 未选服务商，先做预留页——显示“使用系统语音输入 Win+H”、麦克风设备切换（复用 01 的 `enumerateDevices` / 电平逻辑）与电平条。
  - 分类 4 显示与提示（`DisplayPage.tsx`）：字号缩放（03 的 zoom，走 `window.setZoom`）、操作提示开关与等待时间（P-09，默认 2 秒，写 `settings.hints`）。
  - 分类 5 关于 / 诊断（`AboutPage.tsx`）：应用版本 / profile / 平台、引擎状态与版本、工作区；“打开日志目录”；手柄 / 麦克风 / 引擎调试页入口（打开调试页时关闭菜单）。
- **接线**（`App.tsx`）：Start（`menu.toggle`）与 Back（`map.toggle`）互斥打开；标题显示“System menu”；菜单打开时当前工作缩小淡出。
- **store**：记住 `settings.model.default`，`sendCurrent()` 新建会话时作为 `createSession({ model })` 传入。

### 与 spec 的出入 / 决策

- **未使用 Base UI 的 Tabs / Switch / Slider / Select**：焦点树自己接管方向键与 A / B，Base UI 组件的内部键盘交互会和焦点树重复触发（12 / 11 已记录过同类取舍）。两栏布局与设置行改用焦点树容器 + 纯展示包装实现，符合 11 的“样式统一走焦点树”原则。
- **恢复默认用新的重置字段**：见上，`null` 表示解绑而非回退默认，无法用来“恢复默认”。
- **冲突三选项目前只有交换 / 覆盖 / 取消**：与 spec 一致；默认焦点在“交换”。
- **分类 4 的“减少动效 / 省电模式”未做**：语义由 18 定义，本次只在页面上留说明文字，等 18 落地再补。
- **语音页不持久化设备选择**：spec 未定义相应设置字段，P-06 也未选服务商，先只做探测。
- **长按 Start 取消**：用 `captureNextControl()` 捕获到 Start 后，改为监听 Start 松开来判定；不足 2 秒则继续捕获，满 2 秒取消。捕获期间第一个按键被输入系统消费，不会误触菜单。
- **模型页按“服务商 → 模型”两级展示**：真实 OpenCode 的 `/provider` 一次返回 227 个服务商、8401 个模型（约 6.6 MB）。原先把每个模型都渲染成一行（每行一个焦点节点），注册时焦点树按订阅者逐个广播，复杂度 O(N²)（约 3500 万次状态更新），直接把渲染进程撑爆——表现为打开模型页后卡死、随后黑屏（`render-process-gone`）。现在默认只渲染服务商行，A 展开某个服务商才渲染它的模型，任一时刻最多约 600 行。spec 说“列出服务商和模型”，两级列表仍满足。
- 顺带修了一个健壮性问题：`InputProvider` 在无 `navigator.getGamepads`（如单测环境）时返回空列表。

### 排查黑屏新增的诊断（2026-10-07）

黑屏当时 `main.log` 里没有任何记录，无法定位。补上：

- `src/main/window.ts`：记录 `did-fail-load`、`render-process-gone`、`unresponsive` / `responsive`，并把渲染进程 `console-message` 的 warning / error 转写进 `main.log`。
- `src/renderer/src/main.tsx`：把 `window.onerror` / `unhandledrejection` 通过 `window.handheld.log.write` 写入主进程日志；并用 `ErrorBoundary` 包住应用，渲染崩溃时显示错误信息而不是黑屏。
- 靠这些诊断拿到了 `renderer process gone { reason: 'crashed', exitCode: -36861 }`，从而定位到模型页。

### 已自动验证

- `npm run check` 通过（39 个测试文件 230 个用例，lint 零 warning）。
- 新增单测：`bindings`（上下文顺序与标签、按键反查、冲突检测、改键行 swap / overwrite、格式化）；`settings` 增加 `model.default` 与 `input` 重置用例；`system-menu`（首分类聚焦、键盘上下移动、A 进入面板、面板 B 返回分类、分类 B 关闭、大目录默认折叠、展开某服务商后才渲染其模型）。
- `npm run test:e2e` 19 个用例通过，新增 `gamepad.spec.ts` 用例用手柄完整走一遍：Start 打开菜单 → A 进面板 → 向下找到“Send” → A 捕获 → 按 X 改成 X → 校验 `settings.input` 写入 → 逐级重置回默认。

### 未完成 / 需要人工验证

- **掌机实测**：两栏布局在 1080p 7 英寸上的观感、按键捕获的手感、按住 Start 2 秒取消的反馈、改键冲突对话框。
- **模型管理**要连真实 OpenCode（需 `opencode auth login`）才能验证 `listModels()` 与默认模型在新会话里生效。
- **语音页**仍是预留：服务商、凭据、语言、长按时长等参数等 P-06 决定后补。
- 分类 4 的“减少动效 / 省电模式”、分类 5 的更多诊断信息等 18 / 19 落地后再扩展。
- 键位页对“同一动作存在多个按键”的场景按单键处理，未做多绑定编辑。

### 交互优化（2026-10-07）

- **锁定系统快捷键**：`global` 的 `menu.toggle`（Start）与 `map.toggle`（Back）在键位页显示为 `Locked`，不可捕获修改；`resolveActionMap` 与设置存储在合并 / 读取时用 `sanitizeUserBindings` 丢弃这些键位的用户覆盖，避免用户把自己锁在系统菜单外（本次也修复了用户已损坏的 `settings.input`）。
- **捕获提示常驻顶部**：改键时的提示条改为 `sticky top-0`，编辑列表底部的键时不再滚出屏幕。
- **隐藏方向绑定**：`nav.up/down/left/right`（含摇杆方向绑定）不再出现在键位页（`HIDDEN_BINDING_ACTIONS`），它们由焦点环隐含表达、不值得改键。
- **取值类设置用可拖动条**：`ui/Slider` 增加指针 / 触摸拖动，`DisplayPage` 的 Text size、Stick scroll speed、Wait before showing 三行在标签下方放一条可拖动条，同时还可用左右键微调（需先按 A 激活）。
- **取值行按 A 进入调节**：取值行是 `activatable`，聚焦本身不进入调节，避免从一级分类用摇杆向右进入面板时立刻改动值；按 A 激活后用左右键微调，或用指针 / 触摸拖动条。`MenuRow` 的 `autoActivate` 已移除。
- **模型页显示当前选择**：页面顶部新增 `Current: <模型名 / Engine default (automatic)>`，目录加载完成后把焦点移到已保存的模型行，避免焦点停在 “Engine default” 造成“没生效”的误解。
- **键位格式化**：模拟量的方向绑定显示为 `LStickX →` / `LStickX ←`；由于方向绑定已隐藏，这条只影响其它模拟量绑定。

### 主题选择（2026-10-07，由 spec 18 追加）

- 「Display & hints」分类新增 **Theme** 行（跟随系统 / 深色 / 浅色），写 `settings.ui.theme`，由 spec 18 的 `useThemeSync` 应用到 `<html data-theme>`；按 A 弹出 `ChoiceDialog` 列表选择（不是取值行的左右微调，因为它是枚举而非连续值）。
- 同时修了右栏的观感：`MenuRow` 去掉常驻边框（相邻行边框会重叠成一条粗线），右栏滚动区加水平内边距，避免 `data-focused` 的焦点环在左侧被滚动容器裁掉。
- 「减少动效 / 省电模式」仍未做，见 spec 18 实现记录。

### 键位页只保留整体重置（2026-10-07）

- 键位分类太重、每个上下文都有一行 `Reset <上下文>`，删掉这些逐上下文重置，只保留底部的 **Restore default bindings**（一次清空手柄与键盘的全部用户覆盖，仍走 `ConfirmDialog`）。`settings.input` 的 `resetContexts` / `resetKeyboard` 字段保留（整体重置仍在用）。

### 模型页同时维护最近模型（2026-10-07，由 spec 14 追加）

- 模型页选择某个模型时，除了写 `settings.model.default`，还把 `touchRecentModel(settings.model.recent, ref, name)` 一起写回，供任务地图的模型环使用（spec 14「最近使用的模型列表」）。选 **Engine default** 只清空默认，不动最近列表。
- 模型名在写入最近列表时缓存（`name` 字段），模型环据此显示，避免为取名再拉一次 `/provider`（真实 OpenCode 有 8401 个模型）。

### 状态栏「任务」按钮在菜单里可跳转（2026-10-08，试用反馈）

- **问题**：系统菜单打开时，状态栏左上角的「任务」按钮仍可见，但点击没反应。原因是 `onOpenTasks` 只 `setMapOpen(true)`，而 `menuOpen` 仍为真，两个浮层同时存在、菜单盖在任务地图之上，标题也仍按 `menuOpen` 显示「System menu」，看起来什么都没发生。
- **处理**：`App.tsx` 的「任务」按钮回调改为打开任务地图前先关闭系统菜单 / 信息页（`setMenuOpen(false)`、`setInfoOpen(false)`、`setMapOpen(true)`），与 `map.toggle` 已有的互斥逻辑一致。保留按钮（不隐藏），菜单里也能一键去任务地图。


