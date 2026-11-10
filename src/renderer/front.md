# 前端架构文档

## 技术栈

| 技术 | 版本/说明 |
|------|-----------|
| React | 18+，函数组件 + Hooks |
| TypeScript | 严格模式 |
| Vite | 构建工具（electron-vite） |
| TailwindCSS v4 | `@tailwindcss/vite` 插件，`@import "tailwindcss"` |
| Ant Design 5 | UI 组件库，通过 `ConfigProvider` 动态适配主题 |
| Zustand | 状态管理（轻量级） |
| React Router v7 | `createBrowserRouter` 路由 |
| Axios | HTTP 客户端，baseURL `http://localhost:32068/` |
| BlockNote | 富文本编辑器（`@blocknote/core` + `@blocknote/mantine`） |

## 目录结构

```
src/renderer/src/
├── App.tsx                    # 根组件：初始化主题 + AntDesignThemeProvider + RouterProvider
├── main.tsx                   # 入口
├── index.css                  # 全局样式 + CSS 变量 + TailwindCSS + 工具类 + BlockNote 适配
│
├── routes/
│   └── index.tsx              # createBrowserRouter，所有路由在 MainLayout 下
│
├── layouts/
│   └── MainLayout.tsx         # 主布局：Header + Sidebar + Outlet（书本页隐藏 Sidebar）
│
├── components/
│   ├── Header.tsx             # 顶部栏：应用名 + 窗口控制（最小化/最大化/关闭）+ 拖拽区域
│   ├── Sidebar.tsx            # 左侧导航：首页/备忘录/日记/AI聊天/文本编辑器/Web/设置
│   ├── BlockNoteEditor.tsx    # BlockNote 富文本编辑器封装
│   ├── AntDesignThemeProvider.tsx  # Ant Design 主题桥接：监听 body class 变化 → 动态更新 ConfigProvider
│   ├── AiPart.tsx             # AI 相关组件
│   ├── ChatPanel.tsx          # 聊天面板
│   ├── CommandPanel.tsx       # 命令面板
│   ├── PathNavigation.tsx     # 路径导航
│   └── WriterAssistant/       # 写作助手
│       ├── index.ts
│       └── AIAssistantPanel.tsx
│
├── pages/
│   ├── home/                  # 首页：时钟 + 最近文件 + 收藏文件
│   │   ├── home.tsx
│   │   └── components/        # TimeDisplay, StarredFiles, RecentFiles, clock
│   ├── memo/                  # 备忘录：文件管理
│   │   ├── memo.tsx
│   │   └── components/FileManager.tsx
│   ├── diary/                 # 日记：日历视图 + 待办 + 统计
│   │   ├── diary.tsx
│   │   └── components/        # CalendarView, DiaryModal, TodoList, StatsCards
│   ├── chat/                  # AI 聊天：会话列表 + 消息区
│   │   ├── chat.tsx
│   │   └── components/        # SessionList, MessageArea, ResumeModal
│   ├── book/                  # 文本编辑器（写书）
│   │   ├── book.tsx           # 入口：书架/编辑器切换
│   │   └── components/
│   │       ├── Bookshelf.tsx       # 书架：书籍列表
│   │       ├── LeftPanel.tsx       # 左侧：章节管理 + 分卷
│   │       ├── EditorArea.tsx      # 编辑区：BlockNote 编辑器
│   │       ├── RightPanel.tsx      # 右侧：属性面板
│   │       └── BookAgentModal.tsx  # AI 写书工作台（多 Agent 流式面板）
│   ├── settings/              # 设置
│   │   ├── settings.tsx
│   │   └── components/ThemeSelector.tsx  # 主题选择器（8 种主题）
│   ├── person/                # 个人：API Key 管理
│   │   ├── person.tsx
│   │   └── components/        # ApiKeyList, AddKeyForm, DocumentModelManager
│   └── web/                   # Web 网站导航
│       ├── web.tsx
│       └── components/        # WebsiteGrid, WebsiteForm
│
├── store/
│   ├── app.ts                 # useAppStore：isBookScreen 全局状态
│   ├── useWriterStore.ts      # useWriterStore：书籍/章节/卷/编辑器状态 + CRUD 操作
│   └── useFileStore.ts        # useFileStore：文件管理
│
├── services/
│   ├── index.ts               # Axios 实例（baseURL: localhost:32068）
│   ├── book.ts                # Book/Chapter/Volume API
│   ├── diary.ts               # 日记 API
│   ├── agent.ts               # 智能体 API
│   ├── session.ts             # 会话 API
│   └── memeoy.ts              # 备忘录 API
│
├── hooks/
│   ├── theme.ts               # setTheme()：主题编号 → body class 映射
│   ├── useChat.ts             # 聊天逻辑
│   ├── useAgent.ts            # 智能体逻辑
│   ├── useDiary.ts            # 日记逻辑
│   └── useMemory.ts           # 备忘录逻辑
│
├── utils/
│   ├── localStore.ts          # localStorage 封装（setLocalStore / getLocalStore）
│   ├── themeUtils.ts          # getAntdThemeFromCSS()：CSS 变量 → Ant Design ThemeConfig
│   ├── helper.ts              # 工具函数（generateUUID 等）
│   ├── fileUtils.ts           # 文件工具
│   ├── dateUtils.ts           # 日期工具
│   ├── stringUtils.ts         # 字符串工具
│   └── number.ts              # 数字工具
│
├── constants/
│   └── index.ts               # 常量：port=32068, AI_PROMPTS, webListcontent 等
│
├── types/
│   ├── common.ts              # ViewType, MessageType, AIKey, FontFamily, EditorSettings 等
│   └── file.ts                # 文件类型
│
└── theme/                     # 主题 CSS 文件（9 种主题）
    ├── classic-black.css      # 经典黑白
    ├── minimalism.css         # 极简主义
    ├── modern-dark.css        # 现代暗黑
    ├── eye-care.css           # 护眼豆沙
    ├── deep-blue.css          # 深海蓝调
    ├── vintage-paper.css      # 复古羊皮纸
    ├── premium-gray.css       # 高级灰
    ├── blue.css               # 深蓝色
    └── dark.css               # 暗色（备用）
```

