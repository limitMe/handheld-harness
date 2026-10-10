# 13 · 界面：当前工作

> 阶段 B · 方向性 spec。在 03 的 MVP 基础上，按产品文档实现完整的"当前工作"界面。

## 目标

做出主界面：把最大的可视区域留给当前任务，除了状态栏、聊天和输入框，不放任何其他东西。

## 依赖

- 11、12。16 的语音可以晚一些再接入。

## 设计方向

### 布局

- 顶部：窄状态栏（12）。
- 中间：聊天区域，占满剩余空间。用户消息靠右，Agent 消息靠左（03 已实现）。
- 底部：输入框。平时是一根小横条，必要时展开为浮动输入框。
- **不放其他常驻 UI**。临时任务切换器（03）在 14 完成后移除。

### 用户消息的粘滞折叠

- 某条用户消息后面跟着很长的回复时，向下滚动，这条用户消息**粘在顶部**，并折叠成一行：截取开头若干字，后面接省略号。
- 下一条用户消息滚上来时，把上一条顶掉，只粘住最新的一条。
- 往回滚动到这条消息原本的位置时，它恢复为完整显示。
- 实现建议：每轮对话（一条用户消息加对应的回复）用一个容器包起来，用户消息放在容器里设为 `position: sticky`。用 IntersectionObserver 判断是否已经粘住，粘住时切换为折叠样式。折叠和展开的过渡效果见 18。
- 点击折叠的那一行时，跳回这条消息原本的位置（可选）；用方向键 / 摇杆聚焦到折叠的那一行时，直接展开显示完整内容（见实现记录）。

### 输入框：收起与展开

| 状态 | 显示 |
|---|---|
| 未聚焦，且没有草稿 | 底部居中一根小横条，类似 iPhone 的 Home Indicator |
| 未聚焦，有草稿 | 展开为浮动输入框，显示草稿（可以加一个半透明的弱化样式） |
| 聚焦 / 激活 | 展开为浮动输入框，**浮在聊天区域之上**，不挤压聊天区域的布局 |

- 用户往下滚动到最底部后再按一次"下"，焦点落到输入框上，输入框展开。
- 激活后的方向键行为、"顶行再按上"的两段式退出、长按 Y 自动激活等规则，都按 11 的定义。
- 激活时可用的动作：A 发送、B 退出激活、X 向前删除一个字符、LB 列表输入（12）、RB 文本编辑（17）、长按 Y 听写（16）。

### 滚动与导航

- 右摇杆或十字键滚动消息列表，具体映射见 10。
- 消息里的可交互元素（工具调用标签、代码块、链接）可以聚焦，粒度见 11 的待定项。
- 新内容到达时的自动滚动规则沿用 03。

### Agent 运行时的状态呈现

- **授权请求和提问（P-02）**：复用操作提示（12）。
  - 请求出现时，卡片**自动获得焦点并激活**，不用用户再去找。旁边按 12 的规则显示可用的按键。
  - 授权请求的默认键位（P-13，待确认）：A 允许一次、X 始终允许（引擎不支持时没有这个键）、B 拒绝。
  - 提问卡片（P-13）：上下键选择选项，A 确认（多选题里是切换勾选，最后再确认提交），B 忽略（调用 `rejectQuestion`）。
  - 卡片激活期间，输入框保持收起；卡片处理完之后，焦点回到原来的位置。
  - 03 的"卡片 + 按钮 + 数字键"保留，作为触屏和键盘的备用操作。
- **busy 状态的提示**：建议在底部小横条上加流光效果，或者在状态栏标题旁加一个小动画。
- **中止 Agent 的按键**：P-14。
- **当前模型**：不在主界面上显示（P-01：模型是低频设置，只在系统菜单里改）。消息脚注（03）里仍然会显示这条回复用的模型名。

## 验收方向

- 只用手柄完成：滚动阅读长回复（期间粘滞折叠正常）→ 移到输入框 → 长按 Y 听写 → A 发送 → 处理授权请求。
- 输入框展开和收起不会让聊天内容跳动。
- 在 1080p 7 英寸屏幕上，聊天正文在一臂距离内清晰可读（用户主观验收）。

## 待定输入

P-13（卡片键位）、P-14（滚动与中止的按键）、P-18（粘滞折叠时截取多少字）。

