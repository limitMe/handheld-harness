# 11 · 焦点系统

> 阶段 B · 方向性 spec。

## 目标

参照 Steam 的 `Focusable` 自己写一套焦点树，让每个界面都能完全用手柄操作。区分**聚焦**和**激活**两种状态，满足产品文档对输入框的特殊要求。

## 范围

- **包含**：焦点树的数据结构、方向导航算法、焦点记忆、激活态、滚动跟随、视觉样式钩子、与 10 的输入系统对接，以及在 03 的界面上落地。
- **不包含**：各界面的完整布局（13–17）。

## 依赖

- 10。

## 设计方向

### 模型

> iOS 类比：这就是 tvOS 的 Focus Engine。`FocusContainer` ≈ `UIFocusEnvironment`，`preferredFocus` ≈ `preferredFocusEnvironments`，`flow` ≈ 容器内的搜索方式。

- 用 React 组件声明节点：`<FocusContainer flow="row|column|grid|geometric" memory>` 和 `<Focusable id onActivate onCancel activatable>`。
- 节点在挂载时注册，形成一棵树。核心逻辑放在**纯 TS** 的 `FocusTree` 类里，React 只负责注册和读取状态。
- **方向导航**：
  1. 先在当前容器里按 `flow` 的规则找下一个节点；
  2. 到达边界后交给父容器继续找；
  3. `geometric` 方式按屏幕上的几何位置找最近的节点。
- **焦点记忆**：带 `memory` 的容器重新获得焦点时，回到上次聚焦的子节点。
- **样式**：
  - 聚焦的节点加 `data-focused`，激活的节点加 `data-activated`，祖先节点加 `data-focus-within`；
  - 视觉效果统一由 18 定义。
- **滚动跟随**：聚焦变化时调用 `scrollIntoView`，带一定边距，平滑程度由 18 定义。

### 聚焦与激活

- **聚焦**：方向键在同一层的兄弟节点之间移动。
- **激活**：按 A（`activate` 动作）进入组件内部，此后方向键和其他动作交给组件自己处理；按 B（`deactivate`）退出激活。
- **输入框的特殊规则**（来自产品文档）：
  1. **未聚焦**时显示为小横条（布局见 13）。
  2. **聚焦未激活**：展开，按上 / 下仍然在消息列表里移动。
  3. **激活**：方向键移动文本光标；左摇杆或十字键的映射由 10 定义。
  4. **从激活状态平滑退出**：光标已经在第一行时，再按一次"上"会退出激活，变为聚焦状态；再按一次"上"，就像普通节点一样把焦点移到上方的消息上。
  5. 输入框聚焦时**长按 Y**，自动先激活再开始听写（16）。
  6. B 退出激活。
- 其他可激活组件按需复用这套机制，例如工具调用标签（激活后滚动它的输出），以及 17 的句子。

### 与 Base UI 的协调

- 模态浮层（Base UI 的 Dialog、AlertDialog）打开时，焦点树压入一个新的作用域，并以它为准。Base UI 自带的初始焦点和焦点锁定要与之一致，必要时通过 `initialFocus` 等属性交给焦点树决定。
- Base UI 组件内部的方向键交互如何处理，按 10 的评估结论。
- 焦点样式统一使用焦点树的 `data-focused`，不依赖库自带的 `:focus-visible` 样式。

### 与 03 的过渡

- 03 中所有可点击元素都要注册为 `Focusable`，包括授权卡片和临时任务切换器。
- 键盘的 Tab 顺序与焦点树保持一致。用鼠标或触屏点击时，焦点同步到被点击的节点。

## 验收方向

- `FocusTree` 的单元测试覆盖：row / column / grid 导航、跨容器导航、焦点记忆、节点卸载时焦点的转移、激活和退出，以及输入框"顶行再按上"的两段式退出。
- 不接键盘、只用手柄，能完成 03 验收表中的第 2–6 条。
- 焦点永远不会"丢失"：任何时刻都有一个聚焦节点，除非当前界面里没有任何可聚焦元素。
- 打开 DevTools 时，可以用 `Ctrl+Shift+F` 在页面上叠加显示焦点树，便于调试。

## 待定输入

P-15：激活态下左摇杆是否也移动光标，还是只用十字键；消息列表里每条消息是否都能聚焦（便于复制或展开），还是只有特定元素可以聚焦。

## 实现记录

实现日期：2026-10-06（仓库 `main`，尚未提交）。

### 交付物

