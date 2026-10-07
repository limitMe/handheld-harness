# 12 · 共享组件：状态栏、操作提示、列表输入、对话框

> 阶段 B · 方向性 spec。

## 目标

实现产品文档中的共享组件，让所有界面的风格和交互保持一致。

## 依赖

- 10、11。

## 实现基础

- 对话框、Toast、浮层定位都基于 Base UI，通过 `ui/` 包装后使用：
  - 二次确认用 AlertDialog；
  - 轻提示用 Toast；
  - 操作提示和列表输入"贴在组件旁边"，用 Popover / Tooltip 的定位器实现（底层是 Floating UI）。
- 列表输入的条目很多时，可以用 TanStack Virtual 做虚拟化。

## 状态栏

- 01 和 03 已经实现了基础版。本 spec 把它整理成正式组件：所有界面都使用它，只是标题和是否显示标题不同。
  - 文本编辑界面的状态栏**没有标题**。
- 右上角从左到右依次是：听写指示（16 提供状态）、网络、电量、时间。
- 引擎状态点：正常（ready）时隐藏，只在 starting、reconnecting、down 时显示；`STABLE` / `DEV` 标记按 04 的规则，只在 profile 不是 `default` 时显示。这样正式版的状态栏保持干净（建议方案）。
- 标题：
  - 当前工作界面：任务梗概，即 session title；
  - 系统菜单 / 任务地图：界面名称。
- 标题太长时截断，加省略号。

## 操作提示（Action Hints）

- **触发条件**：某个组件处于**聚焦且激活**状态，并且一段时间内没有任何输入。等待时间对所有组件都一样，默认 2 秒；在系统菜单里可以修改等待时间，也可以整体关闭操作提示（P-09）。对应设置项 `settings.hints = { enabled, delayMs }`。
- 在组件旁边浮动显示。
- **内容由动作表动态生成**：根据当前上下文的 ActionMap，反查"动作 → 按键"。用户改键后，提示会自动更新。
  - 以输入框为例：A 发送、B 返回、长按 Y 说话、RB 文本编辑、LB 列表输入。
- **区分长按和短按**：长按的按键图标外加一圈进度环，或者写上"按住"字样。用户按住的过程中，进度环实时填充。
- 有任何输入时立即隐藏，带淡出动画。
- **Agent 请求卡片也使用这套提示**（P-02）：授权请求和提问出现时，卡片自动获得焦点并激活，旁边显示可用的按键（授权：允许一次 / 始终允许 / 拒绝；提问：选择 / 确认 / 忽略）。具体呈现在 13 里实现，提示的内容同样由 ActionMap 动态生成，所以改键后会同步变化。
- 按键图标默认是 Xbox 布局。手柄 `id` 匹配到其他布局时，可以切换图标集（以后再做）。

## 列表输入（List Input）

- **触发方式**：例如输入框激活时按 LB。
- 在组件旁边弹出一个纵向列表，上下键选择，A 确认，B 取消。
- **条目来源**（P-12）：MVP 只支持默认命令，不做用户自定义短语。
  - 命令来自当前任务所属引擎的 `engine.listCommands()`，例如 `/clear`、`/compact` 等。不同底座的命令不同，所以每个引擎各自维护一份命令表（见 02 的 `listCommands` 说明），列表输入始终显示当前任务所属引擎的那一份。
  - 引擎能力 `commands` 为 false 时，列表输入不可用。
- **确认后的行为**：
  - 命令类条目：直接执行，还是先插入到输入框等用户确认？建议先插入，由用户按 A 发送。
  - 像 `/compact` 这样需要走服务端专用接口、不能当普通 prompt 发送的命令，在 `AgentEngine` 中增加 `runCommand`（02 已预告），并同步更新引擎契约测试。发送时，输入以已知命令名开头就调用 `runCommand`，否则当作普通 prompt。
- **排序**：按最近使用排序，最近使用记录按引擎分别保存。条目很多时，按住方向键可以加速滚动。

## 对话框（Dialog）与轻提示（Toast）

- **二次确认对话框**：例如任务地图里关闭任务。
  - 模态，焦点被限制在对话框内；
  - A 确认，B 取消；
  - 危险操作的默认焦点放在"取消"上。
- **Toast**：用于"已发送""已复制""引擎已重连"这类非阻塞提示，从顶部或底部滑入，2–3 秒后自动消失。

## 验收方向