## 实现记录

实现日期：2026-10-06（分支 `feat/screen-current-work`）。按用户要求，本 spec 直接在仓库里开发，暂不经 dogfooding；spec 的三处待定项按 `README.md` 的建议值实现（用户已把 P-14 / P-18 的建议写回 README）。

### 交付物

- **用户消息粘滞折叠**（`rounds.ts`、`StickyUserMessage.tsx`、`MessageList.tsx`）：
  - `groupRounds()` 把每条用户消息与其后的回复分成一轮，`MessageRound` 作为 `position: sticky` 的容器，因此一条消息只在自己的这一轮里粘住，被下一条顶掉。
  - `findStuckRound()` 是纯函数：按各轮的 `offsetTop`/`offsetHeight` 找出覆盖滚动区顶边的那一轮，只有它会折叠；折叠态渲染成一行 `truncate` 的按钮，点击 `scrollIntoView` 回到原位并展开。
  - 折叠截取量（P-18）交给 CSS `truncate`：由可用宽度决定，不写死字数。
- **输入框收起 / 展开**（`Composer.tsx`、`CurrentWork.tsx`）：输入框改为绝对定位浮在聊天区之上（`relative` 容器），未聚焦且无草稿时是底部居中的小横条（`composer-collapsed`），聚焦 / 激活或有草稿时展开；有草稿但未聚焦时叠加弱化样式。激活后光标仍在原生 `<textarea>`，IME / Win+H / 两段式退出等 03、11 的行为不变。
- **卡片按 P-02 复用操作提示**（`MessageList.tsx`、`PermissionCard.tsx`、`QuestionCard.tsx`）：待处理请求出现时卡片自动聚焦并激活，操作提示因此按 `currentWork.permission` / `currentWork.question` 动态生成；队列清空后焦点回到进入卡片前的位置。
- **提问卡片交互（P-13）**：卡片自身是激活节点，用本地高亮在一组目标（各题选项 ▸ Submit ▸ Ignore）上移动，A 单选即确认、多选切换勾选后用 Submit 提交，B 调用 `rejectQuestion`。按钮和数字键 / 点击路径保留给触屏与键盘。
- **布局**：`CurrentWork` 根节点加 `relative`；消息区常驻底部留白（`pb-28` + `scroll-pb-28`）容纳浮动输入框，`↓ Latest` 上移到输入框之上。

### 与 spec 的出入 / 决策

- **粘滞折叠的检测方式**：spec 建议用 IntersectionObserver。实现改为“把每轮包进容器 + 计算覆盖顶边的轮次”，因为 IO 在元素位于视口下方时会误报“未相交”，且阈值对零高度哨兵不稳；`findStuckRound` 是纯函数，可单测。
- **折叠时不保证零位移**：展开 / 收起会改变该轮在流内的行高，产生一次性位移；spec 的“不跳动”只针对输入框展开 / 收起，输入框改为绝对定位后已满足。
- **输入框展开不挤压聊天区**：常驻固定底部留白，展开 / 收起不重排；草稿多行增高时向上覆盖，靠 03 的自动滚底保证最新内容可见。
- **授权卡片去掉 03 的“输入框为空才聚焦”门槛**：spec 13 要求请求出现即自动聚焦并激活，因此只要有待处理请求就抢焦点；卡片期间输入框随之收起。
- **提问卡片不再用焦点树逐个聚焦选项**（11 的做法）：改为卡片级激活 + 内部高亮，才能让 `currentWork.question` 的 A/B 生效并展示操作提示；选项按钮仍在，供触屏 / Tab 使用。
- **临时任务切换器与状态栏 `Tasks` 按钮保留**：spec 说 14 完成后再移除，14 尚未实现。（14 落地后已移除切换器；`Tasks` 按钮保留但改为打开任务地图，见 spec 14 实现记录。）
- **busy 提示**：折叠小横条加 `animate-pulse`，并保留消息区底部的 “Agent is working…”，未另做流光。
- **P-13 / P-14 键位沿用 10 的默认值**（授权 A/X/B、提问上下 + A/B、滚动右摇杆 / 十字键、长按 LB 中止），本 spec 未新增绑定。
- **RB 文本编辑（17）与长按 Y 听写（16）仍是占位**：动作已由 ActionMap 提供，操作提示会照常显示，但按下去暂无界面响应。

