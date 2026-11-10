// src/css-modules.d.ts (文件名可自定义)

// 声明 .module.css 文件
declare module "*.css" {
  const classes: { [key: string]: string };
  export default classes;
}

// 如果还使用 SCSS/SASS，也可一并声明
declare module "*.scss" {
  const classes: { [key: string]: string };
  export default classes;
}

// Tauri 类型声明
interface Window {
  __TAURI__?: {
    core: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
    event: {
      listen: <T>(event: string, handler: (payload: T) => void) => Promise<() => void>;
      emit: (event: string, payload?: unknown) => Promise<void>;
    };
    path: {
      appDataDir: () => Promise<string>;
      appLocalDataDir: () => Promise<string>;
      resolveResource: (path: string) => Promise<string>;
    };
    window: {
      getCurrentWindow: () => {
        minimize: () => Promise<void>;
        maximize: () => Promise<void>;
        unmaximize: () => Promise<void>;
        close: () => Promise<void>;
        hide: () => Promise<void>;
        show: () => Promise<void>;
        setFocus: () => Promise<void>;
        isMaximized: () => Promise<boolean>;
      };
    };
  };
}
