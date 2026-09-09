/**
 * 平台抽象层 — 统一 Electron / Tauri / 浏览器 的窗口管理和文件操作
 */

const isTauri = typeof window !== "undefined" && "__TAURI__" in window;
const isElectron =
  typeof window !== "undefined" && typeof window.require === "function";

async function tauriInvoke(cmd: string, args?: Record<string, unknown>) {
  return (window as any).__TAURI__.core.invoke(cmd, args);
}

async function tauriEmit(event: string) {
  return (window as any).__TAURI__.event.emit(event);
}

function electronSend(channel: string, data?: unknown) {
  if (isElectron) {
    window.require("electron").ipcRenderer.send(channel, data);
  }
}

function electronHandle(channel: string, data?: unknown): Promise<any> {
  if (isElectron) {
    return window.require("electron").ipcRenderer.invoke(channel, data);
  }
  return Promise.reject(new Error("Not in Electron"));
}

// ========== 窗口管理 ==========

export async function minimizeWindow() {
  if (isTauri) {
    const win = (window as any).__TAURI__.window.getCurrentWindow();
    await win.minimize();
  } else if (isElectron) {
    electronSend("minimizeWindow");
  }
}

export async function maximizeWindow() {
  if (isTauri) {
    const win = (window as any).__TAURI__.window.getCurrentWindow();
    const maximized = await win.isMaximized();
    if (maximized) {
      await win.unmaximize();
    } else {
      await win.maximize();
    }
  } else if (isElectron) {
    electronSend("maxmizeWindow");
  }
}

export async function unmaximizeWindow() {
  if (isTauri) {
    const win = (window as any).__TAURI__.window.getCurrentWindow();
    await win.unmaximize();
  } else if (isElectron) {
    electronSend("unmaximizeWindow");
  }
}

export async function closeWindow() {
  if (isTauri) {
    const win = (window as any).__TAURI__.window.getCurrentWindow();
    await win.close();
  } else if (isElectron) {
    electronSend("closeWindow");
  }
}

export async function hideWindow() {
  if (isTauri) {
    await tauriInvoke("hide_window");
  } else if (isElectron) {
    await electronHandle("hideWindow");
  }
}

export async function showWindow() {
  if (isTauri) {
    await tauriInvoke("show_window");
  } else if (isElectron) {
    await electronHandle("showWindow");
  }
}

export async function isMaximized(): Promise<boolean> {
  if (isTauri) {
    const win = (window as any).__TAURI__.window.getCurrentWindow();
    return await win.isMaximized();
  } else if (isElectron) {
    return await electronHandle("resizable");
  }
  return false;
}

export async function toggleDevTools() {
  if (isElectron) {
    electronSend("toggleDevTools");
  }
}

// ========== 文件操作 ==========

export async function writeFile(filePath: string, content: string) {
  if (isTauri) {
    return tauriInvoke("write_file", { filePath, content });
  } else if (isElectron) {
    return electronHandle("writeFile", { filePath, content });
  }
}

export async function readFile(filePath: string): Promise<string> {
  if (isTauri) {
    return tauriInvoke("read_file", { filePath });
  } else if (isElectron) {
    return electronHandle("readFile", { filePath });
  }
  throw new Error("No platform available");
}

export async function saveImage(imgData: string, filePath: string) {
  if (isTauri) {
    return tauriInvoke("save_image", { imgData, filePath });
  } else if (isElectron) {
    return electronHandle("saveImage", { imgData, filePath });
  }
}

export async function exportFile(filename: string, content: string) {
  if (isElectron) {
    electronSend("exportFile", { filename, content });
  }
  // Tauri 暂不实现导出文件对话框
}

export async function showSaveDialog(options?: any) {
  if (isElectron) {
    return electronHandle("showSaveDialog", options);
  }
  return { canceled: true };
}

export async function showOpenDialog(options?: any) {
  if (isElectron) {
    return electronHandle("showOpenDialog", options);
  }
  return { canceled: true, filePaths: [] };
}

export async function getPath(name: string): Promise<string> {
  if (isTauri) {
    return tauriInvoke("get_app_path");
  } else if (isElectron) {
    return electronHandle("getPath", name);
  }
  return "";
}

export { isTauri, isElectron };
