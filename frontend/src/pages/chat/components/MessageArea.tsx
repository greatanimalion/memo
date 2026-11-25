import React, { useRef } from "react";
import { Dropdown } from "antd";
import {
  CopyOutlined,
  DeleteOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import { XMarkdown } from "@ant-design/x-markdown";
import { Think } from "@ant-design/x";
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
                      backgroundColor: msg.role === "user" ? "var(--info-color)" : "var(--bg-tertiary)",
                      color: msg.role === "user" ? "#fff" : "var(--text-primary)",
                      borderRadius: msg.role === "user" ? "1rem 1rem 0.25rem 1rem" : "1rem 1rem 1rem 0.25rem",
                    }}
                  >
                    <XMarkdown content={msg.content} />
                    <p className="text-xs mt-2" style={{ color: msg.role === "user" ? "rgba(255,255,255,0.7)" : "var(--text-muted)" }}>
                      {formatTime(msg.timestamp || 0)}
                    </p>
                  </div>
                {/* footer */}
                {msg.role != "user" && (
                  <>
                    <div className="mt-1 flex h-7 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                      {getMessageActions(msg as Message).map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={item.onClick}
                          className="cursor-pointer  items-center gap-1 rounded-md px-2 py-1 text-xs leading-none text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
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
                  <div className="rounded-2xl px-4 py-3 rounded-tl-sm" style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)" }}>
                    <XMarkdown content={typingTarget} />
                    <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
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
};

export default MessageArea;