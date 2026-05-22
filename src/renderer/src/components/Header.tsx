import { useState } from 'react';
import { BorderOutlined, CloseOutlined, MinusOutlined, BugOutlined, ExpandOutlined } from '@ant-design/icons';
import { ipcRenderer } from 'electron';
import { useRef } from 'react';
import {  Tooltip } from 'antd';

const Header: React.FC = () => {
  const handleClick = (op: string) => {
    ipcRenderer.send(op);
  }
  const header = useRef<HTMLDivElement>(null)
  const [maximized, setMaximized] = useState(false)

  return (
    <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 dragArea" ref={header}>
      {/* 左侧：应用名称和面包屑 */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 globalTheme rounded-lg flex items-center justify-center">
            <span className=" font-bold text-sm">本</span>
          </div>
          <h1 className="text-lg font-semibold text-gray-800">多功能记事本</h1>
        </div>
      </div>
      {/* 右侧：工具图标 */}
      <div className="flex items-center gap-3 noDragArea">
        <Tooltip placement="bottomRight" title={'控制台'}>
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer" onClick={() => handleClick('toggleDevTools')}>
            <BugOutlined className="text-gray-600 text-lg" />
          </button>
        </Tooltip>
        <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer" onClick={() => handleClick('minimizeWindow')}>
          <MinusOutlined />
        </button>
        {maximized ? <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer" onClick={() => {
          setMaximized(false),
            handleClick('unmaximizeWindow')
        }} >
          <BorderOutlined className="text-gray-600 text-lg" />
        </button>
          : <button onClick={() => {
            setMaximized(true),
              handleClick('maxmizeWindow')
          }}><ExpandOutlined className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer" /></button>}
        <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer">
          <CloseOutlined className="text-gray-600 text-lg hover:text-red-500" onClick={() => handleClick('closeWindow')} />
        </button>
      </div>
    </div>
  );
};

export default Header;