- 纯 TS 焦点引擎 `src/renderer/src/focus/tree.ts`：`FocusTree` 类，节点注册 / 卸载、聚焦与激活状态、方向导航（`row` / `column` / `grid` / `geometric`）、到边界后逐级上升到父容器、焦点记忆、模态作用域、节点卸载时的焦点转移。
- React 层 `src/renderer/src/focus/`：
  - `FocusProvider`：创建焦点树、把 `nav.*` 与 `scroll` 动作接进焦点树、焦点变化时移动 DOM 焦点并 `scrollIntoView`；
  - `FocusContainer`：声明逻辑分组（`flow` / `memory` / `scope`），不产生额外 DOM；
  - `useFocusable`：把已有元素注册为焦点节点，返回 `data-focused` / `data-activated` / `data-focus-within` 与 `tabIndex`；
  - `scroll.ts`：`scroll` 动作（右摇杆）查找最近的 `data-scroll-region` 并滚动，焦点不在列表里时回退到主滚动区；
  - `order.ts`：`FOCUS_ORDER` 兄弟排序带，解决“输入框先挂载、消息后到达”导致的插入顺序错位；
  - `FocusDebugOverlay`：`Ctrl+Shift+F` 叠加显示焦点树。
- 输入系统：`InputRouter.pushContext` 增加 `order`，新增 `CONTEXT_ORDER`（focus `-100` / screen `0` / activated `100` / overlay `150` / modal `200`），让“激活的组件 ▸ 模态”能盖住屏幕上下文，对应 spec 10 的“Screen ▸ Overlay ▸ Modal ▸ 激活的组件”。
- 落地到 03：状态栏 Tasks 按钮、消息的每个 part（正文、思考、工具调用、文件 / 其他标签）、授权卡片、提问卡片选项与提交 / 忽略、输入框、任务切换器行、`↓ Latest` 都注册为焦点节点；授权卡片在输入框为空时自动聚焦。
- 滚动：右摇杆（`RStickY → scroll`）优先移动焦点，让高亮跟着滚动走（`scrollIntoView` 跟随）；无处可移动时（列表到头、焦点在底部的输入框）才直接滚动最近的 `data-scroll-region`。D-pad 与 RS 共用同一套焦点移动逻辑。
- 输入框（`Composer`）：聚焦 / 激活两态；激活时 A 发送、B 退出；D-pad 左 / 右按字符、上 / 下按行移动光标；处于首行再按“上”先退出激活，再按一次“上”才正常向上移动（两段式退出）；启动或切换会话后默认聚焦并激活，保留原有“直接打字 / Win+H”体验。
- 焦点样式钩子 `src/renderer/src/styles/focus.css`（具体视觉留待 18）。

### P-15 决定（用户确认）

- 激活态下**只用 D-pad 移动光标**，左摇杆不移动光标。
- 消息列表：最初只让交互元素可聚焦；实测后用户反馈“聊天记录没法滚动 / 选中”，改为**消息的每个 part 都是焦点停靠点**（正文、思考、工具调用、文件 / 其他标签），可用 D-pad 逐条选中、右摇杆滚动。授权 / 提问卡片、输入框、任务切换器行照旧。

### 与 spec 的出入 / 决策

