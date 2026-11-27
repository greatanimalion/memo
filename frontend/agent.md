# 前端架构说明（memo-memo-go/frontend）

React 19 + Vite 7 + TypeScript 5 + Wails（Go 后端）。状态管理用 Zustand，请求用 Axios，SSE 走原生 fetch，UI 以 antd 6 / @ant-design/x / Tailwind 4 为主，编辑器用 BlockNote + Lexical，画布用 @xyflow/react。

## 1. 运行方式与路径别名

- 脚本：`dev`（vite）、`build`（`tsc && vite build`）、`preview`。
- 别名（vite.config.ts 与 tsconfig.json 一致）：`@renderer/*` → `src/*`，`@/*` → `src/*`，`@type` / `@type/*` → `src/types`。
- 注意：`constant/` 目录是对 `constants/` 的转发层（见第 12 节），新代码统一用 `@renderer/constants`。

## 2. 启动链路

1. `src/main.tsx`：先 `initApiBase()` 通过 Wails 绑定 `GetApiPort` / `GetApiToken` 拿到真实后端端口与访问令牌，再 `syncApiBase()` 同步 Axios 基地址，最后挂载 `<App />`。
2. `src/App.tsx`：读取本地主题并 `setTheme`，启动 `startUsageTracker()`（使用时长统计），用 `AntDesignThemeProvider` 包裹 `RouterProvider`。
3. `src/routes/index.tsx`：`createHashRouter`，根路径挂 `MainLayout`，子路由见第 3 节。

## 3. 路由与布局

| 路径 | 页面 |
| --- | --- |
| `/`、`/home` | HomePage |
| `/chat` | ChatPage |
| `/memo` | MemoPage |
| `/settings` | SettingPage |
| `/diary` | DiaryPage |
| `/person` | PersonPage |
| `/web` | WebPage |
| `/book` | BookPage |
| `/canvas` | CanvasPage（项目列表） |
| `/canvas/:id` | CanvasProjectPage（单个画布） |

- `routes/index.tsx`：路由表 + 全局 `ErrorPage`。
- `layouts/MainLayout.tsx`：侧边栏 + 顶部系统工具栏 + `<Outlet />` 的主框架。
- `components/Header.tsx`：系统标题栏（最小化/最大化/关闭，调用 `utils/windowControls.ts`）。
- `components/Sidebar.tsx`：主导航菜单（数据来自 `constants/navigation-tools.ts`）。
- `components/CommandPanel.tsx`：命令面板（快捷操作/跳转）。
- `components/PathNavigation.tsx`：页面路径/面包屑导航。
- `components/AntDesignThemeProvider.tsx`：antd 主题与 `zIndexPopupBase` 等全局弹层层级配置。

## 4. pages（页面）

### home
- `home.tsx`：首页仪表盘，组装以下卡片。
- `components/TimeDisplay.tsx`、`clock.tsx`：时间与时钟展示。
- `components/QuickNav.tsx`：快捷导航入口。
- `components/TodayTodos.tsx`：今日待办概览（读 diary 数据）。
- `components/UsageStats.tsx`：使用/码字时长统计展示。
- `components/RecentFiles.tsx`、`StarredFiles.tsx`：近期文件 / 收藏列表，均已改为复用 `components/file-list-card.tsx`。

### chat
- `chat.tsx`：聊天主页面，负责发送消息、会话切换、流式接收编排。
- `components/MessageArea.tsx`：消息列表与流式气泡渲染（Bubble.List / @ant-design/x）。
- `components/SessionList.tsx`：会话列表、重命名、删除（含二次确认）。
- `components/ResumeModal.tsx`：断点/继续对话弹窗。

### memo
- `memo.tsx`：备忘录主页面（文件树 + 编辑区）。
- `components/FileManager.tsx`：文件/目录管理。
- `components/RecentVisited.tsx`：右侧「最近访问」侧栏（独立紧凑布局，未并入库卡片组件）。

