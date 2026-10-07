# 16 · 语音输入协议与实现

> 阶段 B · 方向性 spec。产品文档规定："具体方案还没有定下来，但是要为它留下协议接口"。P-06 原先决定：**本 spec 先只做协议和管线，不选服务商**；MVP 阶段语音输入直接用 Windows 自带的 Win+H。
>
> **更新（2026-10-07）**：用户已选定**火山引擎豆包（Seed-ASR 流式）**作为第一个真实服务商，并决定先交付协议层 + 主进程服务 + 豆包适配器 + 一个调试入口，长按 Y 与设置页随后接入。见文末"实现记录"。

## 目标

1. 定义与服务商无关的语音识别协议，可以随时换服务商。
2. **长按 Y**：把语音**实时**插入到当前激活的光标位置。
3. 为 17 的文本编辑界面提供同一套能力。
4. （服务商选定后）可选的离线兜底：sherpa-onnx 中英双语流式模型。

## 本阶段的交付范围（P-06）

- **做**：`src/shared/speech.ts` 里的协议；麦克风采集管线；主进程的 `SpeechService` 和服务商注册表；渲染进程的 `DictationController`；`MockSpeechProvider`；状态栏的听写指示；长按 Y 的交互。
- **不做**：任何真实的服务商适配器。
- 没有服务商时，长按 Y 听写**不可用**：触发时给出轻提示"尚未配置语音服务，可使用系统语音输入（Win+H）"，不报错。Win+H 照常往原生输入框里输入。
- `MockSpeechProvider` 只用于测试，不能出现在用户可选的服务商列表里。
- 选定服务商之后，只需要新增一个实现 `SpeechProvider` 的适配器，并在 15 的语音页面里加上选择和凭据入口。

## 依赖

- 10（长按）、11（激活态）。17 依赖本 spec。

## 设计方向

### 分层

```
渲染进程：麦克风采集（getUserMedia + AudioWorklet → 16 kHz 单声道 PCM）
        │  通过 IPC 发送音频帧（建议用 MessagePort 传输，避免序列化开销）
        ▼
主进程：SpeechService ── 选择 SpeechProvider ── 网络或本地推理
        │  通过事件推回渲染进程：partial / final / error / level
        ▼
渲染进程：DictationController 把文本写进目标文本框，并更新状态栏的听写指示
```

- API key 和网络请求**只在主进程里**，与 01 的安全约定一致。
- 本地模型（sherpa-onnx）放在主进程或 utilityProcess 中运行。它需要原生模块或 WASM，优先选不需要本地编译的版本（预编译二进制或 WASM）。

### 协议（建议，放在 `src/shared/speech.ts`）

```ts
export interface SpeechProviderInfo {
  id: string
  displayName: string
  streaming: boolean
  languages: string[]          // 'zh-CN' | 'en-US' | 'auto' ...
  offline: boolean
}

export interface SpeechSessionOptions {
  language: string             // 默认 'auto'（中英混说）
  sampleRate: 16000
  hints?: string[]             // 词表提示，例如仓库里的文件名、符号名
}

export type SpeechEvent =
  | { type: 'started'; sessionId: string }
  | { type: 'partial'; sessionId: string; text: string }   // 可能会被后续结果覆盖
  | { type: 'final'; sessionId: string; text: string }     // 确定的一段，追加到已确定的文本后面
  | { type: 'level'; sessionId: string; rms: number }
  | { type: 'error'; sessionId: string; code: string; message: string }
  | { type: 'ended'; sessionId: string }

export interface SpeechProvider {
  info(): SpeechProviderInfo
  start(opts: SpeechSessionOptions): Promise<string>       // 返回 sessionId
  pushAudio(sessionId: string, pcm: Int16Array): void
  stop(sessionId: string): Promise<void>                   // 等待最后的 final 结果
  cancel(sessionId: string): void
}
```

- 先实现一个 `MockSpeechProvider`：回放预先写好的 partial / final 序列，供单元测试和 e2e 测试使用。
- 非流式的服务商（只支持整段识别）也要能接入：`stop` 时一次性返回 final，期间不发 partial。

### 插入到光标位置

- 开始听写时，记录目标文本框和当时的选区 `[start, end]`。选区里有文字的话，先删掉。
- 收到 partial 时，在插入点显示**临时文本**，用下划线或浅色表示，可以被后续结果替换。
- 收到 final 时，把文本固定下来，插入点后移。
- 听写过程中用户手动移动了光标，或者切换了焦点：结束本次听写，以最后一个 final 为准。
- 要和 03 的原生 `<textarea>` 兼容：
  - 临时文本可以直接写进 value，再用选区高亮；
  - 也可以在 textarea 上叠加一层来显示。
  - 无论哪种做法，撤销（Ctrl+Z）的行为都要合理。

### 交互

