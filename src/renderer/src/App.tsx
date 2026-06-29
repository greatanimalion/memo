import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "./routes";
import { getLocalStore } from "./utils/localStore";
import { setTheme } from "./hooks/theme";

const App = () => {
  useEffect(() => {
    const theme = (getLocalStore("theme")?.value as number) || 0;
    setTheme(theme);
    const _border = (getLocalStore("_border")?.value as boolean) || false;
    document.documentElement.style.setProperty(
      "--color-gray-200",
      _border ? "black" : "oklch(92.8% 0.006 264.531)",
    );
  }, []);

  return <RouterProvider router={router} />;
};

export default App;
