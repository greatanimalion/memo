# memo — Tauri v2 + React + TypeScript 桌面应用

> **重要：修改或访问后端代码前，必须先读取 `src/main/agents-end.md`**（包含数据库表结构、所有 API 接口文档）。
> **重要：修改或访问后端代码前，必须先读取 `src/renderer/front.md`**（包含数据库表结构、所有 API 接口文档）。

## 开发命令

```bash
pnpm run dev        # Electron dev（自动 chcp 65001）
pnpm run build      # typecheck + electron-vite build
pnpm run lint       # ESLint（eslint.config.mjs）
pnpm run format     # Prettier（--write .）
pnpm run typecheck  # tsc --noEmit for node + web tsconfigs
pnpm run start      # electron-vite preview（预览已构建产物）
```

### Tauri 开发命令

```bash
pnpm run t:dev      # Tauri dev（启动前端 dev server + Rust 编译 + 窗口）
pnpm run t:build    # Tauri release build（输出到 src-tauri/target/release/）
pnpm run dev:frontend   # 单独启动前端 dev server（端口 5173）
pnpm run build:frontend # 单独构建前端到 dist/renderer/
```

> **注意**：用户使用 **cmd**（非 PowerShell）运行 Rust 命令，需要先 `set PATH=%USERPROFILE%\.cargo\bin;%PATH%`。
> PowerShell 中使用：`$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"`。

- 单测/集成测试不存在；无测试框架。
- `build:win` / `build:mac` / `build:linux` 用于 Electron 打包分发包。

## 项目结构

```
src/
  main/           Electron 主进程 + Express 服务器（遗留，可选）
    index.ts      主进程入口
    server/       Express API（端口 32068）
      routes/     CRUD 路由：memory, diary, session, agent, ai, book, bookAgent
      controllers/
      services/   book.service.ts, storage.service.ts, ai.service.ts, langgraph.service.ts, bookAgent.service.ts
      config/     ai.config.ts
      db/         数据库层：book.ts, chapter.ts, volume.ts, bookAgent.ts, index.ts（迁移+自动建表）
  preload/        预加载脚本（Electron 专用，contextIsolation: false, nodeIntegration: true）
  renderer/       React 前端（Vite，Electron/Tauri 通用）
    src/
      components/ Header.tsx, BlockNoteEditor.tsx 等
      hooks/
      pages/      路由页面：chat, home, memo, diary, settings, person, web, book
        book/     book.tsx（入口）
          components/ EditorArea.tsx, LeftPanel.tsx, RightPanel.tsx, Bookshelf.tsx
      services/   Axios 客户端（baseURL http://localhost:32068/），book.ts（API 封装）
      store/      Zustand 状态管理（useWriterStore 管理编辑器状态）
      platform.ts 跨平台抽象层（Electron/Tauri 窗口管理和文件操作）
      utils/      localStore.ts, helper.ts
      routes/     React Router v7（createBrowserRouter）
  types/          共享 TS 类型（entities: Memory, Diary, Session, MyAgent, Book/Chapter/Volume/BookAgent）
plugins/          Vite 插件（devPlugin 替换 Node 模块引用）

src-tauri/        Tauri v2 Rust 后端
  tauri.conf.json Tauri 应用配置
  Cargo.toml      Rust 依赖（tauri 2, axum, rusqlite, reqwest, chrono, uuid, base64）
  build.rs        构建脚本（tauri_build）
  capabilities/   Tauri v2 权限配置
  resources/      应用资源（图标等）
  src/
    lib.rs        Tauri 入口 + Axum HTTP 服务器启动（端口 32068）+ 窗口命令
    db.rs         rusqlite 数据库层（8 张表：memory, diary, session, agent, book, chapter, volume, book_agent）
    models.rs     数据模型（Memory, Diary, Session, Agent, Book, Chapter, Volume, BookAgent, AI 请求/响应）
    server/       Axum 路由模块
      mod.rs      AppState + build_router() + 辅助函数
      memory.rs   Memory CRUD 路由
      diary.rs    Diary CRUD 路由
      session.rs  Session CRUD 路由
      agent.rs    Agent CRUD 路由
      book.rs     Book CRUD 路由
      chapter.rs  Chapter CRUD 路由
      volume.rs   Volume CRUD 路由
      book_agent.rs  BookAgent CRUD 路由
      ai.rs       AI 聊天流式 SSE + Agent 路由
      storage.rs  文件上传/删除 + 静态文件服务
      upload.rs   上传处理

vite.config.tauri.ts  Vite 配置（Tauri 专用，输出到 dist/renderer/）
```

## 架构要点

### Tauri 架构（主）
- **Axum HTTP 服务器**在 Tauri 主进程内启动，端口 `32068`，在 `setup` 阶段通过 `tauri::async_runtime::spawn` 启动。
- **前端**通过 `http://localhost:32068/` 与后端通信，和 Electron 版本完全一致。
- **数据库**使用 `rusqlite`（bundled SQLite），8 张表：`memory`, `diary`, `session`, `agent`, `book`, `chapter`, `volume`, `book_agent`。
- **文件上传**：50MB 限制，按日期分目录存储（`uploads/images/`, `uploads/files/`）。
- **窗口**无边框 (`decorations: false`)；拖拽区域通过 Tauri 内置机制。
- **DPI 感知**：在 `lib.rs::run()` 启动时调用 `SetProcessDpiAwarenessContext(PER_MONITOR_AWARE_V2)`，确保高 DPI 显示器上 WebView2 渲染清晰。