- **长按 Y**：达到长按阈值时开始，松开时 `stop`，并给一次短震动（如果可用）。开始和结束都要有声音或视觉反馈。
- 开始前先预热麦克风流，保留约 300 ms 的预录缓冲，避免吞掉第一个字。
- 听写期间状态栏显示听写指示（12），可以带电平动画。
- 输入框只是聚焦、还没有激活时长按 Y：先激活，再开始听写（11）。
- **没有可以输入文字的目标时，长按 Y 无效**（P-05）：只有焦点在输入框上（聚焦或激活），或者在 17 的文本编辑界面里，长按 Y 才会开始听写。在任务地图、系统菜单、焦点在消息列表上时都没有任何反应，也不弹提示。
- 按住 Y 期间按 B：取消本次听写，并回滚已经插入的文字。

### 服务商候选（来自技术调研；P-06：留空，MVP 之后选定）

| 服务商 | 特点 |
|---|---|
| OpenAI `gpt-4o-transcribe` / 实时转写 | 中英混说效果较好 |
| ElevenLabs Scribe v2 Realtime | 延迟低 |
| sherpa-onnx `streaming-zipformer-bilingual-zh-en` | 离线兜底，免费 |
| Windows 自带 Win+H | 阶段 A 的过渡方案。它没有编程接口，只能作为"系统输入法"继续可用 |

- 可选：final 结果交给 LLM 做一次轻量润色，去掉口头禅，把口述的文件名转成 `@file`。这一步默认关闭。

## 验收方向

- 用 Mock 服务商测试：partial 能正确替换，final 能正确追加，光标移动后听写结束，取消（B）时回滚本次听写插入的文字。
- （服务商选定后）在掌机上用选定的服务商：输入框激活后长按 Y 说一句中英混合的话，文字实时出现在光标处，松开后 1 秒内得到最终结果。
- 断网时自动或手动切到离线服务商，并给出提示。

## 待定输入

P-06 的服务商选择留到 MVP 之后；P-21 里的 LLM 润色是可选增强；凭据在哪里配置见 P-20。P-05 已决定。

## 实现记录

实现日期：2026-10-07（改动落在主仓库工作区，未提交）。

### 本次范围（P-06 更新）

按用户决定，**先交付协议层 + 主进程语音服务 + 豆包适配器 + 一个调试入口**；长按 Y、光标插入、状态栏听写指示、系统菜单语音页留待后续。真实服务商只做**豆包**一种。

### 交付物

- 协议 `src/shared/speech.ts`：沿用正文的 `SpeechProviderInfo` / `SpeechSessionOptions` / `SpeechEvent` / `SpeechProvider`，新增 `SpeechErrorCode`、`SPEECH_SAMPLE_RATE`、`rmsOf`、豆包默认常量。
- 主进程 `src/main/speech/`：
  - `service.ts`：`SpeechService`（单会话、provider 注册表、事件路由、level 计算）与 `SpeechNotConfiguredError`。
  - `doubao.ts`：火山引擎豆包流式识别适配器（`ws` + 官方二进制协议）。`enable_nonstream` 两遍识别，用分句的 `definite` 区分 `partial` / `final`。
  - `doubao-protocol.ts`：openspeech v3 二进制编解码（4 字节 header + 可选 sequence + 4 字节 payload size + gzip payload，大端）。
  - `credentials.ts`：用 Electron `safeStorage` 加密 API Key，存 profile 私有的 `speech-credentials.json`；密钥不进 `settings.json`，也不经 `settings:get` 返回。
  - `mock.ts`：仅供单测的脚本化 provider，**不**出现在用户可选列表里。
  - `index.ts`：默认注册表（当前只有豆包）。
- 设置（`settings.speech`）：`provider`（`none` | `doubao`，默认 `none`）、`language`（默认 `auto`）、`doubao.{ resourceId, endpoint }`（默认 `volc.seedasr.sauc.duration` / `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async`）。
- IPC：`speech:providers / keyStatus / setKey / clearKey / start / pushAudio / stop / cancel` + `speech:event`；preload 暴露 `window.handheld.speech`。
- 渲染进程：`src/renderer/src/speech/capture.ts`（`getUserMedia` + AudioWorklet → 16 kHz 单声道 PCM，按 ~200 ms 合并后发送）与 `pcm.worklet.js`；调试页 `src/renderer/src/debug/SpeechDebug.tsx`（选 provider、存/清 API Key、改 resourceId/endpoint、开始/停止、实时显示 partial/final/level/error）。入口：`Ctrl+Shift+V` 或系统菜单 › About › Speech probe。

### 关键决策

