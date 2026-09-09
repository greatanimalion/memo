import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// 通知主进程渲染完成 - 支持 Electron 和 Tauri
setTimeout(() => {
  // Electron 环境
  if (typeof window !== "undefined" && window.require) {
    try {
      window.require("electron").ipcRenderer.send("app-ready");
    } catch (e) {
      // 非 Electron 环境，忽略
    }
  }
  // Tauri 环境
  if (typeof window !== "undefined" && "__TAURI__" in window) {
    console.log("Running in Tauri environment");
  }
}, 100);
