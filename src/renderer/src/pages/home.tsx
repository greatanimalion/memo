import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileTextOutlined, StarOutlined } from '@ant-design/icons';

import { formatTime, formatDate, formatRelativeTime, formatDateByTimestamp } from '@renderer/utils/dateUtils';
import { getMemorysStarred, getRecentMemorys } from '@renderer/services/memeoy';
import { Memory } from '@type';
import { Empty } from 'antd';
import RealTimeClock from '@renderer/components/clock';
import AIPart from '@renderer/components/AiPart';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [recentFiles, setRecentFiles] = useState<Memory[]>([]);
  const [starredFiles, setStarredFiles] = useState<Memory[]>([]);
  
  async function init() {
    try {
      const _recentFiles = await getRecentMemorys();
      setRecentFiles(_recentFiles);
      const starreds = await getMemorysStarred();
      setStarredFiles(starreds);
    } catch (error) { }
  }
  
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    init()
    return () => clearInterval(timer);
  }, []);

  const openRecentFile = (file: Memory) => {
    navigate('/memo', { state: { file } });
  };

   return (
    <div className="flex-1 bg-gray-50 overflow-y-auto p-4 text-gray-600">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 板块一：时间和日期 */}
        <div className="bg-linear-to-r  rounded-2xl p-8 shadow-lg">
          <div className=" inset-0 pointer-events-none overflow-hidden z-0">
            <div className="absolute w-75 h-75 rounded-full bg-sky-500 opacity-15 blur-[100px] top-[10%] right-[5%]" />
            <div className="absolute w-50 h-50 rounded-full bg-indigo-500 opacity-15 blur-[100px] bottom-[10%] right-[5%]" />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center">
                <RealTimeClock />
              </div>
              <div>
                <h1 className="text-6xl font-bold mb-2">{formatTime(currentTime)}</h1>
                <p className="text-2xl opacity-90">{formatDate(currentTime)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg opacity-80 mb-1">欢迎回来</p>
              <p className="text-2xl font-semibold">用户</p>
            </div>
          </div>
        </div>
        {/* 人工智能 */}
        <AIPart />
        {/*我的收藏和近期文件 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 ">
          {/* 我的收藏 */}
          <div className="bg-white rounded-2xl p-6 shadow-lg">
            <div className="flex items-center gap-3 mb-6">
              <StarOutlined className="text-2xl "   />
              <h2 className="text-2xl font-bold text-gray-800">我的收藏</h2>
              <span className="ml-auto text-sm text-gray-500">共 {starredFiles.length} 项</span>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {starredFiles.map((item) => (
                <div
                  key={item.id}
                  onClick={() => openRecentFile(item)}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-4">
                    <FileTextOutlined className="text-xl text-blue-500" />
                    <p className="font-medium text-gray-800 group-hover:text-blue-600 transition-colors">{item.title}</p>
                  </div>
                  <StarOutlined className="text-yellow-500" style={{ color: 'oklch(79.5% 0.184 86.047)' }} />
                </div>
              ))}
              {
                starredFiles.length === 0 && (
                  <div className="text-center py-10">
                    <div className='p-5'><Empty /></div>
                  </div>
                )
              }
            </div>
          </div>
          {/* 板块二：近期文件 */}
          <div className="bg-white rounded-2xl p-6 shadow-lg">
            <div className="flex items-center gap-3 mb-6">
              <FileTextOutlined className="text-2xl text-blue-500" />
              <h2 className="text-2xl font-bold text-gray-800">近期文件</h2>
              <span className="ml-auto text-sm text-gray-500">共 {recentFiles.length} 个文件</span>
            </div>
            <div className="space-y-3  max-h-96 overflow-y-auto">
              {recentFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer group"
                  onClick={() => openRecentFile(file)}
                >
                  <div className="flex items-center gap-4">
                    <FileTextOutlined className="text-xl text-blue-500" />
                    <div>
                      <p className="font-medium text-gray-800 group-hover:text-blue-600 transition-colors">{file.title}</p>
                      <p className="text-sm text-gray-500">创建：{formatDateByTimestamp(file.created || 0)}</p>
                    </div>
                  </div>
                  <span className="text-sm text-gray-500">更新于：{formatRelativeTime(file.updated || 0)}</span>
                </div>
              ))}
              {
                recentFiles.length === 0 && (
                  <div className="text-center py-10">
                    <div className='p-5'><Empty /></div>
                  </div>
                )
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