- 操作提示的内容与 ActionMap 一致：改键后提示同步变化（自动化测试）。
- 短按和长按的提示样式有明显区别，用户按住时有进度反馈。
- 只用手柄能完成：从列表输入选择 `/compact` → 插入到输入框 → 发送。

## 待定输入

无新增阻塞项。P-09、P-12 已决定。状态栏的显示策略采用上文的建议方案，如有不同意见在实现时调整。

## 实现记录

实现日期：2026-10-06（分支 `feat/shared-components`，四个提交：状态栏、操作提示、列表输入、对话框与轻提示）。按用户要求，本次不走 dogfooding，直接在仓库里开发。

### 交付物

- **状态栏**（`src/renderer/src/components/StatusBar.tsx`）：标题改为可选（文本编辑界面不传）；右上角顺序为听写指示 ▸ 网络 ▸ 电量 ▸ 时间，引擎状态点移到该组最左侧，且 `ready` / 未知时**不渲染**（`engineDotClass`）；`STABLE` / `DEV` 徽标沿用原逻辑（仅非 `default` profile）；标题 `min-w-0 truncate`。
- **操作提示**（`src/renderer/src/hints/`）：
  - `entries.ts`（纯 TS）：`buildHintEntries(map, contextIds, { editable })` 从 ActionMap 反查“动作 → 手柄控件”，`hintContextIds` 取“最具体上下文 + global”；
  - `ActionHints.tsx`：展示层，短按为普通键帽，长按为带进度环的键帽 + `hold` 字样；
  - `HintsProvider.tsx`：聚焦且激活时开始计时，`settings.hints.delayMs`（默认 2 秒）后浮出；任何输入立即隐藏并重新计时；按住长按键时进度环实时填充（阈值 400 ms，对齐 spec 10）；改键 / 上下文变化 / 设置热更新都会刷新内容；
  - 定位用新增的 `ui/AnchoredPanel.tsx`（Base UI Popover 的 `Positioner`，底层 Floating UI）。
  - `settings.hints = { enabled, delayMs }` 落进 `shared/ipc.ts`、`main/settings-store.ts`，类型与默认值放 `shared/hints.ts`（无 zod，避免进渲染进程产物）。
- **列表输入**（`src/renderer/src/workbench/ListInput.tsx` + `commands.ts` + `listInputStore.ts`）：输入框激活时按 LB 弹出，条目来自 `engine.listCommands()`；上下键移动（可按住加速，复用 nav 的重复），A 确认、B 取消；`commands` 能力为 false 时 Composer 不注册入口、不渲染列表。确认后**先插入** `/name`，由用户按 A 发送；发送时以已知命令开头则走 `runCommand`，否则当普通 prompt。排序按最近使用，记录按引擎分别存在 `localStorage`（键 `handheld.listInput.recent`）。
- **runCommand**：`AgentEngine` 新增 `runCommand(sessionId, command, args?)`；IPC 新增 `engine:runCommand`（contract / schema / preload / main handler）；OpenCode 适配层调用 SDK 的 `client.session.command`，`compact` 失败时回退 `client.session.summarize`；Fake 引擎生成一条“Fake ran /x”回复。引擎契约测试增加 `runCommand` 步骤。
- **对话框与轻提示**：`ConfirmDialog` 的取消 / 确认节点都加了 `onCancel`，于是 B（`nav.deactivate`）无论焦点在哪都取消，A（`nav.activate`）确认；危险操作默认焦点仍是“取消”（取消先注册）。新增 `ui/Toast.tsx`：Base UI Toast + 全局 `toastManager` / `showToast()`，发送成功后弹“Sent”，引擎从 `reconnecting` / `down` 回到 `ready` 时弹“Engine reconnected”；`ToastProvider` 挂在 `main.tsx` 最外层。

### 与 spec 的出入 / 决策

