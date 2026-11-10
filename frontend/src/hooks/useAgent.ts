import { useState, useEffect, useCallback } from "react";
import { MyAgent } from "@renderer/types/common";
import {
  createMyAgent,
  deleteMyAgent,
  getAllMyAgent,
  updateMyAgent,
} from "@renderer/services/agent";
import { generateUUID } from "@renderer/utils/helper";

export const useAgent = () => {
  const [agents, setAgents] = useState<MyAgent[]>([]);

  // 初始化智能体列表
  useEffect(() => {
    const initAgents = async () => {
      const _agents = await getAllMyAgent();
      setAgents(_agents || []);
    };
    initAgents();
  }, []);

  // 添加智能体
  const addAgent = useCallback(
    async (name: string, description: string, content: string) => {
      // 检查名称是否重复
      if (agents.some((a) => a.name === name)) {
        return { success: false, message: "智能体名称重复" };
      }

      const newAgent: MyAgent = {
        id: generateUUID(),
        name,
        description,
        content,
      };

      const res = await createMyAgent(newAgent);

      if (res) {
        setAgents((prev) => [...prev, res]);
        return { success: true, message: "添加智能体成功" };
      }

      return { success: false, message: "添加智能体失败" };
    },
    [agents],
  );

  // 更新智能体
  const updateAgent = useCallback(
    async (id: string, name: string, description: string, content: string) => {
      const res = await updateMyAgent({ id, name, description, content });

      if (res) {
        setAgents((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, name, description, content } : a,
          ),
        );
        return { success: true, message: "修改智能体成功" };
      }

      return { success: false, message: "修改智能体失败" };
    },
    [],
  );

  // 删除智能体
  const removeAgent = useCallback(async (agent: MyAgent) => {
    await deleteMyAgent(agent.id);
    setAgents((prev) => prev.filter((a) => a.id !== agent.id));
  }, []);

  // 获取智能体
  const getAgentById = useCallback(
    (id: string) => {
      return agents.find((a) => a.id === id);
    },
    [agents],
  );

  return {
    agents,
    addAgent,
    updateAgent,
    removeAgent,
    getAgentById,
  };
};
