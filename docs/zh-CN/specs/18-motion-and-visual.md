# 18 · 动效与视觉系统

> 阶段 B · 方向性 spec。可以和 13–17 交替推进：先定 token，各界面再按 token 实现。

## 目标

让界面"像在玩游戏"：过渡自然、焦点反馈清楚，同时在掌机的 AMD 核显上用电池时也能稳定 60 fps。

## 依赖

- 01 的 `tokens.css`，以及 11 的焦点状态属性。

## 设计方向

### 原则（来自技术调研对 Steam 的分析）

- **一条主缓动曲线**，加 3–4 个时长 token，全局统一使用。Steam 的做法是：一条 `cubic-bezier(0.17, 0.45, 0.14, 0.83)` 用了 343 次。
- **只对 `transform`、`opacity`、`filter` 做动画**，不对 width、height、top 这类会触发布局的属性做动画。
- **焦点是主角**：焦点变化是最频繁的动画，要做得最精致。例如放大到 1.04、加发光描边、略微上浮。
- 支持"减少动效"：读取系统设置，同时提供应用内开关。还要有"省电模式"：关闭模糊、发光、背景动画。

### 工具

| 用途 | 工具 |
|---|---|
| 约 80% 的过渡 | CSS transition / keyframes，用 Tailwind 工具类和 tokens 实现 |
| Base UI 组件的进出场 | 用 `data-starting-style`、`data-ending-style` 属性接 CSS 过渡；需要弹簧效果时，通过 `render` 属性把元素替换成 Motion 组件 |
| 布局动画、元素进出场、弹簧效果 | Motion（`motion` 包，即原来的 framer-motion） |
| 跨界面的共享元素过渡（任务卡片 ↔ 当前工作） | Motion 的 layout 动画，或 View Transitions API |
| 可选 | Rive（麦克风、思考中这类状态动画）、PixiJS 背景层 |

### 关键动效

| 场景 | 方向 |
|---|---|
| 任务地图打开 / 关闭 | 当前工作界面缩小并淡出，卡片错峰入场（约 30 ms 间隔）；按 A 后选中的卡片放大成为当前工作 |
| 任务卡片左右切换 | 整排平移；中间卡片放大，两侧缩小、变暗 |
| 系统菜单 | 从侧边或中心展开，左右两栏之间的焦点移动要连贯 |
| 文本编辑叠层 | 背景模糊加暗；句子焦点框在句子之间平滑移动 |
| 用户消息粘滞折叠 | 高度用 transform 或 clip 来过渡，不做布局动画 |
| 输入框展开 / 收起 | 小横条变形为浮动输入框（共享元素） |
| 长按进度 | 操作提示里的进度环，以及长按 Y 时麦克风的蓄力效果 |
| Agent busy | 低调的流光或呼吸效果，不能分散注意力 |

### 视觉风格与主题（P-08）

- **视觉主题要独立，MVP 之后可以整体替换**：01 已经把语义 token（`tokens.css`）和具体取值（`styles/theme/default.css`）分开，组件只使用语义 token。换主题只需要替换 `theme/` 下的文件，不用改组件。本 spec 的工作是把这套 token 补全，并保证没有组件绕过它。
- **默认主题**参考 Base UI 官方文档示例的观感（中性、简洁）。注意 Base UI 本身是无样式的，没有"默认外观"可言，所以这里参考的是它文档里的示例样式。
- 产品文档要求任务卡片"白底黑字"：通过 `card` / `on-card` 语义 token 实现，默认主题里取白底黑字。整体偏深色还是浅色，由默认主题决定，以后换主题时一起换。
- 主题机制要预留：
  - 可以在运行时切换多套主题（例如给 `<html>` 设置 `data-theme`）。v1 只提供一套 `default`，但机制要走通；
  - "省电模式"和"减少动效"是与主题正交的两个开关。
- 字号：正文 ≥ 18 px，代码 ≥ 15 px，在 7 英寸屏幕上一臂距离可读。
- 中文字体回退顺序：Microsoft YaHei UI → Noto Sans SC。

### 性能预算

- 在掌机上用电池时，所有过渡期间保持 60 fps。用 DevTools 的 Performance 面板录制验证。
- `backdrop-filter` 同一时间最多一层。
- 长会话不能因为动画掉帧。必要时让消息列表改用虚拟列表。

## 验收方向

- 临时把 `theme/default.css` 换成另一份取值（例如浅色），整个应用的配色一起变化，没有任何组件需要修改。
- `tokens.css` 的 `@theme` 里有完整的缓动和时长 token，组件里不出现硬编码的时长（Tailwind 的任意值写法如 `duration-[300ms]` 也算硬编码）。
- 开启"减少动效"后，所有动画降为瞬时，或者只保留淡入淡出。
- 在掌机上录制地图开关和卡片切换各 10 次，没有明显掉帧（用户主观判断，加上 Performance 面板记录）。

## 待定输入

P-21：是否要做背景层（PixiJS / Rive）。P-08 已决定。

## 实现记录

实现日期：2026-10-07（分支 `feat/spec18-theme-motion`，逐步提交）。经用户确认，本次按外部工具辅助开发，先做**主题系统**与**任务地图卡片动效**；「减少动效」「省电模式」两个开关留到后续。

### 用户确认

- 主题选项为 **跟随系统 / 深色 / 浅色** 三选一（比 spec 只要求「运行时切换多套主题」多一档），默认跟随系统，在系统菜单的「Display & hints」分类里改。
- 「减少动效」「省电模式」开关**本次不做**，仍由 `prefers-reduced-motion` 兜底（见 `app.css`）。
- 允许新增 **Motion** 依赖（`motion@14.0.0`，devDependency，精确版本），用于元素进出场和弹簧效果。