- **新增依赖 `ws@8.22.0`**：豆包（以及 Fun-ASR）都要求在 WebSocket 握手时带自定义 Header，Node 内置 `WebSocket` 不支持。`ws` 为纯 JS，无需 node-gyp。
- **凭据用 `safeStorage` 加密**存独立文件，而非明文写入 `settings.json`。
- **音频传输**：先用 `speech:pushAudio` invoke（每 ~200 ms 一包）。正文建议的 MessagePort 留到接入正式听写 UI 时再评估。
- **豆包请求参数**：`format=pcm`、`codec=raw`、`rate=16000`、`bits=16`、`channel=1`；`enable_nonstream=true`、`enable_itn=true`、`enable_punc=true`、`enable_ddc=true`、`show_utterances=true`。`language=auto` 时不传 `language`（中英混说自动识别）。帧头：首包 `fullClientRequest` + flags sequence(0b0001) + seq 1；音频包 flags 0；末包 flags lastPacket(0b0010) 并附 100 ms 静音。响应解析对「带 / 不带 sequence 前缀」都做了容错。

### 与正文的出入

- `SpeechProviderInfo` 增加 `requiresCredentials` 字段（正文标注为"建议"）。
- 正文"本阶段的交付范围"里"不做任何真实服务商适配器"一条已按 P-06 更新被覆盖。

### 已自动验证

- `npm run check` 通过（typecheck、lint 零 warning、43 个测试文件 262 个用例）；`npm run build` 通过，AudioWorklet 产物以独立资源文件输出（受 `script-src 'self'` 约束，未内联为 `data:` URL）。
- 新增单测：`doubao-protocol`（编解码往返、末包标志、带/不带 sequence、错误响应、分句拆分）、`speech-service`（provider 列表、未配置拒绝、partial/final/level 路由、会话释放、取消）；`ipc-contract` 覆盖新通道。

### 未完成 / 需要人工验证

- 真机联调：录入豆包 API Key 后，用调试页 Start 说一句中英混说的话，确认实时出字、松手后最终结果正确。
- 断网时的手动/自动切换与离线兜底。

## 实现记录 · 第二阶段（听写接入）

实现日期：2026-10-07（同一分支工作区）。第一阶段已通过用户真机联调确认。

### 交付物

- `src/renderer/src/dictation/`：
  - `editor.ts`：纯 TS 的听写编辑状态机——开始时删除选区、`partial` 在插入点预览（用选区高亮）、`final` 追加并把光标后移、`finalize` 把未确认的 `partial` 转为正文、`undo` 回滚到听写前的值与选区。
  - `controller.ts`：`DictationController` 生命周期：长按 Y 开始、流式写文本、松手结束、B/Esc 取消回滚；检测光标被移动或目标失效则立即收尾（以已确认的 final 为准）；结束时给一次手柄短震动（`pulse.ts`，可用时）。
  - `audio.ts`：麦克风预热——Y 按下即开始采集并保留约 300 ms 预录缓冲，听写开始时先冲入缓冲，避免吞掉第一个字；无目标时不预热。
  - `store.ts`：zustand 听写状态（`status` / `level` / `error`），供状态栏与输入层共享。
  - `DictationLayer.tsx`：注册全局 `voice.dictate`（手柄长按开始/松开结束；键盘 `Ctrl+D` 切换）与听写期间的 `dictation.cancel`（B）；把失败转成轻提示 toast。
- 输入层：`src/shared/actions.ts` 增加 `dictation.cancel`；`src/shared/input.ts` 增加 `dictation` 上下文（`B → dictation.cancel`）与键盘 `global` 层（`Ctrl+D → voice.dictate`）。
- 渲染进程接线：
  - `workbench/Composer.tsx` 在聚焦或激活时把自己注册为 `DictationTarget`（P-05：没有目标时长按 Y 无效），并在 Esc 时优先取消听写。
  - `components/StatusBar.tsx` 显示听写指示（脉冲点 + Listening/Starting + 电平条）。
  - `system/VoicePage.tsx` 重做：provider 选择（None / Doubao）、API Key 录入（存/清 + 状态）、模型与计费档位（Resource-Id）、原有麦克风测试。
- 单测：`dictation-editor`（选区删除、partial 预览/替换、final 追加、finalize、undo）、`dictation-controller`（无目标忽略、开始删除选区、partial/final、取消回滚、光标移动结束、停止释放麦克风）；`bindings` 用例更新以反映新增的键盘 `global` 层。

### 与正文的出入

- 临时文本用**原生选区高亮**表示（正文允许的两种做法之一），未额外叠加图层；因此撤销（Ctrl+Z）沿用受控 textarea 的既有行为。
- 键盘没有「长按」概念，`Ctrl+D` 实现为**切换**（按一次开始，再按一次结束）；Esc 取消。
- 离线兜底未实现：目前只有在线 provider，因此断网时以 toast 提示失败，不自动切换。

### 已自动验证

- `npm run check` 通过（typecheck、lint 零 warning、45 个测试文件 274 个用例）。
- `npm run build` 与 `npm run test:e2e`（19 个用例）通过，包含系统菜单改键用例。

### 未完成 / 需要人工验证

- 掌机实测：输入框激活后长按 Y 说中英混合的一句话，文字实时出现在光标处；松开后 1 秒内得到最终结果；听写中按 B 回滚；状态栏指示正常。
- 麦克风预热的实际手感（第一个字是否被吞）。
