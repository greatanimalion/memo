import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  HomeOutlined,
  SnippetsOutlined,
  SettingOutlined,
  UserOutlined,
  MessageOutlined,
  InsertRowAboveOutlined,
  GlobalOutlined,
  WalletOutlined
} from '@ant-design/icons';
import { ViewType } from '@type/common';

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const currentView = location.pathname.slice(1) as ViewType || 'home';

  const menuItems = [
    { id: 'home' as ViewType, label: '首页', icon: <HomeOutlined /> },
    { id: 'memo' as ViewType, label: '备忘录', icon: <SnippetsOutlined /> },
    { id: 'diary' as ViewType, label: '日记', icon: <InsertRowAboveOutlined /> },
    { id: 'chat' as ViewType, label: 'AI 聊天', icon: <MessageOutlined /> },
    { id: 'textEditor' as ViewType, label: '文本编辑器', icon: <WalletOutlined /> },
    { id: 'web' as ViewType, label: 'Web', icon: <GlobalOutlined /> },
    { id: 'settings' as ViewType, label: '设置', icon: <SettingOutlined /> },
  ];

  const handleNavigate = (view: ViewType) => {
    navigate(`/${view}`);
  };

  return (
    <div className={`w-50 max-xl:w-16.5 transition-width bg-white border-r transition-all duration-200 border-gray-200 flex flex-col`}>
      {/* 核心功能区 */}
      <div className="flex-1 py-4">
        <div className="px-4 mb-2 max-xl:hidden">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">核心功能</span>
        </div>
        <div className="px-3 space-y-0.5">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              className={`cursor-pointer w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-200 mb-1 ${currentView === item.id
                ? 'globalTheme shadow-md'
                : 'text-gray-700 hover:bg-gray-100'
                }`}
            >
              <div className="flex items-center gap-3">
                <span>{item.icon}</span>
                <span className={`font-medium text-sm max-xl:hidden`}>
                  {item.label}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
      {/* 个人区 */}
      <div className="border-t border-gray-200 py-4">
        <div className="px-4 mb-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">个人</span>
        </div>
        <div className="px-3 space-y-0.5">
          <button
            onClick={() => handleNavigate('person')}
            className={`cursor-pointer w-full flex items-center gap-3 px-3 py-2.5 ${currentView === 'person' ? 'bg-blue-600 text-white' : 'text-gray-700'} rounded-lg transition-all duration-200`}
          >
            <UserOutlined className="text-gray-500 text-base" />
            <span className="font-medium text-sm max-xl:hidden">APIKey管理</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