- spec 建议用组件声明节点；实现改为 `FocusContainer` 组件 + `useFocusable` hook。原因：把已有元素（`<form>` / `<button>` / 卡片 `<div>`）直接注册，避免为每个可聚焦元素包一层 div 打乱布局。
- `Tab` / 鼠标点击通过节点的 DOM focus 事件同步回焦点树；焦点树变化时反过来移动 DOM 焦点，两者始终一致。
- `grid` 与 `geometric` 都用节点 `getBoundingClientRect()` 按方向取最近邻居（`row` / `column` 用注册顺序）。真正的几何差异等有需要时再细分。
- **显式兄弟排序**：输入框在应用启动时就挂载，消息 / 卡片是之后才出现的，只按注册顺序会把输入框排在前面。`useFocusable` / `FocusContainer` 因此接受 `order`，`FOCUS_ORDER` 把各层排成 tasks（0）▸ 消息 part（1000+）▸ `↓ Latest`（900_000）▸ 卡片（1_000_000）▸ 输入框（2_000_000）。
- **卸载转移改为邻近优先**：聚焦节点卸载时先在同级向后、再向前找还能用的节点，再逐级上升，最后才回退到第一个可聚焦节点；否则权限卡片消失后焦点会跳到状态栏。
- **动作只响应按下，不响应松开**：`onPress`（`src/renderer/src/input/router.ts`）包住所有处理器，忽略 `end` 相位。此前 `nav.activate` 在按下和松开各触发一次，导致任务切换器里松开 A 会再次激活当时聚焦的项（若聚焦到某一行就会选中并关闭）。重复类动作（`nav.*`、`scroll`）仍照常在 `repeat` 上触发。
- **任务切换器初始焦点**：筛选框的 `useFocusable` 抽成 `TaskFilter` 子组件，并在 `FOCUS_ORDER` 里排在最前；否则它是父组件的 hook，注册晚于 `FocusContainer` 的 `pushScope`，初始焦点会落到第一行。
- **滚动**：`scroll` 动作（右摇杆的模拟量）优先调用 `tree.move` 上 / 下，让高亮跟着滚动，再靠 `scrollIntoView` 把焦点滚进视野；只有当焦点无法再移动时（列表到头、焦点在输入框）才回退到直接加减最近 `data-scroll-region` 的 `scrollTop`。这样右摇杆既是滚动也是选中。
- 模态浮层（任务切换器、确认对话框）打开时 `pushScope` 限制导航范围，关闭时恢复此前焦点；并给 Base UI 的 Popup 传 `finalFocus={false}`，避免它把 DOM 焦点还给触发元素、和焦点树打架。调试浮层（手柄 / 麦克风 / 引擎）没有业务焦点节点，未加作用域。
- 提问卡片未启用 spec 10 的 `currentWork.question`（A→`question.confirm` / B→`question.ignore`），而是复用焦点树的“聚焦 + A 激活”来勾选选项、聚焦提交 / 忽略按钮；完整提问交互留待 13（P-13）。
- 临时任务切换器新增 `taskSwitcher` 上下文绑定（D-pad 上下 / A 激活 / B 退出；键盘方向键 / Enter / Escape），14 完成后随切换器一起退役。

14 落地后已移除该切换器与对应绑定；任务地图用同一套焦点树（卡片为焦点节点，选中项保持激活以供操作提示），详见 spec 14 实现记录。

### 已自动验证

- `npm run check` 通过（typecheck、lint 零 warning、28 个测试文件 167 个用例）。
- 新增单测：`focus-tree`（row / column / grid 导航、边界上升、跨容器、焦点记忆、禁用跳过、显式 `order` 排序、卸载邻接转移、激活 / 退出、两段式退出、scope 作用域与恢复、按钮式 `onActivate`、`cancel`）、`focus-react`（首焦点、导航动作、Enter 激活 / Escape 退出、点击同步、兄弟注册顺序）、`focus-scroll`（滚动区解析与回退、`scrollTop` 增减、有邻居时右摇杆移动焦点 / 无邻居时滚动）、`text-editing`（首行判定、行边界、上下行保列、左右夹取）；`input-router` 增加上下文 `order` 与 `onPress`（忽略 `end`）用例。
- `npm run test:e2e` 11 个用例通过：
  - `focus.spec.ts`：启动即聚焦并激活输入框；退出激活后按“上”移动到状态栏、Enter 打开任务切换器、Escape 关闭并恢复焦点；`Ctrl+Shift+F` 切换焦点树调试浮层；发送消息后从输入框按“上”进入聊天记录、逐条移动选中。
  - `gamepad.spec.ts`（用页内假手柄驱动真实手柄管线）：有会话时聚焦到 Tasks、按 A 打开任务切换器、松开 A 后仍保持打开，且初始焦点在筛选框。

### 未完成 / 需要人工验证

- “不接键盘、只用手柄完成 03 的第 2–6 条”仍需掌机实测。手柄轮询、短按 / 长按、摇杆在 10 已单测；焦点与分发在 e2e 里用键盘动作（与手柄共用同一 Action）覆盖。第 5 条可用手柄走任务切换器；第 6 条（重载）是键盘快捷键，暂无手柄绑定（14 的任务地图会替换切换器）。
- 右摇杆的手感需要掌机实测：现在是“能移动焦点就移动焦点、否则滚容器”，步进频率跟着摇杆的模拟量重复；如果更想要“自由滚动 + 高亮跟随”，可以再调。
- 文本输入本身依赖系统 Win+H / 触屏键盘（16 未实现），手柄无法直接产生文字。
- 输入框“未聚焦收起为小横条”的视觉属于 13，本次只做了聚焦 / 激活两态与光标行为。