### 已自动验证

- `npm run check` 通过（36 个测试文件 197 个用例，lint 零 warning）。
- 新增单测：`rounds`（轮次分组、粘住判定）、`question-card`（单选一次确认、多选切换后提交、忽略、方向动作移动高亮）、`composer-collapse`（未聚焦且无草稿才收起、有草稿保持展开且弱化、向下返回展开）。
- `npm run test:e2e` 17 个用例通过，其中新增 `current-work.spec.ts` 5 个：输入框收起 / 展开、提问卡片自动激活 + 手柄 A 确认、授权卡片自动激活并显示操作提示、短对话不折叠、长会话中粘滞用户消息折叠并固定在顶部。

### 未完成 / 需要人工验证

- **掌机实测**：1080p 7 英寸上的可读性（主观验收）、粘滞折叠在真实滚动 / 手柄滚动下的手感、操作提示浮出位置。
- 只用手柄完成“滚动阅读长回复 → 移到输入框 → 长按 Y 听写 → A 发送 → 处理授权请求”这条验收链路里的听写（16）尚未实现，无法自动化。
- 面板底部留白是固定值，超长草稿展开时最新消息可能被覆盖；需要在掌机上确认体验是否可接受。

### 交互优化（2026-10-07）

- **输入框隐藏滚动条**：多行草稿超出高度时仍可滚动，但用 `scrollbar-hidden` 工具类隐藏原生滚动条。
- **X 向前删除一个字符**：新增 `input.deleteBackward` 动作并绑定到 `currentWork.input` 的 X，光标在字符之间时删除前一个字符、有选区时删除选区（`textEditing.deleteBackward`，纯函数）。
- **听写中立即发送不再残留草稿**：发送前调用新增的 `dictation.finish()`，把未确认的 partial 收进草稿后立即结束会话；此后的 `final` / `ended` 事件不再回写输入框（见 spec 16 实现记录）。

### Agent 输出卡片重构（2026-10-08，分支 `feat/current-work-agent-cards`）

用户试用后提出：Agent 消息只占屏宽一半多，右侧大量留白；且中途的思考/操作与最后的总结混在一起，难以快速定位总结。按用户确认的三点决策实现：

1. **卡片高度：自动高度 + 最多一屏**，滚动时让某张卡片的顶部对齐可视区顶部（带一点粘滞感）。短卡片收缩，超长卡片封顶一屏。
2. **两类 Agent 输出按 assistant 消息切分**：一轮里最后一条 assistant 消息是**总结卡片**，之前的所有 assistant 消息（reasoning / tool / 中途文本）合并为**中途卡片**。
3. **中途确认改为“回答后保留一张右侧卡片”**：待处理时仍是原可交互卡片；回答后在原位置保留一张右对齐卡片记录用户的选择，把上下的 Agent 输出隔开，因此一轮最多四张卡片（用户 / 中途 / 确认 / 总结）。

#### 交付物

- **卡片分组**（`rounds.ts`）：`groupRounds(messages, choices)` 把回答过的确认按“回答消息数”插入到对应轮次；`roundCards(round)` 用确认切分成多个段，最后一段的末条 assistant 消息单独成总结卡片，其余成中途卡片。`findStuckRound`（粘滞折叠判定）不变。
- **回答记录状态**（`state/types.ts`、`state/store.ts`、`state/applyEngineEvent.ts`）：新增 `answeredChoices`（按 `sessionKey`），在 `replyPermission` / `replyQuestion` / `rejectQuestion` 里于调用引擎前写入 `request` + `answer` + `anchor`；会话删除时清理。仅在内存中，不持久化。
- **卡片渲染**：新增 `AgentCard.tsx`（全宽、`maxHeight` 一屏、内容底部对齐、顶部溢出显示“…”、A 打开全屏、聚焦时 `scrollIntoView({ block: 'start' })`）、`ChoiceCard.tsx`（右对齐的选择记录）、`CardViewer.tsx`（全屏阅读器）。
- **聚焦粒度**：卡片本身是唯一的聚焦节点；`PartView` 新增 `focusable` 开关，卡片内不再逐 part 聚焦。`MessageItem` 改为纯展示，新增 `AgentCardFooter` 统一卡片脚注。
- **全屏阅读**（A）：覆盖状态栏以下的当前工作区，从卡片顶部开始；十字键 / 左右摇杆滚动，B（或 Esc）返回。进入时记录 `message-list` 的 `scrollTop`，退出时还原。
- **输入绑定**：新增 `cardView` 上下文（十字键上下、左右摇杆 `scroll`、B 返回；键盘方向键 + Esc），加入 `DEFAULT_BINDINGS`，并补上 `CONTEXT_LABELS`、`CONTEXT_ORDER` 与中英 `contexts.cardView`。
- **文案**：新增 `agentCard.intermediate` / `agentCard.summary` / `choice.youChose` / `question.ignored`。

