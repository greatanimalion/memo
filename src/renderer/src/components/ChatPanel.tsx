import { Bot } from "lucide-react";
import { AI_PROMPTS } from "@renderer/constants";
import {
  RobotOutlined,
  BulbOutlined,
  HistoryOutlined,
  PlusCircleOutlined,
  UndoOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { Button, Dropdown, Input, message, Modal } from "antd";
import { useState } from "react";
import { MyAgent } from "@renderer/types/common";
import { Session } from "@type/session";
import TextArea from "antd/es/input/TextArea";
import { useAgent } from "@renderer/hooks/useAgent";

interface ChatPanelProps {
  sessions: Session[];
  currentSession: Session | null;
  handleCopyMessage: (content: string) => void;
  setAgents: React.Dispatch<React.SetStateAction<MyAgent[]>>;
  agents?: MyAgent[];
}

export default function ChatPanel({
  sessions,
  currentSession,
  handleCopyMessage,
  setAgents,
}: ChatPanelProps) {
  const { agents, addAgent, updateAgent, removeAgent } = useAgent();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [agentDescription, setAgentDescription] = useState("");
  const [agentContent, setAgentContent] = useState("");
  const [modal, contextHolder] = Modal.useModal();
  const [editingId, setEditingId] = useState("");

  useState(() => {
    if (agents.length > 0) {
      setAgents(agents);
    }
  });

  const handleAddOrUpdateAgent = async () => {
    if (!agentName || !agentDescription || !agentContent) {
      message.error("请填写完整信息");
      return;
    }

    if (editingId) {
      const result = await updateAgent(
        editingId,
        agentName,
        agentDescription,
        agentContent,
      );
      message[result.success ? "success" : "error"](result.message);
    } else {
      const result = await addAgent(agentName, agentDescription, agentContent);
      message[result.success ? "success" : "error"](result.message);
    }

    if (editingId) {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === editingId
            ? {
                ...a,
                name: agentName,
                description: agentDescription,
                content: agentContent,
              }
            : a,
        ),
      );
    } else {
      setAgents((prev) => [
        ...prev,
        {
          id: "",
          name: agentName,
          description: agentDescription,
          content: agentContent,
        },
      ]);
    }

    resetForm();
    setIsModalOpen(false);
  };

  const handleDeleteAgent = (agent: MyAgent) => {
    modal
      .confirm({ title: "确认删除: " + agent.name })
      .then(
        async () => {
          await removeAgent(agent);
          setAgents((prev) => prev.filter((a) => a.id !== agent.id));
          message.success("删除智能体成功");
        },
        () => {},
      )
      .catch(() => message.error("删除智能体失败"));
  };

  const resetForm = () => {
    setAgentName("");
    setAgentDescription("");
    setAgentContent("");
    setEditingId("");
  };

  const openEditModal = (agent: MyAgent) => {
    setAgentName(agent.name);
    setAgentDescription(agent.description);
    setAgentContent(agent.content);
    setEditingId(agent.id);
    setIsModalOpen(true);
  };

  return (
    <>
      <Modal
        title={!!editingId ? "修改智能体" : "新增智能体"}
        open={isModalOpen}
        onOk={handleAddOrUpdateAgent}
        cancelText="取消"
        okText="确认"
        onCancel={() => {
          setIsModalOpen(false);
          resetForm();
        }}
      >
        <div className="flex gap-1 flex-col">
          <div>
            <div>智能体名称：</div>
            <Input
              showCount
              maxLength={15}
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
            />
          </div>
          <div>
            <div>智能体描述：</div>
            <Input
              showCount
              maxLength={50}
              value={agentDescription}
              onChange={(e) => setAgentDescription(e.target.value)}
            />
          </div>
          <div>
            <p>智能体内容：</p>
            <TextArea
              rows={4}
              placeholder="最大字数2000"
              value={agentContent}
              maxLength={2000}
              onChange={(e) => setAgentContent(e.target.value)}
            />
          </div>
        </div>
      </Modal>
      {contextHolder}
      <div
        className="w-70 overflow-y-auto max-lg:w-0 transition-width duration-300"
        style={{ borderLeft: "1px solid var(--border-color)", backgroundColor: "var(--bg-secondary)" }}
      >
        <div className="p-4 space-y-6">
          {/* AI 能力 */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
              <Bot />
              agent代理
            </h3>
            <Button
              onClick={() => {
                resetForm();
                setIsModalOpen(true);
              }}
              color="primary"
              className="w-full mb-2"
              icon={<PlusCircleOutlined />}
              variant="dashed"
            >
              新建智能体
            </Button>
            <div className="grid grid-cols-1 gap-2">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="rounded-lg p-3 shadow-2xs"
                  style={{ backgroundColor: "var(--bg-primary)" }}
                >
                  <div className="flex justify-between">
                    <div className="flex items-center gap-2">
                      <RobotOutlined style={{ color: "var(--accent-color)" }} />
                      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {agent.name}
                      </span>
                    </div>
                    <div>
                      <Dropdown
                        menu={{
                          items: [
                            {
                              key: "1",
                              label: (
                                <div
                                  className="flex gap-1 items-center"
                                  onClick={() => openEditModal(agent)}
                                >
                                  <UndoOutlined />
                                  修改
                                </div>
                              ),
                            },
                            {
                              key: "2",
                              label: (
                                <div
                                  className="text-red-500 flex gap-1 items-center"
                                  onClick={() => handleDeleteAgent(agent)}
                                >
                                  <DeleteOutlined />
                                  删除
                                </div>
                              ),
                            },
                          ],
                        }}
                        placement="bottomRight"
                      >
                        <button
                          className="p-1.5 rounded transition-colors cursor-pointer"
                          style={{ color: "var(--text-muted)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-hover)")}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                        >
                          •••
                        </button>
                      </Dropdown>
                    </div>
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {agent.description}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 对话统计 */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
              <HistoryOutlined />
              对话统计
            </h3>
            <div className="rounded-lg p-4 space-y-3" style={{ backgroundColor: "var(--bg-primary)" }}>
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>对话数量</span>
                <span className="font-semibold text-blue-600">
                  {sessions.length}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>消息总数</span>
                <span className="font-semibold text-purple-600">
                  {sessions.reduce(
                    (sum, conv) => sum + conv.messages.length,
                    0,
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>当前对话</span>
                <span className="font-semibold text-green-600">
                  {currentSession?.messages.length || 0}
                </span>
              </div>
            </div>
          </div>

          {/* 快捷提示 */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
              <BulbOutlined />
              快捷提示
            </h3>
            <div className="space-y-2">
              {AI_PROMPTS.map((item, index) => (
                <div
                  key={index}
                  onClick={() => handleCopyMessage(item.prompt)}
                  className="rounded-lg p-3 cursor-pointer transition-colors"
                  style={{ backgroundColor: "var(--bg-primary)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-primary)")}
                >
                  <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {item.title}
                  </div>
                  <div className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                    {item.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
