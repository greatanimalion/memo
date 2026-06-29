# memo — Electron + React + TypeScript 桌面应用

## 开发命令

```bash
npm run dev        # 启动 dev（自动 chcp 65001）
npm run build      # typecheck + electron-vite build
npm run lint       # ESLint（eslint.config.mjs）
npm run format     # Prettier（--write .）
npm run typecheck  # tsc --noEmit for node + web tsconfigs
npm run start      # electron-vite preview（预览已构建产物）
npx create ...     # 如果用老旧 buildPlugin 流程要手动
```

- 单测/集成测试不存在；无测试框架。
- `build:win` / `build:mac` / `build:linux` 用于打包分发包。

## 项目结构

```
src/
  main/           Electron 主进程 + Express 服务器
    index.ts      主进程入口
    server/       Express API（端口 32068）
      routes/     CRUD 路由：memory, diary, session, agent, ai
      controllers/
      services/
      config/
  preload/        预加载脚本（contextIsolation: false, nodeIntegration: true）
  renderer/       React 前端（Vite）
    src/
      components/
      hooks/
      pages/      路由页面：chat, home, memo, diary, settings, person, web, textEditor
      services/   Axios 客户端（baseURL http://localhost:32068/）
      store/      Zustand 状态管理
      utils/
      routes/     React Router v7（createBrowserRouter）
  types/          共享 TS 类型（entities: Memory, Diary, Session, MyAgent）
plugins/          Vite 插件（devPlugin 替换 Node 模块引用）
```

## 架构要点

- **Express 服务器**在 Electron 主进程内启动，端口 `32068`，`startExpressServer()` 在 `ready-to-show` 后调用。
- **安全设置特殊**：`contextIsolation: false` + `nodeIntegration: true` + `sandbox: false` — 渲染进程可直接 `require`。
- **自定义 `app:` 协议**：`protocol.registerSchemesAsPrivileged` (bypass CSP) ，`src/main/customScheme.ts` 也可用但 `index.ts` 中已注册。
- **TailwindCSS v4** 通过 `@tailwindcss/vite` 插件引入（`@import "tailwindcss"` 在 CSS 顶部）。
- **AI 模型**配置在 `src/main/server/config/ai.config.ts`，支持 qwen-plus / glm-5.1 / deepseek / openRouter，API URL 和 key 来自 store。
- **存储**使用 `better-sqlite3`，通过 `StorageService` 封装。
- **窗口**无边框 (`frame: false`)；拖拽区域用 CSS class `.dragArea` / `.noDragArea`。
- **主题**：通过 `setTheme()` 更改 CSS 变量实现全局颜色切换，暗色模式通过 `prefers-color-scheme: dark`。
- **本地存储**：`utils/localStore.ts` 封装 `localStorage`（theme, \_border 等）。
- **路由**：`createBrowserRouter`，所有页面在 `MainLayout` 下。

## 开发注意事项

- `.npmrc` 指定了 Electron 镜像为 `npmmirror.com`。
- `dev` 命令中包含 `chcp 65001`（Windows UTF-8），确保中文路径正常。
- 上传文件限制 50MB，支持图片/音频/视频，按日期分目录存储。
- AI 流式回答：`POST /api/chat-stream` 返回 SSE，`GET /api/chat-cancel?requestId=` 取消。
- 构建时会过滤 `node_modules` 中的非必要文件（源码/文档/测试等），详见 `electron-builder.yml`。
- `out/` 是 Vite 构建产物目录；`build/` 是 electron-builder 中间产物，均 `.gitignore`。
- VSCode 调试配置在 `.vscode/launch.json`：Debug All 会同时启动主进程和渲染进程调试。
- ESLint 配置基于 `@electron-toolkit/eslint-config-ts` + Prettier + React hooks 规则。

## 文本编辑器模块（textEditor / WriterAssistant）

`/textEditor` 路由提供了一个完整的写作工具，支持多章节、分卷管理的长文写作。

### 页面入口

- `pages/textEditor.tsx` — 三栏布局：左侧 `VirtualTextEditor` + 右侧 `AIAssistantPanel`

### 核心组件

| 组件 | 文件 | 职责 |
|------|------|------|
| **VirtualTextEditor** | `components/VirtualTextEditor.tsx` | 三栏布局：左栏章节/分卷管理树 + 中栏纯文本编辑区（textarea）+ 右栏字体设置/字数统计/章节详情 |
| **AIAssistantPanel** | `components/WriterAssistant/AIAssistantPanel.tsx` | AI 辅助侧边栏，含续写/润色/摘要快捷标签，对话功能目前为占位 |

### 状态管理

- **Zustand Store**: `store/useWriterStore.ts`
- 管理：`Book`（标题/作者/封面）、`Chapter[]`（章节列表）、`Volume[]`（分卷列表）、`editorSettings`（字体/字号/行高/字重）、`aiPanelOpen`
- **已实现后端持久化**：页面加载时调用 `loadBook()` 加载第一本书（或创建默认书），每 5 秒自动保存（`saveBook()`），所有变更操作标记 `_dirty: true`

### 类型定义

- `types/common.ts` — `FontFamily`, `EditorSettings` 以及重导出的 `Book`, `Chapter`, `Volume`
- `types/book.d.ts` — `Book`, `Chapter`, `Volume`, `BookSettings`, `ChapterMetadata`, `BookUtils` 等完整类型

### 后端持久化

| 层 | 文件 | 说明 |
|----|------|------|
| 路由 | `server/routes/book.routes.ts` | `GET/POST/PUT/DELETE /api/books` |
| 控制器 | `server/controllers/book.controller.ts` | 请求处理，CRUD 委托给 service |
| Service | `server/services/book.service.ts` | 业务逻辑层 |
| Repository | `server/repositories/books.repository.ts` | 数据访问层 |
| DB | `server/db/book.ts` | SQLite 存储，`chapters`/`volumes`/`settings` 以 JSON 字符串存储 |
| 前端 API | `services/book.ts` | Axios 封装（`getAllBooks`, `createBook`, `updateBook` 等） |

**注意**：`books` 表的 `chapters`、`volumes`、`settings` 字段均以 JSON 字符串存储，通过 `BookDatabase.parseBook()` 自动解析。`settings` 字段存放 `maxChapterWords`、`wordCountMode` 等配置。

## Service 层规范

`services/` 目录统一通过 `services/index.ts` 封装的工具函数进行 API 调用：

```ts
getAll<T>(url)       // GET 请求，返回 T[]（失败返回 []）
getById<T>(url)      // GET 请求，返回 T | null
createItem<T>(url)   // POST 请求，返回 T | null
updateItem<T>(url)   // PUT 请求，返回 T | null
deleteItem(url)      // DELETE 请求，返回 boolean
```

所有请求自动处理 try-catch 和错误日志，不需要在业务代码中重复编写。特殊请求（文件上传、SSE 流式请求）直接在 service 文件中使用 `api` 实例。每个 service 文件应优先使用这五个工具函数。