## 主题系统

### CSS 变量定义

每个主题文件定义相同的 CSS 变量集，通过 `.theme-{name}` class 作用域隔离：

| 变量分类 | 变量名 | 说明 |
|----------|--------|------|
| **基础颜色** | `--bg-color` | 页面背景色 |
| | `--text-color` | 页面文字色 |
| **语义颜色** | `--primary-color` | 主色调 |
| | `--secondary-color` | 辅助色 |
| | `--accent-color` | 强调色 |
| **边框** | `--border-color` | 边框色 |
| | `--border-light` | 浅边框色 |
| **背景变体** | `--bg-primary` | 主背景 |
| | `--bg-secondary` | 次背景 |
| | `--bg-tertiary` | 三级背景 |
| | `--bg-hover` | 悬浮背景 |
| | `--bg-active` | 激活背景 |
| **文本变体** | `--text-primary` | 主文字 |
| | `--text-secondary` | 次文字 |
| | `--text-tertiary` | 三级文字 |
| | `--text-muted` | 弱化文字 |
| **功能颜色** | `--success-color` | 成功 |
| | `--warning-color` | 警告 |
| | `--error-color` | 错误 |
| | `--info-color` | 信息 |
| **滚动条** | `--scrollbar-track` | 轨道 |
| | `--scrollbar-thumb` | 滑块 |
| **阴影** | `--shadow-sm` / `--shadow-md` / `--shadow-lg` | 三级阴影 |

### 主题编号映射

| 编号 | class 名 | 名称 | 类型 |
|------|----------|------|------|
| 0 | `theme-classic-black` | 经典黑白 | 暗色 |
| 1 | `theme-minimalism` | 极简主义 | 亮色 |
| 2 | `theme-modern-dark` | 现代暗黑 | 暗色 |
| 3 | `theme-eye-care` | 护眼豆沙 | 亮色 |
| 4 | `theme-deep-blue` | 深海蓝调 | 暗色 |
| 5 | `theme-vintage-paper` | 复古羊皮纸 | 亮色 |
| 6 | `theme-premium-gray` | 高级灰 | 暗色 |
| 7 | `theme-blue` | 深蓝色 | 暗色 |

### 主题切换流程

```
App.tsx useEffect
  → getLocalStore("theme") 获取编号
  → setTheme(number)          // hooks/theme.ts
    → document.body.classList.remove(所有主题 class)
    → document.body.classList.add("theme-{name}")

Body class 变化
  → MutationObserver 捕获（AntDesignThemeProvider）
    → getAntdThemeFromCSS()   // utils/themeUtils.ts
      → getComputedStyle(document.body) 读取 CSS 变量
      → 构造 Ant Design ThemeConfig
    → ConfigProvider 更新 antd 组件主题
    → 同时判断 isDarkTheme() → 切换 darkAlgorithm
```

