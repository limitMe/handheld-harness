# 10 · 输入系统与键位映射

> 阶段 B · 方向性 spec。实现前由 Agent 列出待定项和方案，用户确认后再动手。

## 目标

把手柄和键盘的原始输入转换成**语义动作**（Action），并按当前所处的界面和组件分发。所有按键都可以重新配置（产品文档："上述所有提到的按键，都是可配置的"）。

## 范围

- **包含**：
  - 手柄轮询；
  - 按键归一化：死区、短按、长按、重复；
  - 键盘映射；
  - 动作表（ActionMap）的数据格式；
  - 分层配置：默认 → 设备预设 → 用户；
  - 上下文栈与事件分发；
  - 改键时的"捕获下一个按键"能力。
- **不包含**：
  - 焦点树（11）；
  - 键位设置界面（15）；
  - 原生辅助进程（19）。

## 依赖

- 04 已完成。11 依赖本 spec。

## 设计方向

### 管线

```
Gamepad API 轮询（rAF）    键盘 keydown / keyup
        └──────────┬──────────┘
            RawInput { device, control, pressed, value, t }
                   ▼
   归一化：死区、按下/松开、短按/长按（默认 400 ms）、按住重复（350 ms 后每 60 ms 一次）
                   ▼
   查表 ActionMap[context]  →  Action { id, phase: start | repeat | end, source }
                   ▼
   上下文栈（Screen ▸ Overlay ▸ Modal ▸ 激活的组件）从栈顶往下传，被处理就停止
```

- **控件命名**统一用：`A B X Y LB RB LT RT Back Start LS RS DpadUp DpadDown DpadLeft DpadRight LStick* RStick*`。Guide 不参与映射（会被系统占用）。
- **短按和长按的区分**：
  - 同一个键如果同时绑定了短按和长按，就要等松开或超过阈值才能判定是哪一种。这会给短按带来最多 400 ms 的延迟。
  - 只绑定了短按的键，按下就立即触发。
  - 这个规则要在 UI 上体现，配合 12 的操作提示。
- **键盘**：有文本框处于激活状态时，可打印字符、方向键、Enter、Backspace 等都直接交给文本框处理。只有映射表里标记为 `global` 的组合键才会被拦截。

### ActionMap 数据格式（建议）

```jsonc
{
  "schemaVersion": 1,
  "contexts": {
    "global":            { "Start": "menu.toggle", "Back": "map.toggle", "Y:hold": "voice.dictate" },
    "currentWork":       { "DpadUp": "nav.up", "RStickY": "scroll" },
    "currentWork.input": { "A": "input.send", "B": "input.deactivate", "LB": "input.listInput", "RB": "input.textEdit" },
    "currentWork.permission": { "A": "permission.once", "X": "permission.always", "B": "permission.reject" },
    "taskMap":           { "A": "task.open", "B": "map.exit", "B:hold": "task.close", "Y": "task.new", "X": "task.history" },
    "textEdit":          { "X": "sentence.delete" }
  },
  "keyboard": { "global": { "Ctrl+K": "...", "F11": "window.fullscreen" } }
}
```

- 手柄上的长按（`B:hold`）在键盘上没有对应概念。键盘配置里，"短按 B"和"长按 B"对应的两个动作（`map.exit`、`task.close`）**各绑定一个独立的键**（P-03），例如 `Esc` 和 `Delete`。动作 id 是两种设备共用的，绑定是各自独立的。

- 动作 id 统一定义在 `src/shared/actions.ts`。每个动作带中文显示名，供 12 的操作提示和 15 的设置界面使用。
- **配置分层**：
  - 代码里的默认值；
  - 设备预设：按手柄 `id` 匹配，例如 Ally、Legion Go，可以利用 Legion Go 多出来的按键；
  - 用户配置：`settings.input`。
- 合并后要做**冲突检测**：同一个上下文里，同一个按键加同一种按法，只能绑定一个动作。