### 交付物

- **主题机制**（`settings.ui.theme`）：
  - `shared/ipc.ts` 增加 `ThemeMode = 'system' | 'dark' | 'light'`，默认 `system`；`SettingsPatchSchema.ui` 同步开放。
  - `styles/theme/default.css` 保持深色取值（`:root`，作为设置加载前的兜底），新增 `styles/theme/light.css`，用 `[data-theme='light']` 覆盖颜色与阴影；`styles/app.css` 引入该文件。结构值（字体、字号、时长、缓动）仍共享，换主题只改颜色类取值。
  - `system/theme.ts`：纯函数 `resolveTheme` / `nextTheme` / `themeLabel` / `applyTheme`；`system/useThemeSync.ts`：读取 `settings.ui.theme`，跟随 `prefers-color-scheme` 解析后写到 `<html data-theme>` 与 `color-scheme`，并在设置变化 / 系统偏好变化时重算。`App.tsx` 挂载。
  - `shared/theme.ts`：`resolveTheme` 与 `THEME_SURFACE_COLOR`（`--theme-color-surface` 的镜像）。主进程据此设置 `BrowserWindow` 背景色，并在设置变化或 `nativeTheme` 更新时重绘，避免浅色主题下开窗瞬间闪深色（spec 01 的「背景色与主题一致」）。
- **DisplayPage**：新增 Theme 行（左右循环 跟随系统 → 深色 → 浅色），沿用「按 A 激活后用左右键调节」的取值行交互。
- **动效**（Motion）：
  - `motion/tokens.ts`：从 `:root` 读取 `--t-fast` / `--t-ui` / `--t-scene` / `--theme-ease-standard`，转成 Motion 需要的秒与贝塞尔控制点，组件不出现硬编码时长。
  - `workbench/TaskMap.tsx`：卡片错峰入场（间隔取 `--t-fast / 4` ≈ 30 ms），选中卡片用弹簧在 1.0 / 0.9 之间缩放；整排平移仍是 CSS transition（`duration-scene` + `ease-standard`）。去掉原先用 CSS 类做的 scale/opacity 过渡，避免与 Motion 重复。

### 与 spec 的出入 / 决策

- **只做主题、不做「减少动效 / 省电模式」开关**（用户确认）：`app.css` 里对 `prefers-reduced-motion` 的全局降级保留，但没有应用内开关；「省电模式」未实现。
- **Motion 只用在地图卡片进出场与选中弹簧**：spec 18「关键动效」表里的其它场景（任务地图开合、系统菜单展开、文本编辑叠层、输入框共享元素、长按进度环、Agent busy 流光）本次未做，留待后续。
- **主题默认值从「深色」改为「跟随系统」**：spec 01 的默认主题仍是深色；这里把 `settings.ui.theme` 默认设为 `system`，未设置过的新 profile 在浅色系统上会显示浅色。深色取值仍是 `:root` 兜底。
- **浅色主题沿用现有语义 token**：`surface-raised` 同时充当「浮层底色」和部分组件的「描边色」（如 `border-surface-raised`），浅色下取白色，卡片描边在浅灰底上偏淡。要不要新增独立的 `border` token 属于 token 扩容，本次不做，先记入此处。
- **构建体积**：引入 Motion 后渲染进程 bundle 从约 2.24 MB 增至 2.51 MB（未压缩）。掌机上是否可接受需实测。

### 已自动验证

- `npm run check` 通过（48 个测试文件 289 个用例，lint 零 warning）。
- 新增单测：`theme`（system 跟随系统、显式模式忽略系统、循环切换、标签、写到 `<html>`）、`motion-tokens`（无 CSS 变量时回退到 token 默认值）；`settings` 增加 `ui.theme` 用例；`display-page` 增加主题循环用例并修正滚动速度用例的导航步数。
- `npm run test:e2e`：新增 `gamepad.spec.ts` 用例「switches the theme between dark and light from the system menu」（Start → 选到 Display & hints → A 进面板 → 下移到 Theme → A → 右切到 dark / light，校验 `<html data-theme>` 与 `settings.ui.theme`）；任务地图用例在 Motion 改造后仍通过。

### 高亮与对比度修正（2026-10-07）

- **统一高亮颜色**：`styles/focus.css` 里 `data-activated` 原本用 `accent`、`data-focused` 用 `focus-ring`，看起来是两种蓝色。现在两者都用 `focus-ring`，激活态由组件自身状态表达（spec 18「焦点是主角」，不再用第二个颜色）。
- **去掉浏览器默认焦点轮廓**：`ui/AnchoredPanel` 的浮层会取得 DOM 焦点，没被抑制时会显示系统默认的焦点环（实测 Windows 上是金 `rgb(229,151,0)`），和应用的蓝色焦点环并存。给浮层加 `outline-none`，命令选择 / 操作提示面板不再出现第二种高亮色。
- **浅色主题下的列表选中**：`ListInput` / `HistoryList` 的选中项原来用 `bg-card`，而它们所在面板是 `bg-surface-raised`；浅色主题里两者都是白色，选中项看不见。改为 `bg-surface`（浅灰），两个主题下都能和面板区分。

### 未完成 / 需要人工验证

- **掌机实测**：深色 / 浅色两套主题在 1080p 7 英寸上的对比度与可读性；地图卡片弹簧与错峰入场的手感。
- **其余关键动效**：见上文「与 spec 的出入 / 决策」。
- **减少动效 / 省电模式开关**：未做。
- **浅色主题描边**是否需要新增 `border` 语义 token。
