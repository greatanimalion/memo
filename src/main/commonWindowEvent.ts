//src\main\CommonWindowEvent.ts
import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { promises as fs } from "fs";

// 主进程公共消息处理逻辑
export class CommonWindowEvent {
  private static getWin(event: any) {
    return BrowserWindow.fromWebContents(event.sender);
  }
  public static listen() {
    ipcMain.on("minimizeWindow", (e) => {
      this.getWin(e)?.minimize();
    });

    ipcMain.on("toggleDevTools", (e) => {
      const win = this.getWin(e);
      if (win) {
        if (win.webContents.isDevToolsOpened()) {
          win.webContents.closeDevTools();
        } else {
          win.webContents.openDevTools();
        }
      }
    });

    ipcMain.on("maxmizeWindow", (e) => {
      this.getWin(e)?.maximize();
    });
    // 处理Markdown文件保存请求
    ipcMain.handle("exportFile", async (_event, { filename, content }) => {
      try {
        const result = await dialog.showOpenDialog({
          title: "选择保存位置",
          properties: ["openDirectory", "createDirectory", "promptToCreate"],
          defaultPath: app.getPath("downloads"),
        });
        if (!result.filePaths || result.filePaths.length === 0)
          return { success: false };
        // 获取用户文档目录（安全路径）
        const filePath = result.filePaths[0] + "/" + filename;
        console.log("导入地址：", filePath, result);
        await fs.writeFile(filePath, content, "utf-8");
        return { success: true, filePath };
      } catch (error: any) {
        console.error("保存失败:", error);
        return { success: false, error: error.message };
      }
    });
    ipcMain.on("unmaximizeWindow", (e) => {
      this.getWin(e)?.unmaximize();
    });

    ipcMain.handle("hideWindow", (e) => {
      this.getWin(e)?.hide();
    });

    ipcMain.handle("showWindow", (e) => {
      this.getWin(e)?.show();
    });

    ipcMain.on("closeWindow", (e) => {
      this.getWin(e)?.close();
    });

    ipcMain.handle("relaunch", (e) => {
      console.log("重新启动中...");
      this.getWin(e)?.reload();
      this.getWin(e)?.focus();
    });

    // 新增：监听打开调试窗口事件
    ipcMain.handle("openDevTools", (event) => {
      const win = this.getWin(event);
      if (win) {
        win.webContents.openDevTools();
      }
    });

    ipcMain.handle("resizable", (e) => {
      return this.getWin(e)?.isResizable();
    });
    ipcMain.handle("getPath", (_e, name: any) => {
      return app.getPath(name);
    });

    ipcMain.handle("showSaveDialog", async (_e, options) => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return { cancelled: true };
      const result = await dialog.showSaveDialog(win, options);
      return result;
    });

    ipcMain.handle("writeFile", async (_e, { filePath, content }) => {
      try {
        await fs.writeFile(filePath, content, "utf8");
        return { success: true };
      } catch (error: any) {
        console.error("文件写入失败:", error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("showOpenDialog", async (_e, options) => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return { cancelled: true };
      const result = await dialog.showOpenDialog(win, options);
      return result;
    });

    ipcMain.handle("readFile", async (_e, { filePath }) => {
      try {
        let data = await fs.readFile(filePath, "utf8");
        return data;
      } catch (error) {
        console.error("文件读取失败:", error);
        throw error;
      }
    });

    ipcMain.handle("saveImage", async (_e, { imgData, filePath }) => {
      // 移除数据URL前缀
      const base64Data = imgData.replace(/^data:image\/png;base64,/, "");
      // 保存文件
      try {
        await fs.writeFile(filePath, base64Data, "base64");
        console.log("图片保存成功！");
        return { success: true };
      } catch (error: any) {
        console.error("图片保存失败:", error);
        return { success: false, error: error.message };
      }
    });
  }

  //主进程公共事件处理逻辑
  public static regWinEvent(win: BrowserWindow) {
    win.on("maximize", () => {
      win.webContents.send("windowMaximized");
    });
    win.on("unmaximize", () => {
      win.webContents.send("windowUnmaximized");
    });
  }
}