### diary
- `diary.tsx`：日记主页面。
- `components/CalendarView.tsx`：日历视图。
- `components/DiaryModal.tsx`：日记编辑弹窗。
- `components/TodoList.tsx`：待办清单。
- `components/StatsCards.tsx`：日记统计卡片。

### book（写书模块）
- `book.tsx`：书籍模块入口，统筹书架与编辑视图。
- `components/Bookshelf.tsx`：书架/书籍列表。
- `components/LeftPanel.tsx`：左侧目录（卷/章）面板。
- `components/EditorArea.tsx`：中间正文编辑区。
- `components/RightPanel.tsx`：右侧设置/检索/统计面板（字数统计改为 `getTextStats`）。
- `components/AgentEditor.tsx`：AI 写书左右分栏（章节预览 + 对话），处理 `chapter_saved` 刷新。
- `components/bookAgent.tsx`：AI 写书对话逻辑与 SSE 消费（复用 `consumeSSEStream`）。
- `components/ManusEditor.tsx`：另一种编辑视图/工作台形态。
- `components/diffText.tsx`：正文 diff 对比（react-diff-view）。

### canvas（无限画布）
- `index.tsx`：画布项目列表页。
- `project.tsx`：单个画布编辑页。
- `hooks/use-agent-bridge.ts`：画布与 AI Agent 的桥接。
- `hooks/use-plugin-host.tsx`：画布插件宿主环境。

### person（人员/配置）
- `person.tsx`：个人页，聚合模型密钥、画布 API、文档模型等配置。
- `components/AddKeyForm.tsx`：新增模型密钥表单。
- `components/ApiKeyList.tsx`：密钥列表与增删改。
- `components/CanvasApiManager.tsx`：画布相关 API 配置管理。
- `components/DocumentModelManager.tsx`：文档模型配置管理。

### web / settings / prompts
- `web/web.tsx`：网址导航页；`components/WebsiteGrid.tsx` 网格展示；`components/WebsiteForm.tsx` 新增/编辑表单。
- `settings/settings.tsx`：设置页；`components/ThemeSelector.tsx` 主题切换。
- `prompts/index.tsx`：提示词库列表；`components/prompt-detail-dialog.tsx` 提示词详情弹窗。

## 5. components（通用组件）

### 根级通用
- `file-list-card.tsx`：通用文件列表卡片（首页近期/收藏复用的外壳）。
- `settings-primitives.tsx`：设置面板原子组件 `OptionPill` / `SettingGroup` / `SettingTitle`。
- `image-settings-panel.tsx`、`text-settings-panel.tsx`、`audio-settings-panel.tsx`、`video-settings-panel.tsx`：四类生成参数面板。
- `model-picker.tsx`：模型选择器。
- `BlockNoteEditor.tsx`：BlockNote 富文本编辑器封装。
- `ChatPanel.tsx`：嵌入式聊天面板。
- `AiPart.tsx`：AI 片段/流式片段展示。
- `TypingDetectorPlugin.tsx`：输入中/打字状态检测插件。
- `image-generation-pending.tsx`：图片生成中的占位态。
- `common/AISender.tsx`：AI 输入发送器（发送失败保留输入）。
- `common/FileList.tsx`：通用文件列表。
- `common/AIConservation.tsx`：AI 对话容器。
- `common/index.ts`：通用组件导出汇总。
- `layout/user-status-actions.tsx`：顶栏用户状态操作区。
- `ui/select.tsx`、`ui/select-shared.tsx`：统一 Select 封装。
- `ui/animated-theme-toggler.tsx`：带动画的主题切换按钮。
- `prompts/prompt-card.tsx`、`prompt-select-dialog.tsx`、`use-prompt-list.ts`: 提示词卡片、选择弹窗、列表数据 Hook。
- `WriterAssistant/AIAssistantPanel.tsx`、`index.ts`：写作助手侧栏。
- `AntDesignThemeProvider.tsx`：见第 3 节。

