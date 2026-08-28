# 后端代码参考（Backend Reference）

> **每次修改/访问后端代码前，先读取本文档。**

## 技术栈

- Express 服务器，端口 `32068`
- better-sqlite3（单文件数据库 `storage.db`）
- multer（文件上传，限制 50MB）
- LangChain + LangGraph（AI 服务）

## 项目结构

```
src/main/server/
  index.ts              Express 服务器入口（路由挂载、文件上传、静态服务）
  config/
    ai.config.ts        AI 模型配置
    database.config.ts  数据库配置（journalMode 等）
  constants/
    sql.ts              建表 SQL（7 张表）
  db/
    index.ts            DatabaseHelper 单例，管理所有 Database 实例
    base.ts             BaseDatabase 基类
    memory.ts           MemoryDatabase
    diary.ts            DiaryDatabase
    session.ts          SessionDatabase
    agent.ts            AgentDatabase
    book.ts             BookDatabase（含 bookUtils CRUD）
    chapter.ts          ChapterDatabase
    volume.ts           VolumeDatabase
  routes/               Express Router 定义
  controllers/          请求处理（调用 Service，返回统一响应）
  services/             业务逻辑
    memory.service.ts   记忆管理（含文件 CRUD）
    diary.service.ts    日记管理
    session.service.ts  会话管理
    agent.service.ts    Agent 管理
    book.service.ts     书籍/章节/卷 管理
    storage.service.ts  存储服务（数据库大小、导出）
    ai/
      ai.service.ts     普通流式聊天（ChatOpenAI）
      langgraph.service.ts  Agent 模式（StateGraph + 工具调用）
  repositories/         数据库访问层（封装 SQL 操作）
  middleware/
    error.middleware.ts  日志/404/错误中间件
  utils/
    asyncHandler.ts     async 路由包装
    response.ts         统一响应格式（successResponse/errorResponse/createdResponse）
    logger.ts           日志工具
    utils.ts            路径工具（getUploadPath, getDatabasePath 等）
```

---

## 数据库表结构

### 1. `memorys` — 记忆/笔记

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PK | 唯一 ID |
| `isFolder` | INTEGER | 是否为文件夹（0=文件, 1=文件夹） |
| `title` | TEXT | 标题 |
| `fileUrl` | TEXT | 文件路径（如 `/uploads/files/...`） |
| `parentId` | TEXT | 父级文件夹 ID（顶层为 null） |
| `created` | INTEGER | 创建时间戳 |
| `updated` | INTEGER | 更新时间戳 |
| `visitedTime` | INTEGER | 最后访问时间戳 |
| `size` | INTEGER | 文件大小（字节） |
| `starred` | INTEGER | 是否收藏（0=否, 1=是） |

### 2. `diarys` — 日记

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PK | 日期 ID（格式 `YYYY-MM`） |
| `monthDiarys` | TEXT | JSON 字符串，结构见下方 |

```ts
// monthDiarys JSON 结构
{
  [day: string]: {       // 日期 key，如 "1", "15"
    todos: { id: number; text: string; completed: boolean }[];
    note?: string;        // 日记备注
  }
}
```

### 3. `sessions` — AI 会话

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PK | 唯一 ID |
| `title` | TEXT | 会话标题（默认 "新的会话"） |
| `lastUpdated` | TEXT | 最后更新时间 |
| `messages` | TEXT | JSON 字符串，`Message[]` 数组 |
| `description` | TEXT | 会话描述（可选） |

```ts
// messages 数组元素
{ role: "user" | "assistant"; content: string; timestamp?: number }
```

### 4. `agents` — 自定义 Agent

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PK | 唯一 ID |
| `name` | TEXT | Agent 名称 |
| `description` | TEXT | 描述 |
| `content` | TEXT | 内容/提示词 |

### 5. `books` — 书籍

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PK | 唯一 ID |
| `title` | TEXT | 书名 |
| `author` | TEXT | 作者 |
| `cover` | TEXT | 封面 URL（默认 ''） |
| `tags` | TEXT | JSON 数组 `'[]'`，如 `["科幻","经典"]` |
| `settings` | TEXT | JSON 对象 `'{}'`，含 `maxChapterWords`、`wordCountMode` |
| `description` | TEXT | 描述（迁移添加） |
| `createdAt` | INTEGER | 创建时间戳（迁移添加） |
| `updatedAt` | INTEGER | 更新时间戳（迁移添加） |

### 6. `chapters` — 章节

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PK | 唯一 ID |
| `bookId` | TEXT FK→books | 所属书籍 ID |
| `title` | TEXT | 章节标题 |
| `content` | TEXT | 内容（HTML，默认 ''） |
| `wordCount` | INTEGER | 字数（默认 0） |
| `volumeId` | TEXT | 所属卷 ID（可选） |
| `order` | INTEGER | 排序（默认 0） |
| `createdAt` | INTEGER | 创建时间戳 |
| `updatedAt` | INTEGER | 更新时间戳 |
| `metadata` | TEXT | JSON `'{}'`，含 `aiEnhanced`、`tags`、`summary` |

