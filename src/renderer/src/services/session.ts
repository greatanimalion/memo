import api from ".";
import { Session } from "@type";

//获取所有会话
export async function getAllSession(): Promise<Session[]> {
  try {
    const response = await api.get("/api/sessions");
    return response.data.data;
  } catch {
    return [];
  }
}

//根据id获取会话
export async function getSessionById(id: string): Promise<Session | null> {
  try {
    const response = await api.get("/api/sessions/" + id);
    return response.data.data;
  } catch {
    return null;
  }
}

//创建新的会话
export async function createSession(session: Session): Promise<Session> {
  const response = await api.post("/api/sessions", session);
  return response.data.data;
}

//更新会话
export async function updateSession(session: Session): Promise<Session> {
  const response = await api.put("/api/sessions/" + session.id, {
    ...session,
    lastUpdated: Date.now(),
  });
  return response.data.data;
}

//删除会话
export async function deleteSession(id: string): Promise<boolean> {
  const response = await api.delete("/api/sessions/" + id);
  return response.data.code == 200;
}
