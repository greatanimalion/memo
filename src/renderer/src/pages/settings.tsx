import React, { useEffect, useState } from 'react';
import { BgColorsOutlined } from '@ant-design/icons';
import {  message, Switch } from 'antd';

import { setTheme } from '../hooks/theme';
import { getLocalStore, setLocalStore } from '../utils/localStore';
const colors = [{
  value: 0,
  name: "经典黑白",
  bg: "#000000",
  text: "#FFFFFF",
}, {
  value: 1,
  name: "极简主义",
  bg: "#FFFFFF",
  text: "#333333",
}, {
  value:2,
  name: "现代暗黑",
  bg: "#121212",
  text: "#E0E0E0",
}, {
  value:3,
  name: "护眼豆沙",
  bg: "#F5F5DC",
  text: "#555555",
}, {
  value:4,
  name: "深海蓝调",
  bg: "#1A365D",
  text: "#F5F5F5",
}, {
  value:5,
  name: "复古羊皮纸",
  bg: "#F4E4BC",
  text: "#4A3B2A",
}, {
  value:6,
  name: "高级灰",
  bg: "#2C3E50",
  text: "#ECF0F1",
}, {
  value:7,
  name: '深蓝色',
  bg: '#2b7fff',
  text: '#fff',
}]
const SettingPage: React.FC = () => {

  const [selectedTheme, setSelectedTheme] = useState(0);
  const [_border, set_Border] = useState(false);
  const onChange = (checked: boolean) => {
    // 修改全局根节点的变量值
    document.documentElement.style.setProperty('--color-gray-200', checked ? 'black' : 'oklch(92.8% 0.006 264.531)');
    set_Border(checked);
    setLocalStore('_border', { value: checked });
  };
  useEffect(() => {
    const theme = getLocalStore('theme')?.value as number || 0;
    const _border = getLocalStore('_border')?.value as boolean || false;
    set_Border(_border);
    setSelectedTheme(theme);
  }, [])
  const handleThemeChange = (i: number) => {
    setTheme(i)
    setSelectedTheme(i)
    setLocalStore('theme', { value: i });
    message.success('主题颜色已更新');
  };
  return (
    <div className="flex-1 bg-gray-50 overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 页面标题 */} 
        <div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">设置</h1>
          <p className="text-gray-500">管理您的主题偏好</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-lg ">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">深色边框</label>
            <Switch checked={_border} onChange={onChange} />
          </div>
        </div>
        {/* 主题颜色设置 */}
        <div className="bg-white rounded-2xl p-6 shadow-lg ">
          <div className="flex items-center gap-3 mb-6">
            <BgColorsOutlined className="text-2xl" />
            <h2 className="text-2xl font-bold text-gray-800">主题颜色</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">选择主题颜色</label>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                {colors.map((color, i) => (
                  <button
                    key={color.value}
                    onClick={() => handleThemeChange(color.value)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer   transition-all ${selectedTheme === i
                      ? ' shadow-md'
                      : ' '
                      }`}
                  >{color.value}
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center cursor-pointer`}
                      style={{ backgroundColor: color.bg, color: color.text }}
                    >你好</div>
                    <span className="text-sm font-medium text-gray-700">{color.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingPage;


// function getIOCN(url: string) {
// https://icon.bqb.cool?url=目标网址
// }