#### 与 spec 的出入 / 决策

- **“吸顶”实现方式**：spec 未指定；这里不用 CSS `scroll-snap`（会与“新内容自动滚到底”打架），改为卡片聚焦时 `scrollIntoView({ block: 'start' })`，并用 `scrollMarginTop = 40px` 让卡片顶部落在粘滞用户消息之下。自由滚动时不强制对齐。
- **确认卡片左右样式**：用户原话里“这个额外确认……更改为右侧显示的用户输入卡片”落实为**回答后的记录卡片**右对齐；待处理时仍保留原来左侧可交互卡片（需要按钮和操作提示），交互与键位不变。
- **“最多一屏”高度**：取 `message-list` 的 `clientHeight - 112px`（即在输入框之上），用 `ResizeObserver` 跟随窗口尺寸。
- **卡片顶部“…”**：内容超出时在内容区顶部叠加一个省略号（位于滚动容器之外，不随内容滚走）。

#### 已自动验证

- `npm run check` 通过（58 个测试文件 360 个用例，lint 零 warning）。
- 单测更新：`rounds`（新分组、确认按 anchor 插入、`roundCards` 的中途/确认/总结切分）。
- `npm run test:e2e` 26 个用例通过，其中新增 `current-work.spec.ts` 的“打开 Agent 卡片全屏、滚动、B 返回并还原位置”；`focus.spec.ts` 的焦点断言由 `part-*` 改为 `card-*`；`current-work` 的提问卡片用例在按键前把鼠标指针移开，避免物理光标悬停选项影响 D-pad 高亮。

#### 未完成 / 需要人工验证

- **掌机实测**：卡片吸顶手感（尤其自由滚动与粘滞折叠叠加时）、超长卡片“…”与底部对齐的可读性、全屏阅读器摇杆滚动手感。
- P-14（滚动手感）与 P-18（折叠截取量）仍沿用原默认；本轮未改键位。

### 卡片重构修复（2026-10-08，试用反馈）

- **重新打开对话落到最新内容**：`MessageList` 新增 `sessionKey`，会话切换时（render 期调整，避免 effect 里 setState）把 `atBottom` 复位为 `true`，并在 `cardMax` 测量后重新贴底，修掉“上不上下不下”。新增 e2e“reopens a task scrolled to its newest content”。
- **“↓ 最新”加阴影**：`scroll-latest` 按钮加 `shadow-card`。浅色主题下 `card` 与 `surface-raised` 都是白色，原来和 Agent 卡片糊在一起。
- **全屏阅读器背景 = 卡片背景**：`CardViewer` 覆盖层底色由 `surface` 改为 `surface-raised`。
- **全屏阅读器左右摇杆可滚动**：根因是取焦点的滚动节点被注册到了 `focus-root`（`useFocusable` 写在 `FocusContainer` 的父组件里，读不到 scope 上下文），`tree.move` 会走到兄弟节点返回 `true`，摇杆控制器因此不滚动。改为把滚动节点放进 scope 内部的子组件，并给 `FocusContainer` 新增 `detached`：detached scope 注册为焦点根，`move` 在边界返回 `false`，摇杆回落到滚动该区域。e2e 增加摇杆滚动断言。
- **“思考与操作”卡片字号更小**：新增语义 token `--theme-font-size-sm`（当前 16px），`.agent-card--intermediate .markdown` 用它覆盖字号。

修复后 `npm run check` 与 `npm run test:e2e`（27 个用例）全部通过。

### 重新打开对话仍然错位：真正根因（2026-10-08）

