import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:32068/",
});

export async function exportAll() {
  const response = await api.get("/api/storage");
  return response.data;
}
export async function memerySize() {
  const response = await api.get("/api/memorySize");
  return response.data;
}
export async function importAll(data: any) {
  const response = await api.post("/api/storage/restore", {
    restoreData: data,
  });
  return response.data;
}
export default api;
