import React from 'react';
import { useWriterStore } from '@renderer/store/useWriterStore';
import { Select, Slider } from 'antd';
import {
  FontSizeOutlined,
  ColumnHeightOutlined,
  FontColorsOutlined,
  BoldOutlined,
  BarChartOutlined,
  SettingOutlined,
  InfoCircleOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { FontFamily } from '../../../types/common';

interface RightPanelProps {
  content: string;
  isBookScreen: boolean;
}

const fontOptions: { value: FontFamily; label: string }[] = [
  { value: 'sans', label: '无衬线' },
  { value: 'serif', label: '衬线体' },
  { value: 'mono', label: '等宽体' },
  { value: 'kaiti', label: '楷体' },
  { value: 'songti', label: '宋体' },
];

const RightPanel: React.FC<RightPanelProps> = ({ content, isBookScreen }) => {
  const book = useWriterStore((s) => s.book);
  const currentChapterId = useWriterStore((s) => s.currentChapterId);
  const editorSettings = useWriterStore((s) => s.editorSettings);
  const setEditorFont = useWriterStore((s) => s.setEditorFont);
  const setEditorFontSize = useWriterStore((s) => s.setEditorFontSize);
  const setEditorLineHeight = useWriterStore((s) => s.setEditorLineHeight);
  const setEditorFontWeight = useWriterStore((s) => s.setEditorFontWeight);

  const currentChapter = book.chapters.find((c) => c.id === currentChapterId);

  const charCount = content.length;
  const chineseChars = (content.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;
  const englishWords = content
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  const paragraphCount = content.split(/\n\n+/).filter(p => p.trim()).length;
  const sentenceCount = (content.match(/[.!?。！？]+/g) || []).length || (content.trim() ? 1 : 0);

  if (isBookScreen) {
    return null;
  }

  return (
    <div className="w-64 shrink-0 border-l border-gray-200/80 bg-white/70 backdrop-blur-sm overflow-y-auto max-lg:w-0 transition-all duration-300">
      {/* 字体设置 */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-4">
          <SettingOutlined className="text-indigo-400 text-sm" />
          <span className="text-sm font-semibold text-gray-700">字体设置</span>
        </div>

        {/* 字体选择 */}
        <div className="mb-4">
          <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">字体</label>
          <div className="flex items-center gap-2">
            <FontColorsOutlined className="text-gray-300 text-sm" />
            <Select
              size="small"
              value={editorSettings.fontFamily}
              onChange={setEditorFont}
              options={fontOptions}
              className="flex-1"
            />
          </div>
        </div>

        {/* 字号设置 */}
        <div className="mb-4">
          <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">字号</label>
          <div className="flex items-center gap-2">
            <FontSizeOutlined className="text-gray-300 text-sm" />
            <Slider
              className="flex-1"
              min={12}
              max={30}
              value={editorSettings.fontSize}
              onChange={setEditorFontSize}
              tooltip={{ formatter: (v) => `${v}px` }}
            />
            <span className="text-[11px] text-gray-500 w-8 text-right font-medium tabular-nums">{editorSettings.fontSize}px</span>
          </div>
        </div>

        {/* 行间距设置 */}
        <div className="mb-4">
          <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">行距</label>
          <div className="flex items-center gap-2">
            <ColumnHeightOutlined className="text-gray-300 text-sm" />
            <Slider
              className="flex-1"
              min={1.2}
              max={2.5}
              step={0.1}
              value={editorSettings.lineHeight}
              onChange={setEditorLineHeight}
              tooltip={{ formatter: (v) => `${v}` }}
            />
            <span className="text-[11px] text-gray-500 w-6 text-right font-medium tabular-nums">{editorSettings.lineHeight}</span>
          </div>
        </div>

        {/* 字体粗细设置 */}
        <div>
          <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">粗细</label>
          <div className="flex items-center gap-2">
            <BoldOutlined className="text-gray-300 text-sm" />
            <Slider
              className="flex-1"
              min={100}
              max={900}
              step={100}
              value={editorSettings.fontWeight}
              onChange={setEditorFontWeight}
              tooltip={{ formatter: (v) => `${v}` }}
            />
            <span className="text-[11px] text-gray-500 w-8 text-right font-medium tabular-nums">{editorSettings.fontWeight}</span>
          </div>
        </div>
      </div>

      {/* 字数统计 */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-3">
          <BarChartOutlined className="text-indigo-400 text-sm" />
          <span className="text-sm font-semibold text-gray-700">字数统计</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: '总字符', value: charCount },
            { label: '中文', value: chineseChars },
            { label: '英文词', value: englishWords },
            { label: '段落', value: paragraphCount },
            { label: '句子', value: sentenceCount },
            { label: '行数', value: content.split('\n').length },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-gray-50/80 rounded-lg p-2.5 hover:bg-gray-100/80 transition-colors"
            >
              <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{stat.label}</div>
              <div className="text-lg font-bold text-gray-700 mt-0.5 tabular-nums">{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 章节详情 */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <InfoCircleOutlined className="text-indigo-400 text-sm" />
          <span className="text-sm font-semibold text-gray-700">章节详情</span>
        </div>
        {currentChapter ? (
          <div className="bg-gray-50/80 rounded-xl p-3.5 space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-gray-400">标题</span>
              <span className="text-[12px] text-gray-700 font-medium truncate ml-2 max-w-[140px]">{currentChapter.title}</span>
            </div>
            <div className="w-full h-px bg-gray-100" />
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-gray-400">序号</span>
              <span className="text-[12px] text-gray-600 tabular-nums">{currentChapter.order}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-gray-400">分卷</span>
              <span className="text-[12px] text-gray-600 truncate ml-2 max-w-[140px]">
                {currentChapter.volumeId
                  ? book.volumes.find((v) => v.id === currentChapter.volumeId)?.title || '-'
                  : '未分组'}
              </span>
            </div>
            <div className="w-full h-px bg-gray-100" />
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-gray-400">创建</span>
              <span className="text-[12px] text-gray-600 tabular-nums">
                {currentChapter.createdAt
                  ? new Date(currentChapter.createdAt).toLocaleString('zh-CN')
                  : '-'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-gray-400">更新</span>
              <span className="text-[12px] text-gray-600 tabular-nums">
                {currentChapter.updatedAt
                  ? new Date(currentChapter.updatedAt).toLocaleString('zh-CN')
                  : '-'}
              </span>
            </div>
            {currentChapter.metadata?.summary && (
              <>
                <div className="w-full h-px bg-gray-100" />
                <div>
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">AI 摘要</div>
                  <div className="text-[11px] text-gray-500 leading-relaxed">{currentChapter.metadata.summary}</div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="bg-gray-50/80 rounded-xl p-4 text-center">
            <FileTextOutlined className="text-2xl text-gray-200 mb-2" />
            <div className="text-[11px] text-gray-400">未选择章节</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RightPanel;