上一节的 `sessionKey` 复位在假引擎（消息已缓存）下有效，但真实底座切换任务时 `getMessages` 是异步的：内容在视口停在 `scrollTop = 0` 时增长，浏览器随即发出一个 `scroll` 事件，旧逻辑 `scrollHeight - scrollTop - clientHeight > 阈值` 就把 `atBottom` 判成了 `false`，于是自动贴底那次 effect 被跳过，停在“上不上下不下”。

修复：
- **`onScroll` 只把“位置回退”当作用户向上滚**：`scrollTop` 变小才置 `atBottom=false`；内容长高导致的距底变大不再取消贴底。视口停在原位、内容增高时会重新滚到底。
- **`openSeq`**：`ui.openSeq` 在每次 `openSession` 递增，`CurrentWork` 以 `${key}:${openSeq}` 作为 `MessageList` 的 `viewKey`，因此“重新打开当前任务”也会回到最新内容。
- e2e `reopens a task scrolled to its newest content` 增加“重开当前任务”断言；并用主进程 `webContents.reload()` 验证了“重启后异步加载”这条路径确实贴底（此前的 `Ctrl+R` 在该用例里并未真正 reload，是测试假象）。

### 重启后首屏卡片仍错位：卡片内部锚定（2026-10-08）

继续排查发现，重启后的错位主要发生在**卡片内部**：`AgentCard` 只在 `[card.messages, maxHeight]` 变化时执行一次 `scrollTop = scrollHeight`，但 Markdown / 代码高亮等内容是在首帧之后才渲染完的；首帧量到的高度偏小，锚定到“当时的底部”，内容长高后就停在卡片上半部分（`data-overflowing` 一直为 false）。页面也会因为卡片随后变高而差出几十像素。

修复：
- `AgentCard` 用 `ResizeObserver` 观察内部内容块，内容尺寸一变就重新 `scrollTop = scrollHeight` 并更新省略号状态，不再只依赖首帧。
- 同一次 resize 通过 `onResize` 回调通知 `MessageList`，在 `atBottom` 时同步把整页重新贴底。
- e2e 新增 `anchors the transcript and its cards after a restart`：用主进程 `webContents.reload()` 模拟重启，断言页面与每张卡片的距底都 ≤ 48px（默认 fixture 的中途卡片 + 总结卡片都验证）。

### 代码高亮配色（2026-10-08）

用户要求给当前工作页的 Agent 回复补上柔和的代码高亮，并覆盖浅色 / 深色与全屏阅读器。做法：

