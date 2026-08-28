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
      routes/     CRUD 路由：memory, diary, session, agent, ai, book
      controllers/
      services/   book.service.ts, storage.service.ts, ai.service.ts
      config/     ai.config.ts
      db/         数据库层：book.ts, chapter.ts, volume.ts, index.ts（迁移+自动建表）
  preload/        预加载脚本（contextIsolation: false, nodeIntegration: true）
  renderer/       React 前端（Vite）
    src/
      components/ Header.tsx, BlockNoteEditor.tsx 等
      hooks/
      pages/      路由页面：chat, home, memo, diary, settings, person, web, book
        book/     book.tsx（入口）
          components/ EditorArea.tsx, LeftPanel.tsx, RightPanel.tsx, Bookshelf.tsx
      services/   Axios 客户端（baseURL http://localhost:32068/），book.ts（API 封装）
      store/      Zustand 状态管理（useWriterStore 管理编辑器状态）
      utils/      localStore.ts, helper.ts
      routes/     React Router v7（createBrowserRouter）
  types/          共享 TS 类型（entities: Memory, Diary, Session, MyAgent, Book/Chapter/Volume）
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
- **本地存储**：`utils/localStore.ts` 封装 `localStorage`（theme, _border 等）。
- **路由**：`createBrowserRouter`，所有页面在 `MainLayout` 下。
- **数据库三表拆分**：`books` / `chapters` / `volumes`，外键关联，`order` 字段管理排序。
- **Lexical 编辑器**：Tab 键通过 `registerCommand(KEY_TAB_COMMAND)` 插入制表符；内容按需加载（`getMetaByBookId` 不加载 content，切换章节时单独 fetch）。
- **编辑器设置持久化**：`editorSettings` + `editorBg` 存入 localStorage（key: `writer-editor-settings`），启动时自动恢复。
- **章节保存**：自动保存（1s debounce）/ 手动保存（按钮触发 `PUT /api/chapters/:id`）双模式；`setCurrentChapter` 先 await API 再原子更新 state，避免空内容竞态。

## 开发注意事项

- `.npmrc` 指定了 Electron 镜像为 `npmmirror.com`。
- `dev` 命令中包含 `chcp 65001`（Windows UTF-8），确保中文路径正常。
- 上传文件限制 50MB，支持图片/音频/视频，按日期分目录存储。
- AI 流式回答：`POST /api/chat-stream` 返回 SSE，`GET /api/chat-cancel?requestId=` 取消。
- 构建时会过滤 `node_modules` 中的非必要文件（源码/文档/测试等），详见 `electron-builder.yml`。
- `out/` 是 Vite 构建产物目录；`build/` 是 electron-builder 中间产物，均 `.gitignore`。
- VSCode 调试配置在 `.vscode/launch.json`：Debug All 会同时启动主进程和渲染进程调试。
- ESLint 配置基于 `@electron-toolkit/eslint-config-ts` + Prettier + React hooks 规则。
