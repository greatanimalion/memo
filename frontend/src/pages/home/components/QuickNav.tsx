import React from "react";
import { useNavigate } from "react-router-dom";
import {
  SnippetsOutlined,
  InsertRowAboveOutlined,
  MessageOutlined,
  BookOutlined,
  GlobalOutlined,
  UserOutlined,
  SettingOutlined,
  AppstoreOutlined,
} from "@ant-design/icons";

interface SectionItem {
  path: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
}

const SECTIONS: SectionItem[] = [
  {
    path: "/memo",
    label: "备忘录",
    desc: "记录笔记与待办",
    icon: <SnippetsOutlined />,
  },
  {
    path: "/diary",
    label: "日记",
    desc: "按天记录与统计",
    icon: <InsertRowAboveOutlined />,
  },
  {
    path: "/chat",
    label: "AI 聊天",
    desc: "与智能助手对话",
    icon: <MessageOutlined />,
  },
  {
    path: "/book",
    label: "文本编辑器",
    desc: "创作与编辑作品",
    icon: <BookOutlined />,
  },
  { path: "/web", label: "Web", desc: "收藏常用网站", icon: <GlobalOutlined /> },
  {
    path: "/person",
    label: "APIKey管理",
    desc: "模型与密钥配置",
    icon: <UserOutlined />,
  },
  {
    path: "/settings",
    label: "设置",
    desc: "主题与偏好",
    icon: <SettingOutlined />,
  },
];

const QuickNav: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div
      className="rounded-2xl p-4 shadow-lg"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div className="flex items-center gap-3 mb-2.5">
        <AppstoreOutlined
          className="text-2xl"
          style={{ color: "var(--accent-color)" }}
        />
        <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          全部板块
        </h2>
        <span className="ml-auto text-sm" style={{ color: "var(--text-tertiary)" }}>
          共 {SECTIONS.length} 个板块
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-4">
        {SECTIONS.map((section) => (
          <button
            key={section.path}
            type="button"
            onClick={() => navigate(section.path)}
            className="cursor-pointer text-left rounded-xl p-4 transition-all duration-200 border"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              borderColor: "var(--border-color)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-hover)";
              e.currentTarget.style.borderColor = "var(--accent-color)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
              e.currentTarget.style.borderColor = "var(--border-color)";
            }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-lg mb-3"
              style={{
                backgroundColor: "var(--bg-primary)",
                color: "var(--accent-color)",
              }}
            >
              {section.icon}
            </div>
            <div
              className="text-sm font-medium truncate mb-1"
              style={{ color: "var(--text-primary)" }}
            >
              {section.label}
            </div>
            <div
              className="text-xs truncate"
              style={{ color: "var(--text-tertiary)" }}
            >
              {section.desc}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuickNav;
