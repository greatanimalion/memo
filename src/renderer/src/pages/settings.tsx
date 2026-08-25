import React, { useEffect, useState } from "react";
import { BgColorsOutlined } from "@ant-design/icons";

import { setTheme } from "@renderer/hooks/theme";
import { getLocalStore, setLocalStore } from "@renderer/utils/localStore";

const colors = [
  { value: 0, name: "经典黑白", bg: "#000000", text: "#FFFFFF" },
  { value: 1, name: "极简主义", bg: "#FFFFFF", text: "#333333" },
  { value: 2, name: "现代暗黑", bg: "#121212", text: "#E0E0E0" },
  { value: 3, name: "护眼豆沙", bg: "#F5F5DC", text: "#555555" },
  { value: 4, name: "深海蓝调", bg: "#1A365D", text: "#F5F5F5" },
  { value: 5, name: "复古羊皮纸", bg: "#F4E4BC", text: "#4A3B2A" },
  { value: 6, name: "高级灰", bg: "#2C3E50", text: "#ECF0F1" },
  { value: 7, name: "深蓝色", bg: "#2b7fff", text: "#fff" },
];

const SettingPage: React.FC = () => {
  const [selectedTheme, setSelectedTheme] = useState(0);

  useEffect(() => {
    const theme = (getLocalStore("theme")?.value as number) || 0;
    setSelectedTheme(theme);
  }, []);

  const handleThemeChange = (themeValue: number) => {
    setTheme(themeValue);
    setSelectedTheme(themeValue);
    setLocalStore("theme", { value: themeValue });
  };

  return (
    <div className="flex-1 overflow-y-auto p-8" style={{ backgroundColor: "var(--bg-secondary)" }}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>设置</h1>
          <p style={{ color: "var(--text-tertiary)" }}>管理您的主题偏好</p>
        </div>

        <div className="rounded-2xl p-6 shadow-lg" style={{ backgroundColor: "var(--bg-primary)" }}>
          <div className="flex items-center gap-3 mb-6">
            <BgColorsOutlined className="text-2xl" style={{ color: "var(--accent-color)" }} />
            <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>主题颜色</h2>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              选择主题颜色
            </label>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
              {colors.map((color) => (
                <button
                  key={color.value}
                  onClick={() => handleThemeChange(color.value)}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer transition-all"
                  style={{
                    boxShadow: selectedTheme === color.value ? "0 0 0 2px var(--accent-color), var(--shadow-md)" : "var(--shadow-sm)",
                  }}
                >
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center cursor-pointer"
                    style={{ backgroundColor: color.bg, color: color.text }}
                  >
                    你好
                  </div>
                  <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                    {color.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingPage;
