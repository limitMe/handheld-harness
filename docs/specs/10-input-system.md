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

产品文档没有覆盖、实现时由 Agent 给出方案再确认的有：

- 授权请求 / 提问卡片的响应键（P-13，建议 A 允许一次、X 始终允许、B 拒绝）；
- 滚动对话：建议右摇杆或十字键（P-14）；
- 中止 Agent：建议在输入框未激活时按住 B，或者 LT + B（P-14）；
- 临时任务切换器（03）在 14 完成后退役，对应的键盘快捷键是保留还是移除。

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

P-13、P-14，以及上面列出的临时任务切换器快捷键。
