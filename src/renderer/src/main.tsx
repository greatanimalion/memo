import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// 通知主进程渲染完成
setTimeout(() => {
  window.require("electron").ipcRenderer.send("app-ready");
}, 100);
