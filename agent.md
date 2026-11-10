# Agent 指南 — memo（多功能记事本）

## 一、项目概览

**memo** 是一个基于 [Wails v2](https://wails.io/) 的跨平台桌面应用，集成了记忆管理、日记、AI 聊天、AI 写书等功能。前后端通过 Wails 集成，后端同时暴露 HTTP API 供前端调用。

- **模块名**：`memo`
- **Go 版本**：1.25.0
- **后端 API 端口**：`32068`（常量见 `internal/config/config.go` 与 `frontend/src/constants/index.ts`）
- **前端技术栈**：React 19 + TypeScript + Vite + Tailwind CSS v4 + Zustand + Ant Design v6 + BlockNote/Lexical
- **后端技术栈**：Go + chi/v5（HTTP 路由） + modernc.org/sqlite（纯 Go SQLite） + OpenAI 兼容 API 客户端

---

## 二、目录结构

```
memo-memo-go/
├── main.go                 # 入口：初始化数据库、启动后端 API、启动 Wails
├── app.go                  # Wails 绑定的 App 结构体（最小占位）
├── wails.json              # Wails 构建配置
├── go.mod / go.sum         # Go 模块依赖
│
├── build/                  # 构建相关图标、Plist、NSIS 安装器脚本
│
├── frontend/               # 前端（React + Vite）
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts      # 别名：@renderer → src, @type → src/types
│   ├── tsconfig.json
│   ├── wailsjs/            # Wails 自动生成的 JS 绑定（勿手动修改）
│   │
│   └── src/
│       ├── main.tsx        # 应用入口
│       ├── App.tsx         # 主题初始化 + 路由挂载
│       ├── index.css       # 全局样式
│       │
│       ├── routes/         # React Router 路由定义（HashRouter）
│       │   └── index.tsx
│       │
│       ├── layouts/        # 主布局（Header + Sidebar + Outlet）
│       │   └── MainLayout.tsx
│       │
│       ├── components/     # 公共组件
│       │   ├── Header.tsx
│       │   ├── Sidebar.tsx
│       │   ├── BlockNoteEditor.tsx
│       │   ├── ChatPanel.tsx
│       │   ├── CommandPanel.tsx
│       │   ├── AntDesignThemeProvider.tsx
│       │   ├── WriterAssistant/   # 写书 AI 助手面板
│       │   └── common/            # 通用子组件
│       │
│       ├── pages/          # 业务页面
│       │   ├── home/       # 首页（快速导航、最近文件、待办、统计）
│       │   ├── chat/       # AI 聊天（SSE 流式）
│       │   ├── memo/       # 笔记管理
│       │   ├── diary/      # 日记（日历、待办、统计）
│       │   ├── book/       # AI 写书（书架 + 编辑器 + 多 Agent）
│       │   ├── person/     # API Key / 模型管理
│       │   ├── settings/   # 主题设置
│       │   └── web/        # 网址导航
│       │
│       ├── services/       # Axios API 调用层（统一 baseURL）
│       │   ├── index.ts    # axios 实例 + 公共接口
│       │   ├── agent.ts
│       │   ├── book.ts
│       │   ├── bookAgent.ts
│       │   ├── diary.ts
│       │   ├── memeoy.ts
│       │   ├── session.ts
│       │   └── usage.ts
│       │
│       ├── store/          # Zustand 全局状态
│       │   ├── app.ts              # 应用级状态（如是否进入书籍页面）
│       │   ├── useFileStore.ts     # 文件/记忆相关
│       │   ├── useUsageStore.ts    # 使用时长统计（后台跟踪）
│       │   └── useWriterStore.ts   # 写书模块状态
│       │
│       ├── hooks/          # 自定义 Hooks
│       │   ├── theme.ts           # 主题切换
│       │   ├── useAgent.ts
│       │   ├── useChat.ts
│       │   ├── useDiary.ts
│       │   └── useMemory.ts
│       │
│       ├── types/          # TypeScript 类型声明
│       ├── utils/          # 工具函数（日期、文件、本地存储、主题等）
│       ├── theme/          # CSS 主题文件（classic-black, deep-blue, vintage-paper 等）
│       └── constants/      # 常量（端口、AI 提示、默认列表等）
│
└── internal/               # Go 后端
    ├── config/
    │   └── config.go       # 端口、数据目录（dev: ./data, prod: /<系统盘>/.MemoryData）
    │
    ├── db/                 # SQLite 数据访问层
    │   ├── db.go           # Open/Close 数据库初始化
    │   ├── schema.go       # CREATE TABLE 语句 + ALTER 迁移
    │   ├── memory.go       # 记忆 CRUD
    │   ├── diary.go        # 日记 CRUD
    │   ├── session.go      # 会话 CRUD
    │   ├── agent.go        # Agent 模板 CRUD
    │   ├── book.go         # 书籍 CRUD
    │   ├── chapter.go      # 章节 CRUD
    │   ├── volume.go       # 卷 CRUD
    │   ├── bookagent.go    # 写书 Agent 状态
    │   ├── bookagent_state.go
    │   ├── scanutil.go     # 搜索工具
    │   ├── sqlutil.go      # SQL 辅助
    │   ├── id.go           # ID 生成器
    │   └── usage.go        # 使用统计
    │
    ├── server/             # HTTP 服务器 + 路由 + Handler
    │   ├── server.go       # Server 结构体（StartAsync / WaitReady / Stop）
    │   ├── router.go       # chi 路由总入口
    │   ├── handler_*.go    # 各类实体 Handler
    │   ├── routes_entity.go    # 注册所有实体路由
    │   ├── routes_chat.go      # 注册 AI 聊天路由（/chat-stream, /chat-agent, /chat-cancel）
    │   ├── routes_bookagent.go # 写书 Agent 路由
    │   └── routes_files.go     # 文件上传下载
    │
    ├── ai/                 # AI 客户端 & Agent 逻辑
    │   ├── llm.go          # OpenAI 兼容客户端（流式/非流式 + 工具调用）
    │   ├── chat.go         # 对话流、Agent 循环、内置工具（get_time/write_diary/get_memory）
    │   └── bookagent.go    # 写书多 Agent 编排（orchestrator/thinker/writer/editor/consistency）
    │
    ├── response/           # HTTP 响应封装 + SSE 写入器
    │   └── response.go
    │
    └── jsonx/
        └── jsonx.go        # JSON 辅助
```

---

## 三、架构图

### 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                        Wails v2 桌面窗口                       │
│  ┌────────────────────────────────────────────────────────┐  │
│  │           Frontend (React 19 + Vite)                    │  │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ │  │
│  │  │ home │ │ chat │ │memo  │ │diary │ │ book │ │ ...  │ │  │
│  │  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ │  │
│  │     └─────────┴────────┴────────┴────────┴────────┘     │  │
│  │                         │                                │  │
│  │                  services/ (axios)                        │  │
│  └─────────────────────────┼────────────────────────────────┘  │
│                            │ HTTP (localhost:32068)            │
│  ┌─────────────────────────┼────────────────────────────────┐  │
│  │  Backend (Go 1.25, chi/v5)                               │  │
│  │  ┌──────────────────────┼─────────────────────────────┐  │  │
│  │  │  /api/* Router  ─────┘                            │  │  │
│  │  │   ├── entity CRUD (memory, diary, session, ...)   │  │  │
│  │  │   ├── AI endpoints (/chat-stream, /chat-agent)    │  │  │
│  │  │   └── BookAgent endpoints                         │  │  │
│  │  └───────────────┬───────────────────────────────────┘  │  │
│  │                  │                                       │  │
│  │  ┌───────────────┼───────────────────────────────────┐  │  │
│  │  │ internal/db/ (SQLite via modernc.org/sqlite)        │  │  │
│  │  │ internal/ai/ (OpenAI 兼容 LLM 客户端 + Agent 逻辑) │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### AI 聊天流程

```
前端 ChatPanel / AIAssistantPanel
        │  POST /api/chat-stream  (SSE)
        │  POST /api/chat-agent
        ▼
server/routes_chat.go ───► ai/chat.go ───► ai/llm.go
                                             │
                                             ▼
                                    OpenAI 兼容 API
                                    (流式 / 非流式)
```

### 写书多 Agent 编排

```
User 需求
    │
    ▼
┌──────────────────┐  route("thinker")  ┌──────────────┐
│  Orchestrator     │◄───────────────────│   Thinker    │
│  (总调度员)       │                    │  (大纲构思)   │
└────────┬─────────┘                    └──────┬───────┘
         │ route("writer")                     │ 大纲
         ▼                                     │
┌──────────────────┐  route("editor")  ┌───────┴───────┐
│     Writer        │◄──────────────────│    Editor     │
│  (正文写作)       │                    │  (编辑润色)   │
└──────────────────┘                    └──────┬───────┘
                                                │
                                         ┌──────┴───────┐
                                         │  Consistency │
                                         │  (一致性检查) │
                                         └──────┬───────┘
                                                │
                                        还有未写章节？
                                          ├── 是 → route("writer") 写下一章
                                          └── 否 → route("end") 结束
```

---

## 四、数据库 Schema（SQLite）

| 表名 | 主键 | 说明 |
|------|------|------|
| `memorys` | `id` TEXT | 记忆/笔记（支持文件夹结构，`isFolder`、`parentId`、`starred`） |
| `diarys` | `id` TEXT | 日记，`monthDiarys` 存当月所有日期的 JSON |
| `sessions` | `id` TEXT | AI 聊天会话，`messages` 为 JSON 数组 |
| `agents` | `id` TEXT | 用户自定义 Agent 模板 |
| `books` | `id` TEXT | 书籍基本信息（封面、标签、设置） |
| `chapters` | `id` TEXT | 章节（`bookId` 外键，含字数统计、卷关联） |
| `volumes` | `id` TEXT | 卷（`bookId` 外键） |
| `bookUtils` | `id` TEXT | 书籍相关图片/素材 |
| `bookAgent` | `id` TEXT | 写书 Agent 运行记录 |
| `bookAgentState` | `bookId` TEXT | 写书 Agent 持久化状态（plan、progress、issues） |
| `usage_stats` | `date` TEXT | 使用时长统计（打字毫秒数、活跃毫秒数） |

### 数据目录

- **开发环境**：`<project_root>/data/`
- **生产环境**：`<系统盘>/.MemoryData/`
- SQLite 文件：`<DataDir>/storage.db`
- 上传目录：`<DataDir>/uploads/`（含 `files/` 和 `images/` 子目录）

---

## 五、HTTP API 一览

### 路由入口

```
GET  /uploads/*          静态资源（上传的文件/图片）
POST /upload             上传文件
DELETE /deleteFile       删除文件

GET  /api/memorySize     获取存储大小
```

### 实体 CRUD（`/api/*`，由 `registerEntityRoutes` 注册）

- **Memory**：记忆/笔记的增删改查、文件夹管理
- **Diary**：日记读写（按月存储）
- **Session**：AI 聊天会话管理
- **Agent**：Agent 模板管理
- **Book / Chapter / Volume**：书籍、章节、卷管理
- **BookAgent**：写书 Agent 运行记录与状态
- **Usage**：使用统计写入

### AI 接口（`/api/chat-*`）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat-stream` | 纯 SSE 流式对话（无工具） |
| POST | `/api/chat-agent` | Agent 工具调用循环（最多 10 轮） |
| GET  | `/api/chat-cancel` | 通过 `requestId` 取消进行中的请求 |

**SSE 事件类型**：
- `message` — 文本片段（流式）或最终回复（Agent）
- `tool_call` — Agent 开始调用某工具
- `tool` — Agent 工具返回结果
- `error` — 执行错误
- `cancel` — 被用户取消
- `done` — 结束（data: `[DONE]`）

### BookAgent 接口

由 `internal/server/routes_bookagent.go` 注册，负责写书多 Agent 的启动、查询状态、取消等操作。

---

## 六、AI 客户端

### LLM 调用方式

后端使用 OpenAI 兼容接口（`/chat/completions`），前端在 **个人中心 → API Key 管理** 页面配置模型名称与 Base URL，后端不保存预设。

- **模型配置**：`ai.ModelConfig{ Model, URL }`
- **支持**：流式（`Stream`）、非流式（`Chat`）、Function Calling（工具调用）
- **特殊处理**：若 BaseURL 包含 `openrouter.ai`，自动添加 `HTTP-Referer` 和 `X-Title` 请求头

### Agent 内置工具

| 工具名 | 说明 |
|--------|------|
| `get_time` | 获取当前时间（Asia/Shanghai 时区） |
| `write_diary` | 写入指定日期的日记（待办 + 备注） |
| `get_memory` | 搜索/列出用户记忆/笔记 |

### 写书多 Agent

写书采用多 Agent 编排，每个 Agent 有独立的 System Prompt，通过 `route` 工具切换到下一个角色：

1. **Orchestrator** — 总调度，只负责切换流程
2. **Thinker** — 根据需求输出书籍大纲（"一句话核心" + 章节结构）
3. **Writer** — 按大纲逐章写作
4. **Editor** — 对 Writer 输出进行润色
5. **Consistency** — 检查前后一致性，返回"通过"或问题列表

状态持久化在 `bookAgentState` 表中，包括 `plan`、`progress`（已完成章节）、`issues`（问题列表）。

---

## 七、前端状态管理

### Zustand Store

| Store | 文件 | 用途 |
|-------|------|------|
| `useAppStore` | `store/app.ts` | 应用级状态（`isBookScreen`：是否进入书籍编辑界面） |
| `useFileStore` | `store/useFileStore.ts` | 记忆/文件管理 |
| `useUsageStore` | `store/useUsageStore.ts` | 使用时长后台跟踪（`App.tsx` 中 `startUsageTracker()` 启动） |
| `useWriterStore` | `store/useWriterStore.ts` | 写书模块状态（当前书籍、章节、内容等） |

### 主题系统

- 9 套内置 CSS 主题：classic-black, minimalism, modern-dark, eye-care, deep-blue, vintage-paper, premium-gray, blue
- 通过 `localStorage` 保存用户选择的主题索引
- `App.tsx` 启动时调用 `setTheme()` 应用

### 路由

- 使用 `HashRouter`（Electron/Wails 桌面端需要）
- 9 个页面路由，统一通过 `MainLayout` 布局（Header + Sidebar + Outlet）

---

## 八、开发与构建

### 环境要求

- Go ≥ 1.25.0
- Node.js（建议 20+）
- npm

### 常用命令

```bash
# 安装 Go 依赖
go mod download

# 安装前端依赖
cd frontend && npm install

# 开发模式（热重载）
wails dev

# 仅前端开发（独立运行 Vite）
cd frontend && npm run dev

# 构建前端
cd frontend && npm run build

# 构建桌面应用
wails build
```

### 前端路径别名（`vite.config.ts`）

```ts
alias: {
  "@renderer": path.resolve(__dirname, "src"),
  "@type":     path.resolve(__dirname, "src/types"),
}
```

### 后端初始化流程（`main.go`）

```
main()
 ├── db.Open()           # 初始化 SQLite 数据库（创建表 + 执行迁移）
 ├── apiServer.StartAsync()  # 启动 chi HTTP 服务器（后台 goroutine）
 ├── apiServer.WaitReady(3s) # 等待端口就绪
 └── wails.Run()         # 启动 Wails 应用窗口
      ├── OnStartup: App.startup
      └── OnShutdown: App.shutdown → apiServer.Stop + db.Close
```

---

## 九、关键技术决策

| 决策 | 说明 |
|------|------|
| SQLite 纯 Go 实现 | 使用 `modernc.org/sqlite`，无需 CGO，跨平台编译无依赖 |
| HTTP API 替代 Wails Bind | 后端启动独立 HTTP 服务器（端口 32068），前端通过 axios 调用，避免 Wails Bind 类型同步问题 |
| HashRouter | 桌面应用必须使用 HashRouter，BrowserHistory 无法工作 |
| SSE 流式 AI | 使用 Server-Sent Events 而非 WebSocket，实现简单且单向即可满足 AI 输出 |
| 多 Agent 写书编排 | 5 个角色（orchestrator → thinker → writer → editor → consistency），每个 Agent 有独立 System Prompt 和工具集 |
| 数据目录区分 dev/prod | 开发期数据存在项目内便于调试，生产期存在系统根目录 |

---

## 十、代码修改注意事项

### 前端（React/TypeScript）

1. **路径别名**：使用 `@renderer/xxx` 和 `@type/xxx`，不要写相对路径 `../../xxx`
2. **API 调用**：统一通过 `frontend/src/services/` 下的 axios 实例，不要裸写 fetch
3. **HTTP 端口**：`frontend/src/constants/index.ts` 中的 `port = 32068` 需与后端保持一致
4. **主题**：新增主题需在 `App.tsx` 顶部 import 并确保 CSS 变量（`--bg-secondary`、`--text-primary` 等）已定义
5. **HashRouter**：不要切换到 BrowserRouter，桌面端不支持
6. **类型**：所有 API 响应类型在 `frontend/src/types/` 下定义

### 后端（Go）

1. **路由注册**：新增实体路由需在 `registerEntityRoutes` 或对应分组函数中注册
2. **响应格式**：实体 CRUD 返回 `{code, data, message}`；AI 接口返回 SSE
3. **SSE 写入**：通过 `response.StartSSE(w)` 获取 Emitter，不要手动写 `event-stream`
4. **数据库**：SQLite 操作通过 `internal/db/` 层封装，禁止在 handler 中直接写 SQL
5. **LLM 客户端**：`ai.Client` 是 OpenAI 兼容的通用客户端，新增模型无需改代码
6. **沙箱环境**：Go 和 SQLite 均为纯实现，无 CGO 依赖，跨平台编译无障碍

---

## 十一、快速开始 Checklist

- [ ] `go mod download` — Go 依赖
- [ ] `cd frontend && npm install` — 前端依赖
- [ ] `wails dev` — 启动开发模式
- [ ] 打开 AI 聊天页面，输入 API Key 后测试 `/api/chat-stream`
- [ ] 打开写书页面，测试 BookAgent 多 Agent 流程
