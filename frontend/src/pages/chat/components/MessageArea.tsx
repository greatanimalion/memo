import React, { useMemo } from "react";
import {
  CopyOutlined,
  DeleteOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import { XMarkdown } from "@ant-design/x-markdown";
import { Bubble, Think } from "@ant-design/x";
import type { BubbleItemType } from "@ant-design/x";
import type { Message } from "@type/session";
import type { ChatLiveRun } from "@renderer/services/chatLive";
import { formatTime } from "@renderer/utils/dateUtils";

interface MessageAreaProps {
  messages: Message[];
  /** 当前会话的运行态（由 chatLive 直接订阅而来，不再由页面镜像） */
  run: ChatLiveRun | null;
  onCopyMessage: (content: string) => void;
  onDeleteMessage: (msg: Message) => void;
}

const MessageArea: React.FC<MessageAreaProps> = ({
  messages,
  run,
  onCopyMessage,
  onDeleteMessage,
}) => {

  const getMessageActions = (msg: Message) => [
    {
      key: "copy",
      label: "复制",
      icon: <CopyOutlined />,
      onClick: () => onCopyMessage(msg.content),
    },
    {
      key: "delete",
      label: "删除",
      icon: <DeleteOutlined />,
      onClick: () => onDeleteMessage(msg),
    },
  ];

  // 消息列表：历史消息 + 流式回复中的临时气泡
  const items = useMemo<BubbleItemType[]>(() => {
    const list: BubbleItemType[] = messages.map((msg, index) => {
      const isUser = msg.role === "user";
      return {
        key: msg.timestamp ?? `msg-${index}`,
        role: isUser ? "user" : "ai",
        content: msg.content,
        contentRender: (content) => (
          <div className="text-sm">
            <XMarkdown content={typeof content === "string" ? content : ""} />
            <p
              className="mt-2 text-xs"
              style={{
                color: isUser ? "rgba(255,255,255,0.7)" : "var(--text-muted)",
              }}
            >
              {formatTime(msg.timestamp || 0)}
            </p>
          </div>
        ),
        // 供 footer 的 hover 显隐使用
        rootClassName: "group",
        footerPlacement: "outer-start",
        footer: isUser ? undefined : (
          <div className="flex h-7 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
            {getMessageActions(msg).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs leading-none text-(--text-muted) transition-colors hover:bg-(--bg-secondary) hover:text-(--text-primary)"
              >
                <span className="text-[13px]">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ),
      };
    });

    // 正在回复：思考过程 + 工具状态 + 已收到的正文
    if (run && run.status === "running") {
      list.push({
        key: "__typing__",
        role: "ai",
        variant: "borderless",
        content: run.content,
        styles: { content: { backgroundColor: "transparent", padding: 0 } },
        contentRender: () => (
          <div className="text-sm">
            <Think title="思考过程" blink loading />
            {run.toolStatus && (
              <div
                className="mb-2 mt-1 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--accent-color)",
                }}
              >
                <LoadingOutlined spin />
                <span>{run.toolStatus}</span>
              </div>
            )}
            {run.content && <XMarkdown content={run.content} />}
            <p
              className="mt-2 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              {formatTime(run.startedAt)}
            </p>
          </div>
        ),
      });
    }

    return list;
  }, [messages, run, onCopyMessage, onDeleteMessage]);

  // 用户气泡在右侧、AI 气泡在左侧，沿用原配色
  const role = useMemo(
    () => ({
      user: {
        placement: "end" as const,
        variant: "filled" as const,
        shape: "corner" as const,
        styles: {
          content: {
            backgroundColor: "var(--info-color)",
            color: "#fff",
          },
        },
      },
      ai: {
        placement: "start" as const,
        variant: "filled" as const,
        shape: "corner" as const,
        styles: {
          content: {
            backgroundColor: "var(--bg-tertiary)",
            color: "var(--text-primary)",
          },
        },
      },
    }),
    [],
  );

  return (
    <div className="flex-1 min-h-0">
      <Bubble.List
        className="h-full"
        classNames={{
          scroll: "px-6 py-4",
          content: "max-w-3xl mx-auto",
        }}
        items={items}
        role={role}
        autoScroll
      />
    </div>
  );
};

export default MessageArea;
