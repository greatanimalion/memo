import api from '.'
import { MyAgent } from '../types/common'

//获取所有atgnet
export async function getAllMyAgent(): Promise<MyAgent[]> {
  try {
    const response = await api.get('/api/agents')
    return response.data.data
  } catch {
    return []
  }
}

//创建新的atgnet
export async function createMyAgent(MyAgent: MyAgent): Promise<MyAgent> {
  const response = await api.post('/api/agents', MyAgent)
  return response.data.data
}

//更新atgnet
export async function updateMyAgent(MyAgent: MyAgent): Promise<MyAgent> {
  const response = await api.put('/api/agents/' + MyAgent.id, MyAgent)
  return response.data.data
}

//删除atgnet
export async function deleteMyAgent(id: string): Promise<boolean> {
  const response = await api.delete('/api/agents/' + id)
  return response.data.code == 200
}

export async function cancelChat(requestId: string): Promise<boolean> {
  const response = await api.get('/api/chat-cancel?requestId=' + requestId)
  return response.data.code == 200
}