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
import { formatTime } from "@renderer/utils/dateUtils";

interface MessageAreaProps {
  messages: Message[];
  currentSessionId: string;
  isThinking: boolean;
  typingTarget: string;
  typingDate: string;
  typeId: string;
  toolStatus?: string;
  onCopyMessage: (content: string) => void;
  onDeleteMessage: (msg: Message) => void;
}

const MessageArea: React.FC<MessageAreaProps> = ({
  messages,
  currentSessionId,
  isThinking,
  typingTarget,
  typingDate,
  typeId,
  toolStatus,
  onCopyMessage,
  onDeleteMessage,
}) => {
  // ───────── 原实现（手写气泡 + XMarkdown），保留备查 ─────────
  /*
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {messages.map((msg) => (
          <div
            key={msg.timestamp}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`flex items-start gap-3 max-w-[85%] overflow-auto ${msg.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div className="flex-1 group">
                <div
                  className="rounded-2xl px-4 py-3"
                  style={{
                    backgroundColor:
                      msg.role === "user" ? "var(--info-color)" : "var(--bg-tertiary)",
                    color: msg.role === "user" ? "#fff" : "var(--text-primary)",
                    borderRadius:
                      msg.role === "user"
                        ? "1rem 1rem 0.25rem 1rem"
                        : "1rem 1rem 1rem 0.25rem",
                  }}
                >
                  <XMarkdown content={msg.content} />
                  <p
                    className="text-xs mt-2"
                    style={{
                      color:
                        msg.role === "user"
                          ? "rgba(255,255,255,0.7)"
                          : "var(--text-muted)",
                    }}
                  >
                    {formatTime(msg.timestamp || 0)}
                  </p>
                </div>
                {msg.role != "user" && (
                  <>
                    <div className="mt-1 flex h-7 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                      {getMessageActions(msg as Message).map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={item.onClick}
                          className="cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs leading-none text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
                        >
                          <span className="text-[13px]">{item.icon}</span>
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}

        {isThinking && currentSessionId === typeId && (
          <div className="flex justify-start">
            <div className="flex items-start gap-3 max-w-[85%]">
              <div className="flex-1">
                <Think title="Complete thinking" blink loading={true} />
                {toolStatus && (
                  <div
                    className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      color: "var(--accent-color)",
                    }}
                  >
                    <LoadingOutlined spin />
                    <span>{toolStatus}</span>
                  </div>
                )}
                {typingTarget && (
                  <div
                    className="rounded-2xl px-4 py-3 rounded-tl-sm"
                    style={{
                      backgroundColor: "var(--bg-tertiary)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <XMarkdown content={typingTarget} />
                    <p
                      className="text-xs mt-2"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {formatTime(+typingDate)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
  */

  // ───────── 重构实现：ant-design/x Bubble.List ─────────

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
    if (isThinking && currentSessionId === typeId) {
      list.push({
        key: "__typing__",
        role: "ai",
        variant: "borderless",
        content: typingTarget,
        styles: { content: { backgroundColor: "transparent", padding: 0 } },
        contentRender: () => (
          <div className="text-sm">
            <Think title="思考过程" blink loading />
            {toolStatus && (
              <div
                className="mb-2 mt-1 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--accent-color)",
                }}
              >
                <LoadingOutlined spin />
                <span>{toolStatus}</span>
              </div>
            )}
            {typingTarget && <XMarkdown content={typingTarget} />}
            <p
              className="mt-2 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              {formatTime(+typingDate)}
            </p>
          </div>
        ),
      });
    }

    return list;
  }, [
    messages,
    isThinking,
    currentSessionId,
    typeId,
    typingTarget,
    typingDate,
    toolStatus,
    onCopyMessage,
    onDeleteMessage,
  ]);

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