### 默认键位

以 `specs/README.md` 中的默认键位总表为准。已经决定的有：

- 不做模型快捷切换（P-01），所以没有占用 LB / RB 之外的任何键；
- 任务地图里短按 B 退出、长按 B 关闭任务（P-03）。

产品文档没有覆盖、实现时确认的有：

- 授权请求 / 提问卡片的响应键（A 允许一次、X 始终允许、B 拒绝）；
- 滚动对话：建议右摇杆和十字键（P-14）；
- 中止 Agent：议在输入框未激活时按住 LB）；
- 临时任务切换器（03）在 14 完成后退役，对应的键盘快捷键移除。

### 与 UI 组件库的协调（评估项）

UI 组件库选的是 Base UI（01）。它的部分组件自带键盘交互，例如 Select、Menu 的方向键，Dialog 的焦点锁定。手柄动作如何作用到这些组件上，二选一，或者混合使用：

- **(a) 受控模式**：输入系统把动作交给焦点树，焦点树通过组件的受控属性（例如高亮项、打开状态）直接驱动组件。可控性最好，但每个组件都要写适配。
- **(b) 可信键盘事件**：主进程用 Electron 的 `webContents.sendInputEvent` 把手柄动作转成**可信的**键盘事件，例如 DpadUp → ArrowUp。这样库原生的键盘逻辑可以直接复用，原生 `<textarea>` 的光标移动也天然可用（11 的激活态需要这一点）。代价是要防止它和焦点树的导航重复触发，并且要多绕一趟 IPC。
- 建议：组件内部交互（列表高亮、文本光标）用 (b)，组件之间的导航用焦点树。实现前做一个小原型来验证延迟和冲突。

## 验收方向

- 归一化和分发逻辑是**纯 TS**，用模拟的时间序列做单元测试：短按、长按、重复、松开边界、同时按多个键。
- 在掌机上不接键盘，能用手柄完成 03 的全部操作（与 11 合并验收）。
- 修改 `settings.input` 后无需重启即可生效。
- 在 01 的手柄调试页里加一栏"当前触发的 Action"，方便排查。

## 风险

- Steam Input、厂商的桌面模式、Game Bar 会吞掉或改写输入。参考 01 的实现记录；如果问题严重，就提前做 19 的原生辅助进程。
- 窗口失去焦点后 Gamepad API 就收不到输入。在 v1 里这是可以接受的。

## 待定输入

P-13、P-14，以及上面列出的临时任务切换器快捷键。本 spec 已按正文的建议值实现默认绑定，待用户在实际使用中确认（见实现记录）。

## 实现记录

实现日期：2026-10-06（分支 `feat/input-system`）。

### 交付物

- 纯 TS 动作表 `src/shared/actions.ts`：动作 id、显示名、是否可重复；控件命名为 `A B X Y LB RB LT RT Back Start LS RS Dpad* LStick* RStick*`，Guide 不参与映射。
- 纯 TS ActionMap `src/shared/input.ts`：默认键位、设备预设（按手柄 id 子串匹配）、用户层合并、`null` 解绑、冲突检测；分层顺序为 默认 → 设备预设 → `settings.input`。
- 渲染进程输入核心 `src/renderer/src/input/`：
  - `gamepad.ts`：标准映射读取、死区、帧间差分；
  - `gestures.ts`：短按 / 长按（默认 400 ms）/ 按住重复（350 ms 后每 60 ms 一次）/ 摇杆模拟量，纯状态机；
  - `keyboard.ts`：组合键规范化、可编辑元素判定；
  - `router.ts`：上下文栈（Screen ▸ Overlay ▸ Modal ▸ 激活的组件）、按键解析、事件分发（栈顶优先，被处理即停止）；
  - `InputProvider.tsx` + `hooks.ts` / `context.ts`：rAF 轮询、键盘监听、`settings:changed` 热更新、`captureNextControl()` 改键捕获、`useInputContext(id, handlers)`；
  - `debugStore.ts`：给调试页用的动作埋点。