- **提示内容算法**（spec 只给了输入框示例）：取上下文栈**最上面一层**加 `global`，跳过中间的屏幕上下文，这样提示描述的是“组件”而不是整个界面；隐藏 `nav.*` / `scroll`（焦点环已经表达）与 `menu.toggle` / `map.toggle`（常驻全局功能）；`voice.dictate` 只在激活元素是文本输入时显示（对齐 P-05）。用输入框验证正好得到 spec 示例的 A / B / 长按 Y / RB / LB。
- **定位实现**：spec 建议用 Popover / Tooltip 的定位器。提示是非交互浮层，仍复用 Base UI Popover 的 `Positioner`（取它的 Floating UI 定位），但没有触发器、不抢焦点；列表输入同样走 `AnchoredPanel`。
- **未引入 TanStack Virtual**：命令条目很少，spec 里也是“可以”而非“必须”，为避免为可选优化新增依赖而跳过；列表仍带 `data-scroll-region`，可被右摇杆滚动。
- **`/clear` 在 workbench 层处理**：`AgentEngine.runCommand` 是 `void`，无法表达“切换到新会话”，所以 `/clear` 由 store 直接新建会话（`newTask()`），其余已知命令才调 `runCommand`。适配层的 `clear → 新建会话` 语义因此改由上层承担。
- **最近使用记录**：spec 说“按引擎分别保存”。为不改 settings schema（settings 界面属 15），先用 `localStorage` 持久化；后续 15 可以迁到 `settings`。
- **状态栏引擎点**：采用 spec 建议（ready 隐藏）。
- **Toast 用法**：spec 举了“已发送 / 已复制 / 引擎已重连”为例，本次接了“已发送”和“引擎已重连”；“已复制”等以后有复制入口时再接。

### 已自动验证

- `npm run check` 通过（33 个测试文件 186 个用例，lint 零 warning）。
- 新增单测：
  - `hint-entries`（上下文选取、反查、隐藏导航 / 全局功能、dictation 门槛、**改键后控件同步变化**）；
  - `action-hints`（短按 / 长按样式区分、按住时进度环的 `stroke-dashoffset`）；
  - `commands`（slash 解析、最近使用排序）；
  - `confirm-dialog`（危险操作默认焦点在“取消”、Escape/B 取消且不确认）；
  - `toast`（全局 `showToast()` 能渲染出提示）；
  - `settings` 增加 `hints` 合并用例；`engine-contract` / `ipc-contract` / `engine-manager` 覆盖 `runCommand`。
- `npm run test:e2e` 12 个用例通过，其中 `gamepad.spec.ts` 新用例用手柄完成“LB 打开列表 → 选中 `/compact` → 插入输入框 → A 发送 → 看到 Fake 引擎的回复”。

### 未完成 / 需要人工验证

- **掌机实测**：提示的浮出位置 / 淡出动画、按住长按键时进度环的手感，以及列表输入在真实手柄下的滚动。
- **列表输入的键盘路径**：打开列表时容器会抢 DOM 焦点，从而让键盘方向键走列表上下文；真实键盘（含输入法）下的行为需人工确认，游戏手柄路径已由 e2e 覆盖。
- **真实 OpenCode 的 `runCommand`**：`client.session.command` 对各命令的实际支持范围、`compact` 回退 `summarize` 是否命中，需用 `npm run engine:smoke` 在有凭据的环境验证（本次只能对 Fake 引擎自动化）。
- **操作提示的触发细节**：目前只有“聚焦且激活”的组件才提示；授权 / 提问卡片按 P-02 应由 13 在激活后复用，本次未改 13 的交互。

### 修复记录（2026-10-07）

- **对话框被页面盖住**：`AlertDialog` / `Dialog` 的 backdrop 与 popup 没有 z-index，而任务地图 / 系统菜单是 `z-40`，导致确认对话框渲染在卡片背后且看起来半透明。给 `ConfirmDialog`、`ChoiceDialog`、`Overlay` 的 backdrop 与 popup 加上 `z-50`，与其它浮层（操作提示、Toast）同级且高于 `z-40` 的页面。
- **列表输入的长说明溢出**：`ListInput` 的命令名与说明加 `w-full truncate`，长说明在一行内省略，不再挤出条目边界。
- **列表输入退出后重新聚焦**：命令列表打开时会抢 DOM 焦点，关闭后由 `Composer` 的 effect 重新激活并聚焦 `<textarea>`；聚焦推迟一帧，避开 Base UI 在卸载时的焦点恢复。

### 按键图标系统（2026-10-07）

