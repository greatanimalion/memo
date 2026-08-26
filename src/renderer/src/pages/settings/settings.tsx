import React, { useState } from "react";
import { getLocalStore } from "@renderer/utils/localStore";
import ThemeSelector from "./components/ThemeSelector";

const SettingPage: React.FC = () => {
  const [selectedTheme, setSelectedTheme] = useState(() => {
    const theme = (getLocalStore("theme")?.value as number) || 0;
    return theme;
  });

  const handleThemeChange = (themeValue: number) => {
    setSelectedTheme(themeValue);
  };

  return (
    <div className="flex-1 overflow-y-auto p-8" style={{ backgroundColor: "var(--bg-secondary)" }}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>设置</h1>
          <p style={{ color: "var(--text-tertiary)" }}>管理您的主题偏好</p>
        </div>

        <ThemeSelector
          selectedTheme={selectedTheme}
          onThemeChange={handleThemeChange}
        />
      </div>
    </div>
  );
};

export default SettingPage;