- 调试页 `src/renderer/src/debug/GamepadDebug.tsx` 增加 "Input actions" 栏：当前上下文栈 + 最近 50 条动作（动作名 / 相位 / 来源 / 是否被处理）。
- 设置：`settings.input`（`BindingLayer`）加入 zod schema、默认值，以及设置存储的两层深合并；`settings.update` 的 `input` 支持局部补丁，`null` 表示解绑。

### 与 spec 的出入 / 决策

- **动作显示名用英文**（经用户确认），与 03 已确定的英文 UI 保持一致；spec 原文写的是"中文显示名"。
- **P-13**：A 允许一次 / X 始终允许 / B 拒绝；提问卡片上下选择、A 确认、B 忽略（默认绑定，随卡片实现生效）。
- **P-14**：滚动用右摇杆（`RStickY → scroll`）；中止 Agent 按 spec 正文的"输入框未激活时按住 LB"实现为 `currentWork` 的 `LB:hold → agent.abort`（README 汇总写的是 LT + B，以 spec 正文为准；若要改回请改这里）。
- **键盘**：只对 spec 已决定的场景给默认绑定（taskMap 的 `Escape → map.exit`、`Delete → task.close`，各上下文的 `Arrow*` / `Enter` / `X`）。文本框聚焦时只认 `global` 组合键，其余按键交给文本框。临时任务切换器的 `Ctrl+K` 等快捷键仍由 `App.tsx` 直接处理，按 spec 等 14 完成后移除。
- **设备预设**：机制已实现（`DEVICE_PRESETS` 按 id 子串匹配 + 覆盖层）。Ally / Legion Go 的预设先留空，等在手柄上核实多出来的按键索引后再补。
- **冲突检测**：合并后按"控件 + 按法"分组，同一组映射到多个动作时报告。由于 ActionMap 用 Record 表示，正常合并不会产生冲突；该函数主要作为告警与未来格式的防线，`X:press` 与 `X` 视为同一种按法。
- **默认上下文**：`App.tsx` 用 `useInputContext('currentWork', {})` 声明当前界面上下文，具体处理函数留给 13。
- **不加依赖**：输入系统只用 Web 平台 API；为避免 zod 进入渲染进程产物，ActionMap 的纯逻辑放在 `src/shared/input.ts`（无 zod），zod schema 放在 `src/shared/ipc.ts`。

### 已自动验证

- `npm run check` 通过（typecheck、lint 零 warning、24 个测试文件 134 个用例）。
- 新增单测：`input-actions`、`input-map`（分层 / 解绑 / 预设 / 冲突）、`input-gestures`（短按、长按、松开边界、重复、多键、摇杆）、`input-router`（上下文栈解析、栈顶优先、穿透、可编辑元素下的键盘拦截、订阅）、`input-gamepad`（死区 / 映射 / 差分）、`input-keyboard`（组合键 / 可编辑判定）；`settings` 增加 `input` 深合并与解绑用例。
- `npm run build` 与 `npm run test:e2e`（6 个用例）通过；渲染进程产物中不含 zod。
- 修改 `settings.input` 后无需重启：`InputProvider` 监听 `settings:changed` 重建 ActionMap。

### 未完成 / 需要人工验证

- 验收"不接键盘、只用手柄完成 03 的全部操作"按 spec 与 11 合并验收；本 spec 只交付输入系统本身，未把手柄动作接到 03 的界面（焦点树与各界面在 11–15）。
- "与 UI 组件库的协调（评估项）"要等 11 的焦点树和 Base UI 组件一起验证（受控模式 vs 把动作转成可信键盘事件），本 spec 不做该原型，留到 11/12。
- 需要掌机实测：手柄按键 / 摇杆能触发对应动作并在调试页正确显示；长按 / 重复的手感，以及 Steam 输入、厂商桌面模式下的干扰情况。
