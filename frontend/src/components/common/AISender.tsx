import {
  AntDesignOutlined,
  CodeOutlined,
  EditOutlined,
  OpenAIOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Sender, SenderProps } from "@ant-design/x";

import { Dropdown, Flex, GetRef, MenuProps, message } from "antd";
import React, { useEffect, useRef, useState } from "react";
import { AIKey, MyAgent } from "@renderer/types/common";
import { getLocalStore, setLocalStore } from "@renderer/utils/localStore";
import { Bot } from "lucide-react";
import { cancelChat } from "@renderer/services/agent";

const Switch = Sender.Switch;

const AgentInfo: {
  [key: string]: {
    icon: React.ReactNode;
    zh_label: string;
    zh_skill: SenderProps["skill"];
    zh_slotConfig: SenderProps["slotConfig"];
  };
} = {
  deep_search: {
    icon: <SearchOutlined />,
    zh_label: "深度搜索",
    zh_skill: {
      value: "deepSearch",
      title: "深度搜索",
      closable: true,
    },
    zh_slotConfig: [
      { type: "text", value: "请帮我搜索关于" },
      {
        type: "select",
        key: "search_type",
        props: {
          options: ["AI", "技术", "娱乐"],
          placeholder: "请选择一个类别",
        },
      },
      { type: "text", key: "", value: "的新闻。" },
    ],
  },
  ai_code: {
    icon: <CodeOutlined />,
    zh_label: "写代码",
    zh_skill: {
      value: "aiCode",
      title: "代码助手",
      closable: true,
    },
    zh_slotConfig: [
      { type: "text", value: "请使用" },
      {
        type: "select",
        key: "code_lang",
        props: {
          options: ["JS", "C++", "Java"],
          placeholder: "请选择一个编程语言",
        },
      },
      { type: "text", value: "写一个小游戏。" },
    ],
  },
  ai_writing: {
    icon: <EditOutlined />,
    zh_label: "帮我写作",
    zh_skill: {
      value: "writing",
      title: "写作助手",
      closable: true,
    },
    zh_slotConfig: [
      { type: "text", value: "请帮我写一篇关于" },
      {
        type: "select",
        key: "writing_type",
        props: {
          options: ["校园", "旅行", "阅读"],
          placeholder: "请输入主题",
        },
      },
      { type: "text", value: "的文章。要求是" },
      {
        type: "content",
        key: "writing_num",
        props: {
          defaultValue: "800",
          placeholder: "[请输入字数]",
        },
      },
      { type: "text", value: "字。" },
    ],
  },
};

const AISender: React.FC<{
  handleSend: (v: string) => Promise<Boolean|void>;
  isThinking: boolean;
  agents: MyAgent[];
  setPrompt: (prompt: string) => void;
  openAgent: boolean;
  setOpenAgent: (open: boolean) => void;
  requestId: string;
}> = ({
  handleSend,
  isThinking,
  agents,
  setPrompt,
  openAgent,
  setOpenAgent,
  requestId,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [activeAgentKey, setActiveAgentKey] = useState("ai_writing");
  const [selectedAI, setSelectedAI] = useState(
    getLocalStore<string>("selectedAI")?.value || "请选择",
  );
  const [selectedAgent, setSelectedAgent] = useState("未选择");
  const [slotConfig, setSlotConfig] = useState(AgentInfo[activeAgentKey]);
  const [aiKeys, setAiKeys] = useState<AIKey[]>([]);
  useEffect(() => {
    const model: AIKey[] = getLocalStore<AIKey[]>("model")?.value || [];
    const _currentAgent = getLocalStore<string>("selectedAgent")?.value;
    if (_currentAgent) {
      setSelectedAgent(_currentAgent);
    }
    setAiKeys(model);
  }, []);
  useEffect(() => {
    if (!selectedAgent || selectedAgent == "未选择") return;
    setPrompt(
      agents.find((agent) => agent.name == selectedAgent)?.content || "",
    );
    setLocalStore("selectedAgent", { value: selectedAgent });
  }, [selectedAgent]);
  const zhAgentItems: MenuProps["items"] = Object.keys(AgentInfo).map(
    (agent) => {
      const { icon, zh_label } = AgentInfo[agent];
      return {
        key: agent,
        icon,
        label: zh_label,
      };
    },
  );

  const agentItemClick: MenuProps["onClick"] = (item) => {
    setActiveAgentKey(item.key);
    try {
      setSlotConfig(JSON.parse(JSON.stringify(AgentInfo[item.key])));
    } catch (error) {
      console.error(error);
    }
  };

  const senderZhRef = useRef<GetRef<typeof Sender>>(null);

  useEffect(() => {
    setLoading(isThinking);
  }, [isThinking]);

  return (
    <Flex vertical gap="small">
      <Sender
        loading={loading}
        ref={senderZhRef}
        skill={slotConfig.zh_skill}
        placeholder=""
        style={{
          borderLeft: "none",
          borderRight: "none",
          borderBottom: "none",
        }}
        footer={(actionNode) => {
          return (
            <Flex justify="space-between">
              <div className="flex gap-1 items-center">
                <div className="max-[1400px]:hidden">
                  <Switch
                    value={openAgent}
                    checkedChildren={
                      <>
                        AI操作：<span>开启</span>
                      </>
                    }
                    unCheckedChildren={
                      <>
                        AI操作：<span>关闭</span>
                      </>
                    }
                    onChange={(checked: boolean) => {
                      setOpenAgent(checked);
                    }}
                    icon={<ThunderboltOutlined />}
                  />
                </div>

                <Dropdown
                  menu={{
                    selectedKeys: [activeAgentKey],
                    onClick: agentItemClick,
                    items: zhAgentItems,
                  }}
                >
                  <Switch value={false} icon={<AntDesignOutlined />}>
                    功能应用
                  </Switch>
                </Dropdown>
                <Dropdown
                  menu={{
                    selectedKeys: [selectedAI],
                    onClick: (item) => {
                      setSelectedAI(item.key);
                      setLocalStore("selectedAI", { value: item.key });
                    },
                    items: aiKeys.map((key) => ({
                      key: key.model,
                      label: key.model,
                    })),
                  }}
                >
                  <Switch value={false} icon={<OpenAIOutlined />}>
                    <div>模型: {selectedAI}</div>
                  </Switch>
                </Dropdown>
                <Dropdown
                  menu={{
                    selectedKeys: [selectedAgent],
                    onClick: (item) => {
                      setSelectedAgent(item.key);
                    },
                    items: [
                      ...agents,
                      {
                        id: "",
                        name: "无",
                        description: "",
                        content: "",
                      },
                    ].map((agent) => ({
                      key: agent.name,
                      label: agent.name,
                    })),
                  }}
                >
                  <Switch value={false} icon={<Bot size={16} />}>
                    <div className="w-15 truncate"> {selectedAgent}</div>
                  </Switch>
                </Dropdown>
              </div>
              <Flex align="center">{actionNode}</Flex>
            </Flex>
          );
        }}
        suffix={false}
        onSubmit={async (v, _, _skill) => {
          setLoading(true);
          const res=await handleSend(v);
          if(res)setLoading(false);
          senderZhRef.current?.clear?.();
        }}
        onCancel={() => {
          setLoading(false);
          cancelChat(requestId);
          message.error("已取消");
        }}
        slotConfig={slotConfig.zh_slotConfig}
        autoSize={{ minRows: 3, maxRows: 6 }}
      />
    </Flex>
  );
};

export default AISender;