### canvas 子目录
- 骨架与画布：`infinite-canvas.tsx`、`canvas-node.tsx`、`nodes/builtin-nodes.tsx`、`flow/flow-node.tsx`、`flow/flow-edge.tsx`、`flow/flow-adapter.ts`。
- 交互控件：`canvas-toolbar.tsx`、`canvas-top-bar.tsx`、`canvas-selection-toolbar.tsx`、`canvas-node-hover-toolbar.tsx`、`canvas-zoom-controls.tsx`、`canvas-mini-map.tsx`、`canvas-context-menu.tsx`、`canvas-create-menus.tsx`。
- 侧栏与面板：`canvas-side-panel.tsx`、`canvas-config-node-panel.tsx`、`canvas-node-prompt-panel.tsx`、`canvas-node-reference-bar.tsx`、`canvas-prompt-library.tsx`、`canvas-prompt-chip-input.tsx`、`canvas-resource-mention-textarea.tsx`。
- 节点操作弹窗：`canvas-node-crop-dialog.tsx`、`canvas-node-split-dialog.tsx`、`canvas-node-upscale-dialog.tsx`、`canvas-node-mask-edit-dialog.tsx`、`canvas-node-angle-dialog.tsx`、`canvas-image-toolbar-settings-modal.tsx`、`canvas-image-toolbar-tools.tsx`。
- 项目/资产：`canvas-project-card.tsx`、`canvas-delete-projects-dialog.tsx`、`asset-picker-modal.tsx`、`canvas-refresh-shell.tsx`、`canvas-size-picker.tsx`。
- 插件：`canvas-plugin-manager-modal.tsx`。
- 生成与配置：`canvas-node-generation.ts`、`canvas-config-composer.tsx`。
- 视图 Hook：`use-image-editor-viewport.ts`。
- 设置弹层（方案 A 重构后）：
  - `settings-popover-shell.tsx`：弹层骨架 `useAnchoredPopover` + `AnchoredPopover` + 高阶工厂 `createSettingsPopover`。
  - `canvas-image-settings-popover.tsx`、`canvas-video-settings-popover.tsx`、`canvas-audio-settings-popover.tsx`、`canvas-text-settings-popover.tsx`：仅声明摘要与面板，骨架复用工厂。

## 6. services（数据访问层）

### 基础设施
- `index.ts`：Axios 实例，`baseURL` 取动态 `getApiBase()`，请求拦截器注入后端令牌。
- `api/request.ts`：底层请求封装与统一返回处理。
- `api/local-proxy.ts`：本地代理相关请求。
- `api/model-plugin.ts`：模型插件接口。

### 业务服务
- `book.ts`：书籍/章节/卷 CRUD。已用 `createCrudApi` 工厂收敛，仅保留 `searchBook`、`getBookDetail`、`getChapters(bookId)`、`getVolumes(bookId)`、`mergeChapterAI` 等特例。
- `memeoy.ts`：备忘录/记忆 CRUD 与图片上传，已用 `withFallback` 收敛 try/catch 兜底。
- `bookAgent.ts`：AI 写书后端接口封装。
- `agent.ts`：Agent 相关接口。
- `session.ts`：会话接口。
- `chatStream.ts`：聊天流式请求，事件分发复用 `utils/sse.ts` 的 `consumeSSEStream`。
- `diary.ts`：日记/待办接口。
- `usage.ts`、`local-storage-usage.ts`：使用时长统计上报与本地统计。
- `file-storage.ts`、`image-storage.ts`：文件/图片存储（localforage 等）。
- `config-file.ts`：配置文件读写。
- `app-sync.ts`、`webdav-sync.ts`：应用数据同步 / WebDAV 同步。
- `api/image.ts`、`api/video.ts`、`api/audio.ts`：图像/视频/音频生成接口（各自含 `apiText`、`aiApiUrl`、`aiHeaders` 等工具，后续可继续下沉）。
- `api/prompts.ts`、`api/prompt-source-runtime.ts`、`api/prompt-source-presets.ts`：提示词接口与来源预设。
- `api/canvas-agent.ts`：画布 AI Agent 接口。

