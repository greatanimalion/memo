import { useState } from "react";
import {
  BorderOutlined,
  CloseOutlined,
  MinusOutlined,
  ExpandOutlined,
} from "@ant-design/icons";
import { useRef } from "react";
import {
  minimizeWindow,
  maximizeWindow,
  unmaximizeWindow,
  closeWindow,
} from "../platform";

const Header: React.FC = () => {
  const header = useRef<HTMLDivElement>(null);
  const [maximized, setMaximized] = useState(false);

  return (
    <div
      className="h-16 flex items-center justify-between px-4 dragArea"
      ref={header}
      style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)' }}
    >
      {/* 左侧：应用名称和面包屑 */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--text-primary)' }}>
            <span className="font-bold text-sm" style={{ color: 'var(--bg-primary)' }}>本</span>
          </div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>多功能记事本</h1>
        </div>
      </div>
      {/* 右侧：工具图标 */}
      <div className="flex items-center gap-3 noDragArea">
        <button
          className="p-2 rounded-lg transition-colors cursor-pointer"
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          onClick={() => minimizeWindow()}
        >
          <MinusOutlined />
        </button>
        {maximized ? (
          <button
            className="p-2 rounded-lg transition-colors cursor-pointer"
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            onClick={() => {
              setMaximized(false);
              unmaximizeWindow();
            }}
          >
            <BorderOutlined className="text-lg" style={{ color: 'var(--text-secondary)' }} />
          </button>
        ) : (
          <button
            className="p-2 rounded-lg transition-colors cursor-pointer"
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            onClick={() => {
              setMaximized(true);
              maximizeWindow();
            }}
          >
            <ExpandOutlined className="text-lg" />
          </button>
        )}
        <button
          className="p-2 rounded-lg transition-colors cursor-pointer"
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <CloseOutlined
            className="text-lg"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--error-color)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
            onClick={() => closeWindow()}
          />
        </button>
      </div>
    </div>
  );
};

export default Header;
