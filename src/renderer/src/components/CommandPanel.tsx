import React, { useEffect, useState } from 'react';
import { ThunderboltOutlined, FolderAddOutlined, FileAddOutlined, SearchOutlined, FileOutlined } from '@ant-design/icons';
import { getRecentMemorys } from '@renderer/services/memeoy';
import { Memory } from '@type';
import { formatFileSize, formatRelativeTime } from '@renderer/utils';
import { memerySize } from '@renderer/services';

const CommandPanel: React.FC = () => {
  const [recentFile, setRecentFile] = useState<Memory[]>([]);
  const [memorySize, setMemorySize] = useState<number>(0);
  const quickCommands = [
    { id: 1, title: 'AI 助手', description: '使用AI编写文件内容', shortcut: '⌘K', icon: <ThunderboltOutlined /> },
    { id: 2, title: '新建文件夹', description: '创建新的文件夹', shortcut: '⌘N', icon: <FolderAddOutlined /> },
    { id: 3, title: '新建文档', description: '创建新的文档', shortcut: '⌘D', icon: <FileAddOutlined /> },
    { id: 4, title: '文件搜索', description: '搜索所有文件', shortcut: '⌘F', icon: <SearchOutlined /> },
  ];
  useEffect(() => {
    const _ = async () => {
      const _recentFiles = await getRecentMemorys();
      setRecentFile(_recentFiles.slice(0, 5));
    }
    memerySize().then(e=>{
      setMemorySize(Number(e.data))
    })
    _()
  }, [])
  return (
    <div className="w-70 bg-white border-l border-gray-200 flex flex-col overflow-y-auto max-lg:w-0 transition-width duration-300 h-full overflow-y-auto flex-shrink-0">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">核心功能</h3>
        <div className="space-y-2">
          {quickCommands.map((cmd) => (
            <button
              key={cmd.id}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                  {cmd.icon}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{cmd.title}</p>
                  <p className="text-xs text-gray-500">{cmd.description}</p>
                </div>
              </div>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{cmd.shortcut}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 最近访问 */}
      <div className="p-4 border-b border-gray-200 flex-1 ">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">最近访问</h3>
        <div className="space-y-2 ">
          {recentFile.map((file) => (
            <button
              key={file.id}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <FileOutlined className="text-blue-500 text-lg" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{file.title}</p>
                  <p className="text-xs text-gray-500">{formatRelativeTime(file.updated)}</p>
                </div> 
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 存储空间 */}
      <div className="p-4 bg-gray-50">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">存储空间</h3>
         <span className="text-sm font-medium text-blue-600">{Math.ceil(memorySize/1024/1024/1024 * 10)}%</span>
        </div>
        <div className="w-full bg-[#e5e7eb] rounded-full h-2 mb-2">
          <div className="bg-blue-500 h-2 rounded-full" style={{ width: Math.ceil(memorySize/1024/1024/1024 * 10) + '%' }}></div>
        </div>
        <p className="text-xs text-gray-500">已使用{formatFileSize(memorySize)} / 10 GB</p>
      </div>
    </div>
  );
};

export default CommandPanel;