- **渲染管线不变**：卡片和全屏阅读器都走 `MessageItem → PartView → MarkdownView`，`MarkdownView` 本就带 `rehype-highlight`；本轮只启用 `{ detect: true }`，让没写语言的 ``` 代码块也能自动识别并高亮（此前只有 `language-*` 的块会上色）。
- **专用语法变量**：新增 `--theme-syntax-comment/keyword/string/number/function/type/attr/tag/addition/deletion`，深色值（Catppuccin Mocha）在 `theme/default.css`、浅色值（Catppuccin Latte）在 `theme/light.css`；`markdown.css` 的 `.hljs-*` 规则改为引用这些变量，覆盖 comment、keyword、string、number、title（含 `class_` / `function_`）、type/built_in、attr/variable/params、tag、diff、punctuation/operator。
- **不再复用状态语义色**（原先把 keyword/string/number 映射到 accent/success/warning，对比度偏高、类别也少），改为低对比度的成套 pastel，深浅两套各自取值。
- **工具调用与工具输出**：这两类不是 Markdown，走的是 `PartView` 里独立的 `<pre>`，原本完全不高亮。新增 `workbench/CodeBlock`（复用同一套 `rehype-highlight` 管线与 `.hljs-*` 配色），shell 工具（bash/sh/shell/zsh/pwsh/powershell）的命令行按 `bash` 高亮，展开后的输出按自动识别高亮；非 shell 工具的命令行保持纯文本。命令行还带一层低对比度的 `--theme-color-surface` 背景（和 Markdown 代码块同底色，因此语法配色天然适配）。
- 新增单测 `tests/unit/markdown.test.tsx`（带语言 / 无语言 detect / 行内代码 / `CodeBlock`）与 `tests/unit/tool-part.test.tsx`（shell 命令行高亮、展开输出高亮、非 shell 不高亮）。

#### 滚动卡顿修复（2026-10-08，试用反馈）

试用发现滚动时「思考与操作」卡片会空白一阵、同一卡片反复出现。根因：`react-markdown@10` 的同步 `Markdown` 组件**内部没有 memo**，每次渲染都会重新跑一遍 `unified`（parse + `rehype-highlight`）；而滚动会触发 `MessageList` / `AgentCardView` 重渲染（粘滞轮次、`ResizeObserver`），于是这张工具密集的卡片每次重渲染都要把每个文本 part 和每个新增的 `CodeBlock`（每个工具行一个）全部重新高亮一遍。

修复：把 `MarkdownView` 和 `CodeBlock` 用 `React.memo` 包起来。它们的 props 都是原始值（文本 / 代码 / 语言 / 布尔 / 类名），消息完成后不再变化，重渲染时直接命中缓存跳过，只有流式文本真正变化时才重新高亮。没有新增依赖。

### 总结卡片改名为「最新回复」（2026-10-08，试用反馈）

`roundCards` 总是把一轮里最后一条 assistant 消息当作总结卡片（`agentCard.summary` = 原「总结 / Summary」）。但 Agent 正在回复时，这条“最后一条消息”通常还在做操作，标成「总结」会误导。由于卡片类型在流式期间确实难以区分，只在文案上处理：`agentCard.summary` 改为「最新回复 / Latest reply」，`agentCard.intermediate` 保持「思考与操作」。未改分组逻辑。

### 聚焦折叠的用户消息时自动展开（2026-10-08，试用反馈）

- **问题**：用手柄滚动时焦点会落到某条用户消息上，但这一轮仍被判定为“粘住”，于是消息保持折叠——用户看着聚焦的高亮却读不到内容。
- **处理**：`StickyUserMessage.tsx` 新增 `showCollapsed = collapsed && !focus.focused`，聚焦时按展开态渲染（用已有的 `useFocusable` 返回的 `focused`，不改 `findStuckRound`）。焦点移走后若这一轮仍粘住就重新折叠，与原来的滚动逻辑一致。折叠态对应的“点击回到原位”仍在。
- 新增单测 `tests/unit/sticky-user-message.test.tsx`：聚焦时展开、焦点移开后重新折叠、未粘住时保持展开。

### 运行失败不再无提示（2026-10-09，试用反馈）

用户把模型设成没有配置 API key 的提供商后发消息：既没有失败提示，也没有后续卡片，看起来像应用卡死，无法区分是应用出错还是模型没配好。

**根因**（两条路径都会静默）：

1. `session.error` 事件本身带 `message`，但 `applyEngineEvent` 只把会话置为 `runState: 'error'`，把 `message` 丢掉了；当前工作页对 error 状态没有任何渲染，所以界面上什么都不出现。
2. OpenCode 适配层的 `prompt()` 调了 `session.promptAsync` 却丢弃了 SDK 的 `{ data, error }` 返回值（`promptAsync` 默认 `throwOnError: false`）。凭据/模型错误若在请求阶段立刻返回，既不抛错也不发事件，等于被吞掉；`runCommand` / `summarize` 同样没 `unwrap`。

**修复**：

- **状态**：`state/types.ts` 新增 `sessionErrors: Record<string, string>`（按 `sessionKey`）。
- **reducer**（`applyEngineEvent.ts`）：`session.error` 保存 `message` 并置 error 状态；新的运行进入 `busy` 时清掉旧错误；会话删除时一并清理。
- **渲染**：`CurrentWork.tsx` 读取当前会话的错误并传给 `MessageList.tsx`；后者在消息流末尾渲染一张 `session-error` 卡片（`role="alert"`，danger 边框 + 引擎原文），有错误时不再显示空状态提示。
- **发送兜底**（`store.ts` 的 `sendCurrent`）：`createSession` / `prompt` / `runCommand` 的失败被捕获。发消息失败时把错误写进该会话的 `sessionErrors` 并把草稿放回输入框（便于配好 key 后重试）；连会话都没建起来时用 `toast.messageFailed` 提示。
- **适配层**（`opencode/adapter.ts`）：`promptAsync`、`command`、`summarize` 的返回值都过 `unwrap`，让立刻返回的错误向上抛出。
- **文案**：新增 `messageList.sessionError`、`toast.messageFailed`（中英）。

spec 03 的错误横幅只覆盖引擎 `down` / `reconnecting`；这里补的是**单次运行失败**（会话级），两者不冲突。

**已自动验证**：`npm run check` 通过（71 个测试文件 436 个用例，lint 零 warning）；`npm run test:e2e` 31 个用例通过，新增 `current-work.spec.ts` 的“surfaces a failed run and clears the error on the next message”（`/fake error` 出现错误卡片，下一条消息开始时卡片消失）与 `apply-engine-event` 的三条错误用例。

**未完成 / 需要人工验证**：用真实 OpenCode 选一个未配置 key 的提供商发消息，确认错误卡片能显示底座返回的原文（文案由底座决定，未在本仓库固定）。

### 单选不再「选中即提交」（2026-10-10，试用反馈）

用户多次反馈：面对多个问题，选到某个单选选项后卡片**立即提交**，来不及复核 / 修改其他问题，且「确认」按钮形同虚设。这推翻了 P-13 原来的「A 单选即确认」决策（本节记录优先于上文 P-13 实现记录）。

**改为**（`QuestionCard.tsx` 的 `selectOption`）：

- **选择一律不提交**。单选题选中后只记录答案，不再 `onReply`。
- **选完自动高亮到 Submit**：当某次单选使所有问题都有答案时（`!multiple && every(answered)`），把本地高亮 `setHighlight(targets.length - 2)` 移到 Submit，用户再按一次 A 才提交；期间可上下移回任何选项修改。
- 多选仍维持原样：切换勾选后需显式移到 Submit 提交（不自动跳转，避免打断连续多选）。
- 提交 / 忽略逻辑不变（`confirm` 处理 Submit / Ignore）。

**已自动验证**：`npm run check` 通过；更新单测 `question-card.test.tsx`（单选后不提交、高亮落到 `question-submit`、再点提交才 `onReply`），更新 e2e `current-work.spec.ts`「auto-activates the question card and confirms with gamepad A」为按两次 A。

### 提问卡片两条交互修复（2026-10-10，试用反馈）

**问题一：多问题向下导航时高亮回跳。** 十字键从问题一的最后一个选项移到问题二时，卡片会滚动（`useScrollHighlighted` / 分组滚动），滚动把新的一行带到**静止的鼠标光标**下，浏览器因此补发 `mouseenter` / 零位移 `mousemove`，原来的 `onMouseEnter` 把它当成悬停，覆盖了 D-pad 高亮。

- 修复：高亮只跟随**真实指针移动**。新增 `workbench/hover.ts` 的 `isPointerMoved`（`movementX/Y !== 0`），`QuestionCard`、`ListInput`、`HistoryList` 的 `onMouseEnter` 改为带此判断的 `onMouseMove`；滚动产生的零位移事件被忽略。触摸 / 点击路径不受影响。

**问题二：提问卡片未提交时，进入菜单后上下导航失效。** `CurrentWork` 在任务地图 / 系统菜单 / 会话信息页打开时只是 `dimmed`、并未卸载，`currentWork.question`（以及 `currentWork.permission`）上下文仍挂在 `CONTEXT_ORDER.overlay`，而菜单的聚焦导航走 `CONTEXT_ORDER.focus`（更低）；高优先级的卡片上下文吞掉了 `nav.up` / `nav.down`，于是菜单里方向键、摇杆、滚轮都不动了。

- 修复：`useInputContext` 新增 `enabled` 参数（为 false 时不入栈）。`CurrentWork` 把 `interactive={!dimmed}` 传给 `MessageList`；`MessageList` 据此禁用待处理卡片的输入上下文、并把 `interactive` 透传给 `QuestionCard`，同时让「待处理卡片抢焦点」的 effect 在 dimmed 期间跳过。菜单 / 地图聚焦恢复，关掉覆盖层后卡片重新接管。

**已自动验证**：`npm run check` 通过（473 用例）；新增单测：高亮忽略 `mouseEnter` 与零位移 `mouseMove`、只响应带位移的 `mouseMove`；`interactive={false}` 时方向键不改变高亮。e2e `current-work` 提问用例仍通过。
