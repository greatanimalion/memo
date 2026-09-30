import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  HomeOutlined,
  SnippetsOutlined,
  SettingOutlined,
  UserOutlined,
  MessageOutlined,
  InsertRowAboveOutlined,
  GlobalOutlined,
  BookOutlined,
} from "@ant-design/icons";
import { ViewType } from "@renderer/types/common";

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const currentView = (location.pathname.slice(1) as ViewType) || "home";

  const menuItems = [
    { id: "home" as ViewType, label: "首页", icon: <HomeOutlined /> },
    { id: "memo" as ViewType, label: "备忘录", icon: <SnippetsOutlined /> },
    {
      id: "diary" as ViewType,
      label: "日记",
      icon: <InsertRowAboveOutlined />,
    },
    { id: "chat" as ViewType, label: "AI 聊天", icon: <MessageOutlined /> },
    {
      id: "book" as ViewType,
      label: "文本编辑器",
      icon: <BookOutlined />,
    },
    { id: "web" as ViewType, label: "Web", icon: <GlobalOutlined /> },
    { id: "settings" as ViewType, label: "设置", icon: <SettingOutlined /> },
  ];

  const handleNavigate = (view: ViewType) => {
    navigate(`/${view}`);
  };

  return (
    <div
      className="w-40 max-xl:w-16.5 transition-width transition-all duration-200 flex flex-col shrink-0"
      style={{ backgroundColor: 'var(--bg-primary)', borderRight: '1px solid var(--border-color)' }}
    >
      {/* 核心功能区 */}
      <div className="flex-1 py-4">
        <div className="px-4 mb-2 max-xl:hidden">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            核心功能
          </span>
        </div>
        <div className="px-3 space-y-0.5">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              className="cursor-pointer w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-200 mb-1"
              style={{
                backgroundColor: currentView === item.id ? 'var(--bg-primary)' : 'transparent',
                color: currentView === item.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: currentView === item.id ? 'var(--shadow-md)' : 'none',
              }}
              onMouseEnter={(e) => {
                if (currentView !== item.id) e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                if (currentView !== item.id) e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <div className="flex items-center gap-3">
                <span>{item.icon}</span>
                <span className="font-medium text-sm max-xl:hidden">
                  {item.label}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
      {/* 个人区 */}
      <div className="py-4" style={{ borderTop: '1px solid var(--border-color)' }}>
        <div className="px-4 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            个人
          </span>
        </div>
        <div className="px-3 space-y-0.5">
          <button
            onClick={() => handleNavigate("person")}
            className="cursor-pointer w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200"
            style={{
              backgroundColor: currentView === "person" ? 'var(--accent-color)' : 'transparent',
              color: currentView === "person" ? '#fff' : 'var(--text-secondary)',
            }}
            onMouseEnter={(e) => {
              if (currentView !== "person") e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
            }}
            onMouseLeave={(e) => {
              if (currentView !== "person") e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <UserOutlined className="text-base" style={{ color: currentView === "person" ? '#fff' : 'var(--text-tertiary)' }} />
            <span className="font-medium text-sm max-xl:hidden">
              APIKey管理
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
