import { useEffect, useState, ReactNode } from "react";
import { ConfigProvider, theme as antdTheme } from "antd";
import { getAntdThemeFromCSS } from "@renderer/utils/themeUtils";
import type { ThemeConfig } from "antd";

interface AntDesignThemeProviderProps {
  children: ReactNode;
}

const isDarkTheme = (): boolean => {
  const darkThemes = [
    "theme-classic-black",
    "theme-modern-dark",
    "theme-deep-blue",
    "theme-premium-gray",
  ];
  return darkThemes.some((cls) => document.body.classList.contains(cls));
};

const AntDesignThemeProvider = ({ children }: AntDesignThemeProviderProps) => {
  const [themeConfig, setThemeConfig] = useState<ThemeConfig>(
    getAntdThemeFromCSS(),
  );
  const [isDark, setIsDark] = useState(isDarkTheme());

  useEffect(() => {
    const updateTheme = () => {
      setThemeConfig(getAntdThemeFromCSS());
      setIsDark(isDarkTheme());
    };

    const observer = new MutationObserver(() => {
      updateTheme();
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
      subtree: false,
    });

    updateTheme();

    return () => observer.disconnect();
  }, []);

  return (
    <ConfigProvider
      theme={{
        ...themeConfig,
        algorithm: isDark ? antdTheme.darkAlgorithm : undefined,
      }}
    >
      {children}
    </ConfigProvider>
  );
};

export default AntDesignThemeProvider;