### 7. `volumes` — 卷

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PK | 唯一 ID |
| `bookId` | TEXT FK→books | 所属书籍 ID |
| `title` | TEXT | 卷标题 |
| `order` | INTEGER | 排序（默认 0） |
| `createdAt` | INTEGER | 创建时间戳 |

### 8. `bookUtils` — 书籍工具数据

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PK | 唯一 ID |
| `BookID` | TEXT | 关联书籍 ID |
| `image` | TEXT | JSON 数组，图片 URL 列表 |
| `type` | TEXT | 工具类型 |
| `description` | TEXT | 描述 |
| `list` | TEXT | JSON 数组，`BookUtilsAttribute[]` |
| `createTime` | TEXT | 创建时间 |

---

## API 接口一览

基础路径：`http://localhost:32068/api`

### Memory（记忆/笔记）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/memorys` | 获取所有记忆 |
| GET | `/memorys/:id` | 获取单个记忆（自动更新 visitedTime） |
| GET | `/memorys/get_children/:id` | 获取某文件夹下的子项 |
| GET | `/memorys_recent` | 获取最近 5 天访问过的记忆 |
| GET | `/memorys_starred` | 获取所有收藏的记忆 |
| POST | `/memorys` | 创建记忆（文件夹或笔记） |
| PUT | `/memorys/:id` | 更新记忆（含文件内容写入） |
| DELETE | `/memorys/:id` | 删除记忆（含文件删除） |
| POST | `/memory/star/:id` | 切换收藏状态 |

### Diary（日记）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/diarys/:id` | 获取某月日记（id 格式 `YYYY-MM`） |
| PUT | `/diarys/:id` | 更新/创建日记（upsert） |

### Session（AI 会话）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/sessions` | 获取所有会话 |
| GET | `/sessions/:id` | 获取单个会话（含 messages） |
| POST | `/sessions` | 创建新会话 |
| PUT | `/sessions/:id` | 更新会话（标题、消息等） |
| DELETE | `/sessions/:id` | 删除会话 |

### Agent（自定义 Agent）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/agents` | 获取所有 Agent |
| POST | `/agents` | 创建 Agent |
| PUT | `/agents/:id` | 更新 Agent（不存在则创建） |
| DELETE | `/agents/:id` | 删除 Agent |

### AI（AI 服务）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/chat-stream` | 流式聊天（SSE），body: `{ prompt, history, model, apiKey, requestId }` |
| POST | `/chat-agent` | Agent 模式聊天（LangGraph 工具调用），body: `{ prompt, history, model, apiKey }` |
| GET | `/chat-cancel?requestId=` | 取消正在进行的 AI 请求 |

支持的 model 类型：`qwen-plus` | `glm-5.1` | `deepseek` | `openRouter`

### Book（书籍/章节/卷）

#### 书籍

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/books` | 获取所有书籍 |
| GET | `/books/:id` | 获取单个书籍 |
| GET | `/books/:id/detail` | 获取书籍详情（含 chapters 元数据 + volumes） |
| POST | `/books` | 创建书籍（自动创建默认第1章） |
| PUT | `/books/:id` | 更新书籍信息 |
| DELETE | `/books/:id` | 删除书籍（级联删除 chapters + volumes） |

#### 章节

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/books/:bookId/chapters` | 获取书籍下所有章节（含 content） |
| GET | `/chapters/:id` | 获取单个章节（含 content） |
| POST | `/chapters` | 创建章节（自动计算 order） |
| PUT | `/chapters/:id` | 更新章节（content、title 等） |
| DELETE | `/chapters/:id` | 删除章节 |

#### 卷

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/books/:bookId/volumes` | 获取书籍下所有卷 |
| GET | `/volumes/:id` | 获取单个卷 |
| POST | `/volumes` | 创建卷（自动计算 order） |
| PUT | `/volumes/:id` | 更新卷 |
| DELETE | `/volumes/:id` | 删除卷 |

### 文件上传（独立路由）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/upload` | 上传文件（multipart/form-data, field: `file`） |
| DELETE | `/deleteFile` | 删除文件，body: `{ filePath }` |
| GET | `/api/memorySize` | 获取数据库文件大小 |

### 静态文件服务

- `/uploads/*` → 映射到上传目录（图片/音频/视频）

---

## 业务逻辑要点

### Memory
- 创建非文件夹项时自动在磁盘创建空 HTML 文件
- 更新时同步写入文件内容并计算 size
- 删除时同步删除磁盘文件
- `getRecent` 返回 5 天内访问过的，按 visitedTime 降序

### Book
- 创建书籍时若无 chapters 则自动创建"第1章"
- 删除书籍级联删除 chapters 和 volumes
- `getBookDetail` 返回 book + chapters(不含 content) + volumes
- 章节按 `order` 字段排序

### AI
- 流式聊天用 `@langchain/openai` ChatOpenAI，支持 abort
- Agent 模式用 LangGraph StateGraph，内置工具：`get_time`、`write_diary`
- 历史消息最多取最近 10 条

### 文件存储
- 开发环境：`src/main/data/uploads/`
- 生产环境：`<appRoot>/.MemoryData/uploads/`
- 按日期分目录：`YYYY/MM/DD/`
- 数据库路径：`<对应环境>/.MemoryData/storage.db` 或 `data/storage.db`
