import React, { useMemo, useState } from "react";
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
} from "@ant-design/icons";
import { Button, Dropdown, Empty, Input, Modal } from "antd";
import type { Message } from "@type/session";

interface SessionItem {
  id: string;
  title: string;
  messages: Message[];
  lastUpdated?: number;
}

interface SessionListProps {
  sessions: SessionItem[];
  currentSessionId: string;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onNewSession: () => void;
  /** 重命名会话（不传则隐藏「重命名」菜单项） */
  onRenameSession?: (id: string, title: string) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 按最后更新时间倒序，并拆分为「今天 / 七天内 / 更久」三组。 */
function groupSessions(sessions: SessionItem[]) {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  // 含今天在内共 7 天
  const weekStart = startOfToday - 6 * DAY_MS;

  const today: SessionItem[] = [];
  const week: SessionItem[] = [];
  const older: SessionItem[] = [];

  [...sessions]
    .sort((a, b) => (b.lastUpdated ?? 0) - (a.lastUpdated ?? 0))
    .forEach((item) => {
      const time = item.lastUpdated ?? 0;
      if (time >= startOfToday) {
        today.push(item);
      } else if (time >= weekStart) {
        week.push(item);
      } else {
        older.push(item);
      }
    });

  return [
    { title: "今天", items: today },
    { title: "七天内", items: week },
    { title: "更久", items: older },
  ].filter((group) => group.items.length > 0);
}

const SessionList: React.FC<SessionListProps> = ({
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
  onNewSession,
  onRenameSession,
}) => {
  const [renameTarget, setRenameTarget] = useState<SessionItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // 用 useModal 获得的实例，才能继承 ConfigProvider 的主题与层级
  const [modal, modalContextHolder] = Modal.useModal();

  const groups = useMemo(() => groupSessions(sessions), [sessions]);

  const openRename = (conv: SessionItem) => {
    setRenameTarget(conv);
    setRenameValue(conv.title);
  };

  const handleRenameOk = () => {
    const title = renameValue.trim();
    if (!renameTarget || !title) return;
    void onRenameSession?.(renameTarget.id, title);
    setRenameTarget(null);
  };

  // 删除前二次确认，避免误触
  const confirmDelete = (conv: SessionItem) => {
    modal.confirm({
      title: "删除对话",
      content: `确定删除「${conv.title || "未命名对话"}」吗？删除后不可恢复。`,
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: () => onDeleteSession(conv.id),
    });
  };

  return (
    <div className="w-50 border-r  overflow-auto flex flex-col max-md:w-0 transition-width duration-300">
      {modalContextHolder}
      <div className="p-4 border-b ">
        <Button
          icon={<PlusOutlined />}
          onClick={onNewSession}
          className="w-full"
        >
          新建对话
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {groups.length > 0 ? (
          groups.map((group) => (
            <div key={group.title} className="space-y-1">
              <div
                className="px-1 text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                {group.title}
              </div>
              {group.items.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => onSelectSession(conv.id)}
                  className="p-3 rounded-lg cursor-pointer transition-all duration-200"
                  style={{
                    backgroundColor:
                      currentSessionId === conv.id
                        ? "var(--bg-tertiary)"
                        : "transparent",
                    boxShadow:
                      currentSessionId === conv.id
                        ? "var(--shadow-lg)"
                        : "none",
                  }}
                  onMouseEnter={(e) => {
                    if (currentSessionId !== conv.id)
                      e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (currentSessionId !== conv.id)
                      e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3
                        className="font-medium text-sm truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {conv.title}
                      </h3>
                      {/* 预览压缩为一行，超出部分省略号 */}
                      <p
                        className="text-xs mt-1 truncate"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {conv.messages.length > 1
                          ? conv.messages[conv.messages.length - 1].content
                              .replace(/\s+/g, " ")
                              .trim()
                          : "新对话"}
                      </p>
                    </div>
                    <Dropdown
                      trigger={["click"]}
                      placement="right"
                      menu={{
                        items: [
                          ...(onRenameSession
                            ? [
                                {
                                  key: "rename",
                                  icon: <EditOutlined />,
                                  label: "重命名",
                                },
                                { type: "divider" as const },
                              ]
                            : []),
                          {
                            key: "delete",
                            icon: <DeleteOutlined />,
                            label: "删除",
                            danger: true,
                            disabled: sessions.length <= 1,
                          },
                        ],
                        onClick: ({ key, domEvent }) => {
                          domEvent.stopPropagation();
                          if (key === "rename") {
                            openRename(conv);
                          } else if (key === "delete") {
                            confirmDelete(conv);
                          }
                        },
                      }}
                    >
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="p-1 rounded transition-colors ml-2 cursor-pointer"
                        style={{ color: "var(--text-muted)" }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            "var(--bg-tertiary)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor = "transparent")
                        }
                      >
                        <MoreOutlined className="text-sm" />
                      </button>
                    </Dropdown>
                  </div>
                </div>
              ))}
            </div>
          ))
        ) : (
          <div className="p-5">
            <Empty />
          </div>
        )}
      </div>

      <Modal
        title="重命名对话"
        open={renameTarget !== null}
        okText="确定"
        cancelText="取消"
        okButtonProps={{ disabled: !renameValue.trim() }}
        onOk={handleRenameOk}
        onCancel={() => setRenameTarget(null)}
        destroyOnHidden
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={handleRenameOk}
          placeholder="请输入对话名称"
          maxLength={50}
          autoFocus
        />
      </Modal>
    </div>
  );
};

export default SessionList;
