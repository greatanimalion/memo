# Book Agent — AI 写书工作流

## 概述

基于 LangGraph StateGraph 的多 Agent 协作写书系统。5 个专业 Agent 按流程协作，完成从构思到成稿的全流程。

## Agent 角色

| Agent | 文件 | 职责 |
|-------|------|------|
| Orchestrator | `orchestrator.ts` | 总控/规划，调度其他 Agent，质量把关 |
| Thinker | `thinker.ts` | 构思大纲，结构设计，角色/世界观设定 |
| Writer | `writer.ts` | 撰写章节正文 |
| Editor | `editor.ts` | 编辑润色，优化表达和节奏 |
| Consistency | `consistency.ts` | 一致性检查，防止"吃书" |

## Graph 流程

```
START
  ↓
orchestrator ←──────────────────────┐
  ├─ [tool_calls] → tools ──────────┤
  └─ [无 tool_calls] → routePhase   │
       ├─ route tool → 目标 Agent   │
       ├─ 兜底 → 固定流程           │
                                     │
thinker ←────────────────────────────┤
  ├─ [tool_calls] → tools ──────────┤
  └─ routePhase → orchestrator ─────┘
                                     │
writer ←─────────────────────────────┤
  ├─ [tool_calls] → tools ──────────┤
  └─ routePhase → editor ───────────┤
                                     │
editor ←─────────────────────────────┤
  ├─ [tool_calls] → tools ──────────┤
  └─ routePhase → consistency ──────┤
                                     │
consistency ←────────────────────────┤
  ├─ [tool_calls] → tools ──────────┤
  └─ routePhase → orchestrator ─────┘

tools 执行完后 → orchestrator
```

## 路由机制

通过 `route` 工具实现显式流程控制：

```typescript
// Agent 调用 route 工具来决定下一步
route({ target: "thinker" })   // 切换到构思 Agent
route({ target: "writer" })    // 切换到写作 Agent
route({ target: "editor" })    // 切换到编辑 Agent
route({ target: "consistency" }) // 切换到检查 Agent
route({ target: "orchestrator" }) // 返回总控
route({ target: "end" })       // 结束流程
```

兜底逻辑：如果 Agent 没有调用 route 工具，按固定流程流转（thinker→orchestrator→writer→editor→consistency→orchestrator）。

## 工具

| 工具 | 说明 | 可用 Agent |
|------|------|-----------|
| `route` | 控制流程走向（必须调用） | 所有 Agent |
| `get_book_info` | 获取书籍详情 | 所有 Agent |
| `save_chapter` | 保存新章节 | 所有 Agent |
| `update_chapter` | 更新章节内容/标题 | 所有 Agent |

## API 调用

```bash
POST /api/book-agent
Content-Type: application/json

{
  "prompt": "写一本关于xxx的小说",
  "bookId": "xxx",
  "model": "qwen-plus",
  "apiKey": "xxx",
  "requestId": "optional-request-id"
}
```

## SSE 流式返回格式

`Content-Type: text/event-stream`

```
event: agent
data: {"name":"orchestrator"}

event: message
data: Orchestrator 输出内容...

event: tool_call
data: {"agent":"orchestrator","name":"get_book_info"}

event: tool
data: {"name":"get_book_info","result":"..."}

event: agent
data: {"name":"thinker"}

event: message
data: Thinker 输出内容...

event: done
data: [DONE]
```

### 事件类型

| event | data 格式 | 说明 |
|-------|-----------|------|
| `agent` | `{"name":"agentName"}` | Agent 开始执行 |
| `message` | 文本内容 | Agent 输出的文本（逐 token 流式） |
| `tool_call` | `{"agent":"...","name":"..."}` | 工具调用发起 |
| `tool` | `{"name":"...","result":"..."}` | 工具执行结果 |
| `error` | 错误信息 | 执行错误 |
| `cancel` | "请求已取消" | 用户取消 |
| `done` | `[DONE]` | 流结束 |

## 数据库记录

每次执行自动创建 `bookAgent` 记录：

| 字段 | 说明 |
|------|------|
| `id` | UUID |
| `bookId` | 关联书籍 ID |
| `title` | 用户输入的前 50 字符 |
| `messages` | JSON 数组，包含所有 Agent 的对话内容 |
| `status` | `running` → `done` / `error` / `cancelled` |
| `createdAt` | 创建时间戳 |
| `updatedAt` | 更新时间戳 |

`messages` 结构：
```json
[
  {
    "agent": "orchestrator",
    "role": "assistant",
    "content": "Agent 输出内容...",
    "timestamp": 1234567890
  }
]
```

## 注意事项

- DeepSeek 模型使用 DSML 格式输出 tool_calls（`<｜｜DSML｜｜tool_calls>`），需要从 content 中解析
- `get_book_info` 缺 bookId 时会自动从 state 补全
- 连续2次空参数工具调用后不绑 tools，强制 LLM 用文本回复
- `route` 工具通过 `pendingRoute` 变量控制流程，兜底逻辑按固定流程流转

## 使用方式

1. 用户在书籍页面发起"AI 写书"请求
2. Orchestrator 获取书籍信息，制定创作计划，调用 `route(target="thinker")`
3. Thinker 生成大纲，返回 orchestrator
4. Orchestrator 审核后调用 `route(target="writer")`
5. Writer 撰写章节，自动经过 Editor → Consistency 循环
6. 全部完成后 Orchestrator 调用 `route(target="end")`
