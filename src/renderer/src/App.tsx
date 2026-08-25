import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "./routes";
import { getLocalStore } from "./utils/localStore";
import { setTheme } from "./hooks/theme";

// 导入所有主题CSS文件
import "./theme/classic-black.css";
import "./theme/minimalism.css";
import "./theme/modern-dark.css";
import "./theme/eye-care.css";
import "./theme/deep-blue.css";
import "./theme/vintage-paper.css";
import "./theme/premium-gray.css";
import "./theme/blue.css";

const App = () => {
  useEffect(() => {
    // 初始化主题
    const theme = (getLocalStore("theme")?.value as number) || 0;
    setTheme(theme);

    // 初始化边框设置
    const _border = (getLocalStore("_border")?.value as boolean) || false;
  }, []);

  return <RouterProvider router={router} />;
};

export default App;
