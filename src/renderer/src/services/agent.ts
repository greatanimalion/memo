import api, { getAll, getById, createItem, updateItem, deleteItem } from ".";
import type { MyAgent } from "../types/common";

export const getAllMyAgent = () => getAll<MyAgent>("/api/agents");
export const getMyAgentById = (id: string) => getById<MyAgent>("/api/agents/" + id);
export const createMyAgent = (agent: MyAgent) => createItem("/api/agents", agent);
export const updateMyAgent = (agent: MyAgent) => updateItem<MyAgent>("/api/agents/" + agent.id, agent);
export const deleteMyAgent = (id: string) => deleteItem("/api/agents/" + id);

export async function cancelChat(requestId: string): Promise<boolean> {
  try {
    const response = await api.get("/api/chat-cancel?requestId=" + requestId);
    return response.data.code === 200;
  } catch {
    return false;
  }
}