## 7. store（Zustand）

- `useWriterStore.ts`：写书模块核心状态（书/卷/章、编辑器设置、当前章节），字数统计改用 `utils/wordCount.ts`。
- `useFileStore.ts`：备忘录当前文件/选中文件状态。
- `useUsageStore.ts`：使用时长统计（`startUsageTracker`）。
- `use-theme-store.ts`：主题状态（与 `theme/*.css` 对应）。
- `use-config-store.ts`：模型/API 配置（`AiConfig`、`ReasoningEffort` 等）。
- `use-prompt-source-store.ts`：提示词来源配置。
- `use-canvas-side-panel-store.ts`：画布侧栏开关状态。
- `use-asset-store.ts`：画布资产状态。
- `use-agent-store.ts`、`use-workbench-agent-store.ts`、`use-agent-skill-store.ts`：Agent 运行态、工作台 Agent、Agent 技能。
- `use-user-store.ts`：用户信息。
- `canvas/use-canvas-store.ts`：画布节点/连线核心状态。
- `canvas/use-canvas-ui-store.ts`：画布 UI 状态（缩放、选择、面板）。
- `canvas/use-plugin-store.ts`：画布插件注册与状态。
- `app.ts`：应用级状态汇总入口。

## 8. hooks

- `useChat.ts`：聊天会话与消息推送逻辑（按会话 id 更新，避免闭包旧会话问题）。
- `useMemory.ts`：备忘录数据加载与操作。
- `useDiary.ts`：日记数据加载与刷新。
- `useAgent.ts`：Agent 调用封装。
- `usePendingResponse.ts`：等待中/占位响应状态。
- `use-copy-text.ts`：复制文本。
- `theme.ts`：主题应用（`setTheme`）。

## 9. utils

- `apiBase.ts`：后端端口/令牌解析（Wails `GetApiPort` / `GetApiToken`），提供 `getApiBase` / `getAuthHeaders`。
- `sse.ts`：SSE 解析与分发。`parseSSEBuffer`、`dispatchSSE`、`parseSSEPayload`，以及 `consumeSSEStream`（统一 fetch + reader 消费循环与 `releaseLock`）。
- `wordCount.ts`：`countWords` / `getTextStats`（中英文字数、段落、句子统计）。
- `dateUtils.ts`：日期格式化与相对时间。
- `fileUtils.ts`：文件路径/类型工具。
- `number.ts`：数字/文件大小格式化（`regularNumberSize`）。
- `stringUtils.ts`：字符串处理。
- `messageUtils.ts`：消息格式处理。
- `themeUtils.ts`：主题变量/样式工具。
- `localStore.ts`：localStorage 读写封装（`getLocalStore`）。
- `helper.ts`：通用辅助（如 `generateUUID`）。
- `windowControls.ts`：窗口最小化/最大化/关闭/重载（引用 `wailsjs/runtime`）。
- `index.ts`：工具导出汇总（含 `getApiUrl`、`getRelativePath` 等）。

## 10. lib（领域逻辑）

### canvas
- `canvas-node-factory.ts`、`canvas-node-geometry.ts`、`canvas-node-size.ts`：节点创建与几何/尺寸计算。
- `canvas-generation-helpers.ts`、`canvas-agent-ops.ts`：生成流程与 Agent 操作。
- `canvas-image-data.ts`、`canvas-resource-references.ts`、`canvas-video-frame.ts`：图片数据、资源引用、视频帧处理。
- `canvas-export.ts`：画布导出；`canvas-event-bus.ts`：画布事件总线。
- `node-registry.ts`、`plugin-registry.ts`、`plugin-runtime.ts`、`plugin-loader.ts`、`plugin-node-context.ts`：节点/插件注册与运行时。

### agent
- `agent-url-bootstrap.ts`：Agent 地址引导初始化。
- `agent-site-tools.ts`：站点/网页相关工具。

