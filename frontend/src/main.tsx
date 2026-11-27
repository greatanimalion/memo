import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";
import { initApiBase } from "@renderer/utils/apiBase";
import { syncApiBase } from "@renderer/services";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

/**
 * 后端监听的是系统随机分配的空闲端口（127.0.0.1:0），
 * 必须先拿到实际端口再渲染页面，否则首屏请求会打到错误地址。
 */
async function bootstrap() {
  await initApiBase();
  syncApiBase();

  ReactDOM.createRoot(document.getElementById("app")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