### TailwindCSS 工具类（index.css）

`index.css` 中定义了与 CSS 变量对应的工具类，用于 TailwindCSS class 中使用主题色：

```css
/* 背景类 */
.bg-theme          → var(--bg-color)
.bg-theme-primary  → var(--bg-primary)
.bg-theme-secondary → var(--bg-secondary)
.bg-theme-tertiary → var(--bg-tertiary)
.bg-theme-hover    → var(--bg-hover)
.bg-theme-active   → var(--bg-active)

/* 文字类 */
.text-theme          → var(--text-color)
.text-theme-primary  → var(--text-primary)
.text-theme-secondary → var(--text-secondary)
.text-theme-tertiary → var(--text-tertiary)
.text-theme-muted    → var(--text-muted)

/* 边框类 */
.border-theme       → var(--border-color)
.border-theme-light → var(--border-light)

/* 功能颜色 */
.text-success / .bg-success  → var(--success-color)
.text-warning / .bg-warning  → var(--warning-color)
.text-error / .bg-error      → var(--error-color)
.text-info / .bg-info        → var(--info-color)

/* 强调色 */
.text-accent / .bg-accent / .border-accent → var(--accent-color)
.bg-accent-light    → color-mix(in srgb, var(--accent-color) 10%, transparent)
.border-accent-light → color-mix(in srgb, var(--accent-color) 20%, transparent)

/* 阴影 */
.shadow-theme-sm / .shadow-theme-md / .shadow-theme-lg
```

### BlockNote 编辑器主题适配

`index.css` 将 app 的 CSS 变量映射到 BlockNote 的 `--bn-*` 变量：

- **暗色主题组**（classic-black, modern-dark, dark, deep-blue, blue, premium-gray）→ `color-scheme: dark`
- **亮色主题组**（minimalism, eye-care, vintage-paper）→ `color-scheme: light`

映射关系：`--bn-colors-editor-text` → `--text-color`，`--bn-colors-editor-background` → `--bg-color`，以此类推。

## 路由

```typescript
// routes/index.tsx
"/"           → MainLayout（Header + Sidebar + Outlet）
  "/" (index) → HomePage
  "/chat"     → ChatPage
  "/home"     → HomePage
  "/memo"     → MemoPage
  "/settings" → SettingPage
  "/diary"    → DiaryPage
  "/person"   → PersonPage
  "/web"      → WebPage
  "/book"     → BookPage
```

## 状态管理

### useAppStore（Zustand）
- `isBookScreen: boolean` — 是否在书本全屏编辑模式（控制 Sidebar 显隐）

### useWriterStore（Zustand）
- `book: BookDetail` — 当前书籍数据（含 chapters / volumes）
- `currentChapter: Chapter | null` — 当前编辑章节
- `editorSettings / editorBg` — 编辑器设置（持久化到 localStorage）
- CRUD 方法：`addChapter`, `deleteChapter`, `addVolume`, `deleteVolume`, `updateVolumeTitle`, `loadBookById`, `saveBook`, `saveCurrentChapter`

### 主题持久化
- `localStorage` key: `theme` → `{ value: number }`
- `localStorage` key: `_border` → `{ value: boolean }`
- `localStorage` key: `writer-editor-settings` → 编辑器设置

## API 通信

- Axios 实例 baseURL: `http://localhost:32068/`
- RESTful API：`/api/books`, `/api/chapters`, `/api/volumes`, `/api/memory`, `/api/diary`, `/api/sessions`, `/api/agents`
- 流式 API：`/api/chat-stream`（SSE），`/api/chat-agent`（LangGraph），`/api/book-agent`（多 Agent 流式）
- 取消请求：`/api/chat-cancel?requestId=`

## 组件使用主题变量的方式

组件同时使用两种方式引用主题色：

1. **TailwindCSS class**（优先）：`className="bg-theme-primary text-theme-secondary border-theme-light"`
2. **inline style**（复杂场景）：`style={{ backgroundColor: 'var(--bg-primary)' }}`

## 布局

- **窗口**：无边框 (`frame: false`)，Header 区域为拖拽区 (`-webkit-app-region: drag`)
- **MainLayout**：`h-screen flex flex-col`，Header 固定顶部，下方 `flex` 排列 Sidebar + Outlet
- **Sidebar**：固定宽度 `w-50`（大屏）/ `w-16.5`（小屏），书本模式隐藏
- **BookPage**：全屏模式（`isBookScreen=true`）时隐藏 Sidebar，显示 LeftPanel + EditorArea + RightPanel