### Electron 架构（遗留，可选）
- **Express 服务器**在 Electron 主进程内启动，端口 `32068`，`startExpressServer()` 在 `ready-to-show` 后调用。
- **安全设置特殊**：`contextIsolation: false` + `nodeIntegration: true` + `sandbox: false` — 渲染进程可直接 `require`。
- **自定义 `app:` 协议**：`protocol.registerSchemesAsPrivileged` (bypass CSP) ，`src/main/customScheme.ts` 也可用但 `index.ts` 中已注册。

### 前端通用
- **TailwindCSS v4** 通过 `@tailwindcss/vite` 插件引入（`@import "tailwindcss"` 在 CSS 顶部）。
- **AI 模型**配置在 `src/main/server/config/ai.config.ts`，支持 qwen-plus / glm-5.1 / deepseek / openRouter，API URL 和 key 来自 store。
- **存储**使用 SQLite，通过各 service 层封装。
- **主题**：通过 `setTheme()` 更改 CSS 变量实现全局颜色切换，暗色模式通过 `prefers-color-scheme: dark`。
- **本地存储**：`utils/localStore.ts` 封装 `localStorage`（theme, _border 等）。
- **路由**：`createBrowserRouter`，所有页面在 `MainLayout` 下。
- **数据库三表拆分**：`books` / `chapters` / `volumes`，外键关联，`order` 字段管理排序。
- **编辑器设置持久化**：`editorSettings` + `editorBg` 存入 localStorage（key: `writer-editor-settings`），启动时自动恢复。
- **章节保存**：自动保存（1s debounce）/ 手动保存（按钮触发 `PUT /api/chapters/:id`）双模式；`setCurrentChapter` 先 await API 再原子更新 state，避免空内容竞态。
- **Book Agent 流式架构**：`POST /api/book-agent` 返回 `Transfer-Encoding: chunked` 流式响应；前端 `BookAgentModal.tsx` 使用 `fetch` + `ReadableStream` 读取，通过 `agentsRef`（`useRef<Map>`）避免 React 状态闭包陷阱，`incrementallyParse` 每收到 chunk 就解析 buffer 更新 ref，再 `syncAgentsFromRef()` 触发 React 渲染；后端 Axum 每个节点完成后 `res.write()` 输出 `### [agentName]\n\n{content}` 格式文本，前端根据标记动态创建/更新对应 Agent 面板；`AgentPanel` 使用 `React.memo` 避免无关重渲染；完成时收到 `[book-agent:done]` 后调用 `loadBookById(bookId)` 刷新后端数据。
- **跨平台抽象**：`src/renderer/src/platform.ts` 封装 `electron` / `@tauri-apps/api` 差异，提供统一的窗口管理（minimize/maximize/close/hide/show）和文件操作接口。

### 图标系统
- **主要图标库**：`@ant-design/icons`（v6.3.2），26 个文件中使用约 50 种不同图标（SVG 渲染）。
- **辅助图标库**：`lucide-react`（v0.563.0），仅在 3 个文件中使用 4 种图标（`Bot`, `X`, `Save`, `FileBraces`）。
- **内联 SVG**：`AiPart.tsx` 中有 3 个装饰性内联 SVG。
- **注意**：@ant-design/icons 默认以 SVG 形式渲染，在高 DPI 显示器上可能出现模糊，需确保 SVG 元素的 `width`/`height` 为 `100%` 或使用 `style={{ fontSize: 'inherit' }}` 使图标跟随父元素字体大小缩放。

## 开发注意事项

- `.npmrc` 指定了 Electron 镜像为 `npmmirror.com`。
- `dev` 命令中包含 `chcp 65001`（Windows UTF-8），确保中文路径正常。
- 上传文件限制 50MB，支持图片/音频/视频，按日期分目录存储。
- AI 流式回答：`POST /api/chat-stream` 返回 SSE，`GET /api/chat-cancel?requestId=` 取消。
- AI Agent：`POST /api/chat-agent` 使用 LangGraph StateGraph，支持工具调用循环。
- 构建时会过滤 `node_modules` 中的非必要文件（源码/文档/测试等），详见 `electron-builder.yml`。
- `out/` 是 Vite 构建产物目录；`build/` 是 electron-builder 中间产物，均 `.gitignore`。
- VSCode 调试配置在 `.vscode/launch.json`：Debug All 会同时启动主进程和渲染进程调试。
- ESLint 配置基于 `@electron-toolkit/eslint-config-ts` + Prettier + React hooks 规则。
- Tauri 构建产物在 `src-tauri/target/` 目录；前端构建产物在 `dist/renderer/`。
- Vite 配置 `vite.config.tauri.ts` 处理 Electron `electron` import 的剥离（replace-electron-imports 插件）。
