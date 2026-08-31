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
  └─ [text] → route                 │
       ├─ "构思/大纲" → thinker ────┤
       ├─ "完成/结束" → END         │
       └─ 其他 → orchestrator       │
                                    │
thinker → route → orchestrator ─────┘
                                    │
writer → route → editor ────────────┤
  ↓                                 │
editor → route → consistency ───────┘
  ↓
consistency → route → orchestrator
```

## 工具

| 工具 | 说明 | 可用 Agent |
|------|------|-----------|
| `get_book_info` | 获取书籍详情（标题、章节目录等） | orchestrator, writer |
| `save_chapter` | 保存新章节 | orchestrator, writer |
| `update_chapter` | 更新章节内容/标题 | orchestrator, writer |
| `save_to_memory` | 保存信息到项目记忆 | orchestrator, writer |

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

流式返回格式（`Transfer-Encoding: chunked`，`Content-Type: text/plain`）：

```
### [orchestrator]

Orchestrator 输出内容...

### [thinker]

Thinker 输出内容...

[orchestrator:get_book_info]    ← 工具调用通知
[system] 工具返回结果           ← 工具执行结果

### [writer]

Writer 输出内容...

[book-agent:done]               ← 完成信号
```

前端 `BookAgentModal.tsx` 按 `### [agentName]` 标记动态创建/更新 Agent 面板，收到 `[book-agent:done]` 后调用 `loadBookById(bookId)` 刷新数据。

## 使用方式

1. 用户在书籍页面发起"AI 写书"请求
2. Orchestrator 获取书籍信息，制定创作计划
3. 按计划调度 Thinker → 生成大纲
4. Orchestrator 审核大纲，通过后调度 Writer
5. Writer 逐章撰写，每章经过 Editor → Consistency 循环
6. 全部完成后 Orchestrator 输出总结
