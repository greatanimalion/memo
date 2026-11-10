import React from "react";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { Button, Empty } from "antd";
import type { Message } from "@type/session";

interface SessionListProps {
  sessions: Array<{
    id: string;
    title: string;
    messages: Message[];
  }>;
  currentSessionId: string;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string, e: React.MouseEvent) => void;
  onNewSession: () => void;
}

const SessionList: React.FC<SessionListProps> = ({
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
  onNewSession,
}) => {
  return (
    <div className="w-50 border-r  overflow-auto flex flex-col max-md:w-0 transition-width duration-300">
      <div className="p-4 border-b ">
        <Button
          icon={<PlusOutlined />}
          onClick={onNewSession}
          className="w-full"
        >
          新建对话
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {sessions.length > 0 ? (
          sessions.map((conv) => (
            <div
              key={conv.id}
              onClick={() => onSelectSession(conv.id)}
              className="p-3 rounded-lg cursor-pointer transition-all duration-200"
              style={{
                backgroundColor: currentSessionId === conv.id ? "var(--bg-tertiary)" : "transparent",
                boxShadow: currentSessionId === conv.id ? "var(--shadow-lg)" : "none",
              }}
              onMouseEnter={(e) => {
                if (currentSessionId !== conv.id) e.currentTarget.style.backgroundColor = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                if (currentSessionId !== conv.id) e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm truncate" style={{ color: "var(--text-primary)" }}>
                    {conv.title}
                  </h3>
                  <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                    {conv.messages.length > 1
                      ? conv.messages[conv.messages.length - 1].content.slice(
                          0,
                          30,
                        )
                      : "新对话"}
                  </p>
                </div>
                {sessions.length > 1 && (
                    <button
                      onClick={(e) => onDeleteSession(conv.id, e)}
                      className="p-1 rounded transition-colors ml-2 cursor-pointer"
                      style={{ color: "var(--text-muted)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-tertiary)")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      <DeleteOutlined className="text-sm" />
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="p-5">
            <Empty />
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionList;