import { Bot } from "lucide-react";
import { AI_PROMPTS } from "../constants";
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
import { MyAgent, Session } from "../../../types";
import TextArea from "antd/es/input/TextArea";
import { createMyAgent, updateMyAgent, deleteMyAgent } from "../services/agent";

interface ChatPanelProps {
  sessions: Session[];
  currentSession: Session | null;
  handleCopyMessage: (content: string) => void;
  agents: MyAgent[];
  onAgentsChange: (agents: MyAgent[]) => void;
}

export default function ChatPanel({
  sessions,
  currentSession,
  handleCopyMessage,
  agents,
  onAgentsChange,
}: ChatPanelProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [agentDescription, setAgentDescription] = useState("");
  const [agentContent, setAgentContent] = useState("");
  const [modal, contextHolder] = Modal.useModal();
  const [editingId, setEditingId] = useState("");

  const handleAddOrUpdateAgent = async () => {
    if (!agentName || !agentDescription || !agentContent) {
      message.error("请填写完整信息");
      return;
    }

    if (editingId) {
      const res = await updateMyAgent({
        id: editingId,
        name: agentName,
        description: agentDescription,
        content: agentContent,
      });
      if (res) {
        onAgentsChange(
          agents.map((a) =>
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
        message.success("修改智能体成功");
      }
    } else {
      if (agents.some((a) => a.name === agentName)) {
        message.error("智能体名称重复");
        return;
      }
      const res = await createMyAgent({
        id: "",
        name: agentName,
        description: agentDescription,
        content: agentContent,
      });
      if (res) {
        onAgentsChange([...agents, res]);
        message.success("添加智能体成功");
      }
    }

    resetForm();
    setIsModalOpen(false);
  };

  const handleDeleteAgent = async (agent: MyAgent) => {
    modal
      .confirm({ title: "确认删除: " + agent.name })
      .then(
        async () => {
          await deleteMyAgent(agent.id);
          onAgentsChange(agents.filter((a) => a.id !== agent.id));
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
      <div className="w-70 border-l border-gray-200 bg-gray-50 overflow-y-auto max-lg:w-0 transition-width duration-300">
        <div className="p-4 space-y-6">
          {/* AI 能力 */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
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
                  className="bg-white rounded-lg p-3 shadow-2xs"
                >
                  <div className="flex justify-between">
                    <div className="flex items-center gap-2">
                      <RobotOutlined />
                      <span className="text-sm font-medium text-gray-800">
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
                        <button className="p-1.5 hover:bg-gray-100 rounded transition-colors cursor-pointer">
                          <span className="text-gray-400">•••</span>
                        </button>
                      </Dropdown>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {agent.description}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 对话统计 */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <HistoryOutlined />
              对话统计
            </h3>
            <div className="bg-white rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">对话数量</span>
                <span className="font-semibold text-blue-600">
                  {sessions.length}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">消息总数</span>
                <span className="font-semibold text-purple-600">
                  {sessions.reduce(
                    (sum, conv) => sum + conv.messages.length,
                    0,
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">当前对话</span>
                <span className="font-semibold text-green-600">
                  {currentSession?.messages.length || 0}
                </span>
              </div>
            </div>
          </div>

          {/* 快捷提示 */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <BulbOutlined />
              快捷提示
            </h3>
            <div className="space-y-2">
              {AI_PROMPTS.map((item, index) => (
                <div
                  key={index}
                  onClick={() => handleCopyMessage(item.prompt)}
                  className="bg-white rounded-lg p-3 cursor-pointer hover:bg-blue-50 transition-colors"
                >
                  <div className="text-sm font-medium text-gray-800">
                    {item.title}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
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
