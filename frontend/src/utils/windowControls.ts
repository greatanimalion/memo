import {
  Quit,
  WindowMaximise,
  WindowMinimise,
  WindowReload,
  WindowUnmaximise,
} from "../../wailsjs/runtime/runtime";

const handlers: Record<string, () => void> = {
  minimizeWindow: WindowMinimise,
  maxmizeWindow: WindowMaximise,
  unmaximizeWindow: WindowUnmaximise,
  closeWindow: Quit,
  reload: WindowReload,
};

export function handleWindowOp(op: string): void {
  const handler = handlers[op];
  if (handler) {
    handler();
  }
}