- **交付物**：
  - `src/renderer/src/glyphs/GamepadGlyph.tsx`（+ `index.ts`）：纯 SVG 手柄按键图标。`A`/`B`/`X`/`Y` 用实心彩色圆 + 白色加粗字母（短按）或同色粗圆环 + 当前文字色字母（长按）；`LB`/`RB` 圆角肩键、`LT`/`RT` 倾斜扳机、十字键（实心十字 + `mask` 敲掉方向缺口）、`LS`/`RS` 摇杆圆、`Back`（两个叠方块）、`Start`（三条横线）。没有专用图标的控件（如 `LStickX+`、`Guide`）回退到文字键帽。`hold-ring` 的 `data-testid` 与进度环第二圆的 `stroke-dashoffset` 几何保持不变，沿用 `action-hints` 单测。
  - 语义 token 新增 `pad-a` / `pad-b` / `pad-x` / `pad-y` / `pad-label`（`tokens.css` 映射，取值放 `theme/default.css`）。四个面键颜色取 Google 四色（绿 `#34a853`、红 `#ea4335`、蓝 `#4285f4`、黄 `#fbbc05`），两个主题一致；`pad-label` 为白色。
  - 接入位置：`ActionHints`（键帽换成图标）、任务地图底部按键图例与空卡片上的「Y 新建 / X 历史」徽标、系统菜单「按键绑定」的游戏手柄列、手柄调试页的按键列表。
- **决策 / 与 spec 的出入**：
  - **没有复用现成图标包**：可选的 CC0 图标包（Xelu 系、meritite-union 等）是整包 zip / 单一巨型 SVG 或 128px 光栅，风格与参考图不同；引入外部资源还要新增依赖（需先关掉 dev 实例）。改为按参考图手写一套内联 SVG，体量小、可随主题反色。图例文案新增 `taskMap.hints.*`，替换原来的 `taskMap.keysHint` 静态句。
  - **单色图标随主题反色**：用 `currentColor`（面板上的 `on-card`）绘制，深色主题为浅色、浅色主题为深色，符合「浅色模式一套、深色取反色」。
  - **长按面键的字母颜色**：环内透明，白色字母在浅色主题下不可读，因此长按态字母取 `on-card`（深色主题仍是白色，浅色主题自动转深色）；短按保持白色。
  - **长按的单色图标**：无对应「非实心」参考图，统一用描边（空心）表示长按，并叠加同样的进度环。
- **已自动验证**：`npm run check` 通过（51 个测试文件 306 个用例，lint 零 warning）；新增 `gamepad-glyph` 单测（图标覆盖判断、文字回退、短按无环、长按进度）。`npx playwright test gamepad current-work` 通过（含「把 Send 从 A 改绑到 Y」对绑定键的断言、操作提示浮层）。
- **未完成 / 需人工验证**：掌机上图标在 7 英寸屏的辨识度与浅色主题对比度；肩键 / 扳机形状是否够直观（当前用标签区分）。

#### 跟进调整（2026-10-07，用户反馈）

- **非面键的长按改为文字提示**：`A/B/X/Y` 之外的长按（如 `LB:hold` 的「停止 Agent」）不再画空心图标 + 进度环，直接显示「长按 LB / hold LB」（复用 `part.hold` + `controlLabel`，注意 i18n）。面键仍用圆环，操作提示里对应的 `hold` 后缀只在面键长按时追加，避免重复。`GamepadGlyph` 新增 `hasFaceGlyph`；`LB:hold` 之后的肩键 / 扳机 / 十字键不再需要空心变体，已删掉死代码。
- **键位绑定页瘦身**：
  - `HIDDEN_BINDING_ACTIONS` 增加 `scroll`、`nav.activate`、`nav.deactivate`；新增 `HIDDEN_BINDING_CONTEXTS`（`systemMenu`、`systemMenu.picker`），`listContexts` 不再列出它们。于是「当前工作 - 滚动」和系统菜单的全部逐页键位都不再出现。
  - **选择 / 返回收口成一处**：新增 `SHARED_BINDING_ACTIONS` 与 `sharedBindings` / `sharedConflict` / `sharedRebindRows`。设置页在设备页签下方显示一组「通用」，只列 Select / Back 两行；改键时把新键扇出写入所有绑定该动作的上下文（`dialog`、`listInput`、`taskMap.history` 等一并更新），运行时仍是各上下文各自绑定，因此「任务地图上弹出的确认框」这类模态隔离不受影响（用户已确认可接受选择 / 返回影响系统菜单）。冲突检测跨所有目标上下文。
  - 保留 `global` 里 locked 的 Start / Back（打开系统菜单 / 任务地图）两行作为说明——它们本来就不可改。
- **已自动验证**：`npm run check` 通过（311 个用例）；`bindings` 新增共用绑定 / 扇出 / 冲突用例，`gamepad-glyph` 新增非面键长按文字用例，`system-menu` 的锁定用例改为循环导航到目标行。全量 e2e 23 个通过。