### 通用与媒体
- `canvas-theme.ts`：画布主题定义（`canvasThemes`、`CanvasTheme`）。
- `app-theme.ts`：应用主题定义。
- `audio-generation.ts`：音频参数文案（voice/format/speed）。
- `analytics.ts`：埋点统计（GA4/百度）。
- `zip.ts`、`release.ts`：压缩包、版本/发布信息。
- `media-size.ts`：媒体尺寸计算。
- `image-utils.ts`、`image-thumbnail.ts`、`image-reference-prompt.ts`：图片处理、缩略图、参考图提示词。
- `localforage-storage.ts`：localforage 存储封装。
- `keyboard-event.ts`：键盘事件。
- `utils.ts`：lib 内部通用工具。

## 11. types

`book.d.ts`、`session.d.ts`、`memory.d.ts`、`diary.d.ts`、`agents.d.ts`、`common.ts`（`Chapter`/`Volume`/`BookDetail`/`FontFamily` 等）、`file.ts`、`image.ts`、`media.ts`、`canvas.ts`、`canvas-plugin.ts`、`canvas-export.ts`、`index.d.ts`：各领域类型定义与统一导出。

## 12. constants / constant

- `constants/index.ts`：常量汇总导出（含 `port` 默认端口等）。
- `constants/env.ts`：环境/构建常量。
- `constants/runtime-config.ts`：运行时配置读取（`window.__RUNTIME_CONFIG__` 优先级最高）。
- `constants/canvas.ts`：画布常量。
- `constants/navigation-tools.ts`：侧边栏导航配置。
- `constant/*`：对 `constants/*` 的转发（兼容旧引用），新代码不要再使用。

## 13. i18n 与 theme

- `i18n/index.ts`：i18next 初始化；`i18n/locales/zh-CN.ts`、`en-US.ts`：中英文文案（含 `canvas.controls.*`、`settingsPanels.text.*`）。
- `theme/*.css`：9 套主题变量（classic-black、minimalism、modern-dark、eye-care、deep-blue、vintage-paper、premium-gray、blue、dark）。
- `index.css`：Tailwind 入口与全局样式。

## 14. 关键数据流

### HTTP
页面/组件 → `hooks` 或 `store` → `services/*` → `services/index.ts`（Axios，动态 `baseURL`）→ 后端 `/api/*`。统一响应形态为 `{ code, data }`，业务函数返回 `response.data.data`。

### SSE（聊天 / AI 写书）
`chatStream.ts` 与 `bookAgent.tsx` → `utils/sse.ts#consumeSSEStream`（fetch + getReader + TextDecoder + parseSSEBuffer）→ `dispatchSSE` 按事件类型分发：`user_message`、`agent`、`tool_call`、`tool`、`message`、`error`、`cancel`、`done`、`chapter_saved`。心跳与连接注释帧由解析层跳过。

### Wails 绑定
`main.tsx` → `utils/apiBase.ts#initApiBase` → `window.go.main.App.GetApiPort/GetApiToken` → 写入模块内的 `apiPort`/`apiToken` → `getApiBase()`/`getAuthHeaders()` 供 Axios、fetch、SSE 使用。端口由后端随机分配并回传，前端不得硬编码端口。

## 15. 复用约定（重构后请保持）

- 画布设置弹层统一用 `components/canvas/settings-popover-shell.tsx` 的 `createSettingsPopover`，不要再手写锚点/定位/外部点击逻辑。
- 设置面板原子件统一来自 `components/settings-primitives.tsx`。
- 列表卡片统一用 `components/file-list-card.tsx`。
- 字数统计统一用 `utils/wordCount.ts`，不要在组件内重写正则。
- SSE 消费统一用 `utils/sse.ts#consumeSSEStream`，不要在业务代码里重复 reader 循环。
- 同构 CRUD 统一用 `services/book.ts` 的 `createCrudApi` 模式；带兜底的请求统一用 `services/memeoy.ts` 的 `withFallback` 模式。
- 修改代码时保留原有实现为注释，不直接删除（项目约定）。
