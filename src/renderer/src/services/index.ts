import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:32068/',
  timeout: 30000,
});

export async function exportAll() {
  try {
    const response = await api.get('/api/storage');
    return response.data;
  } catch (error) {
    console.error('exportAll failed:', error);
    throw error;
  }
}
export async function memorySize() {
  try {
    const response = await api.get('/api/memorySize');
    return response.data;
  } catch (error) {
    console.error('memorySize failed:', error);
    throw error;
  }
}
export async function importAll(data: any) {
  try {
    const response = await api.post('/api/storage/restore', {
      restoreData: data,
    });
    return response.data;
  } catch (error) {
    console.error('importAll failed:', error);
    throw error;
  }
}
export default api;