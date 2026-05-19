import { useState } from 'react';
import { BorderOutlined, CloseOutlined, MinusOutlined, BugOutlined, ExpandOutlined, CloudUploadOutlined, CloudDownloadOutlined } from '@ant-design/icons';
import { ipcRenderer } from 'electron';
import { useRef } from 'react';
import { message, Tooltip } from 'antd';
import { exportAll, importAll } from '../services';
import { fileToText } from '../utils';

const Header: React.FC = () => {
  const handleClick = (op: string) => {
    ipcRenderer.send(op);
  }
  const header = useRef<HTMLDivElement>(null)
  const [maximized, setMaximized] = useState(false)
  const handleExport = async () => {
    const data = await exportAll();
    console.log(data);
    ipcRenderer.send('exportFile', { filename: '备份数据.json', content: JSON.stringify(data.data) });
  }
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
        <Tooltip placement="bottomRight" title={'全量导入'}>
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors  relative cursor-pointer" onClick={(e) => {
            e.stopPropagation()
            e.currentTarget.querySelector('input')!.click()
          }} >
            <input type="file"
              className='absolute top-0 left-0 w-full h-full opacity-0 ' style={{ zIndex: -1 }}
              accept=".json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const res: string = await fileToText(file) as string;
                const d = await importAll(res)
                if (d.code == 200) message.success('导入成功')
                ipcRenderer.send('reload')
              }} />
            <CloudDownloadOutlined className="text-gray-600 text-lg cursor-pointer" />
          </button>
        </Tooltip>
        <Tooltip placement="bottomRight" title={'全量导出'}>
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer" onClick={handleExport}>
            <CloudUploadOutlined className="text-gray-600 text-lg" />
          </button>
        </Tooltip>
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
