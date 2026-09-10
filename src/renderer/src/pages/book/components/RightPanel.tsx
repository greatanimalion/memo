import React, { useState } from 'react';
import { useWriterStore } from '@renderer/store/useWriterStore';
import { Select, Slider, Input, Modal, Empty } from 'antd';
import {
  FontSizeOutlined,
  ColumnHeightOutlined,
  FontColorsOutlined,
  BoldOutlined,
  BarChartOutlined,
  SettingOutlined,
  InfoCircleOutlined,
  FileTextOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { FontFamily } from '@renderer/types/common';
import { searchBook, SearchMatch } from '@renderer/services/book';

interface RightPanelProps {
  isBookScreen: boolean;
}

const fontOptions: { value: FontFamily; label: string }[] = [
  { value: 'sans', label: '无衬线' },
  { value: 'serif', label: '衬线体' },
  { value: 'mono', label: '等宽体' },
  { value: 'kaiti', label: '楷体' },
  { value: 'songti', label: '宋体' },
];

const RightPanel: React.FC<RightPanelProps> = ({ isBookScreen }) => {
  const book = useWriterStore((s) => s.book);
  const currentChapter = useWriterStore((s) => s.currentChapter);
  const editorSettings = useWriterStore((s) => s.editorSettings);
  const setEditorFont = useWriterStore((s) => s.setEditorFont);
  const setEditorFontSize = useWriterStore((s) => s.setEditorFontSize);
  const setEditorLineHeight = useWriterStore((s) => s.setEditorLineHeight);
  const setEditorFontWeight = useWriterStore((s) => s.setEditorFontWeight);

  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<SearchMatch[]>([]);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    const kw = searchKeyword.trim();
    if (!kw || !book.id) return;
    setSearching(true);
    try {
      console.log('[Search] book.id=', book.id, 'keyword=', kw);
      const results = await searchBook(book.id, kw);
      console.log('[Search] results=', results);
      setSearchResults(results);
      setSearchModalOpen(true);
    } catch (e) {
      console.error('[Search] error', e);
      setSearchResults([]);
      setSearchModalOpen(true);
    } finally {
      setSearching(false);
    }
  };

  const highlightKeyword = (text: string, keyword: string) => {
    if (!keyword) return text;
    const parts = text.split(new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === keyword.toLowerCase() ? (
        <span key={i} className="bg-yellow-300/40 text-yellow-600 dark:text-yellow-400 rounded px-0.5">{part}</span>
      ) : (
        part
      ),
    );
  };

  const content = currentChapter?.content || '';

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
    <div className="w-64 shrink-0 border-l border-theme-light bg-theme-primary/70 backdrop-blur-sm overflow-y-auto max-lg:w-0 transition-all duration-300">
      {/* 全文检索 */}
      <div className="p-4 border-b border-theme-light">
        <div className="flex items-center gap-2 mb-3">
          <SearchOutlined className="text-accent text-sm" />
          <span className="text-sm font-semibold text-theme-primary">全文检索</span>
        </div>
        <Input.Search
          size="small"
          placeholder="输入关键词搜索..."
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          onSearch={handleSearch}
          loading={searching}
        />
      </div>

      {/* 字体设置 */}
      <div className="p-4 border-b border-theme-light">
        <div className="flex items-center gap-2 mb-4">
          <SettingOutlined className="text-accent text-sm" />
          <span className="text-sm font-semibold text-theme-primary">字体设置</span>
        </div>

        {/* 字体选择 */}
        <div className="mb-4">
          <label className="text-[11px] font-medium text-theme-muted uppercase tracking-wider mb-1.5 block">字体</label>
          <div className="flex items-center gap-2">
            <FontColorsOutlined className="text-theme-muted text-sm" />
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
          <label className="text-[11px] font-medium text-theme-muted uppercase tracking-wider mb-1.5 block">字号</label>
          <div className="flex items-center gap-2">
            <FontSizeOutlined className="text-theme-muted text-sm" />
            <Slider
              className="flex-1"
              min={12}
              max={30}
              value={editorSettings.fontSize}
              onChange={setEditorFontSize}
              tooltip={{ formatter: (v) => `${v}px` }}
            />
            <span className="text-[11px] text-theme-secondary w-8 text-right font-medium tabular-nums">{editorSettings.fontSize}px</span>
          </div>
        </div>

        {/* 行间距设置 */}
        <div className="mb-4">
          <label className="text-[11px] font-medium text-theme-muted uppercase tracking-wider mb-1.5 block">行距</label>
          <div className="flex items-center gap-2">
            <ColumnHeightOutlined className="text-theme-muted text-sm" />
            <Slider
              className="flex-1"
              min={1.2}
              max={2.5}
              step={0.1}
              value={editorSettings.lineHeight}
              onChange={setEditorLineHeight}
              tooltip={{ formatter: (v) => `${v}` }}
            />
            <span className="text-[11px] text-theme-secondary w-6 text-right font-medium tabular-nums">{editorSettings.lineHeight}</span>
          </div>
        </div>

        {/* 字体粗细设置 */}
        <div>
          <label className="text-[11px] font-medium text-theme-muted uppercase tracking-wider mb-1.5 block">粗细</label>
          <div className="flex items-center gap-2">
            <BoldOutlined className="text-theme-muted text-sm" />
            <Slider
              className="flex-1"
              min={100}
              max={900}
              step={100}
              value={editorSettings.fontWeight}
              onChange={setEditorFontWeight}
              tooltip={{ formatter: (v) => `${v}` }}
            />
            <span className="text-[11px] text-theme-secondary w-8 text-right font-medium tabular-nums">{editorSettings.fontWeight}</span>
          </div>
        </div>
      </div>

      {/* 字数统计 */}
      <div className="p-4 border-b border-theme-light">
        <div className="flex items-center gap-2 mb-3">
          <BarChartOutlined className="text-accent text-sm" />
          <span className="text-sm font-semibold text-theme-primary">字数统计</span>
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
              className="bg-theme-secondary/80 rounded-lg p-2.5 hover:bg-theme-hover transition-colors"
            >
              <div className="text-[10px] font-medium text-theme-muted uppercase tracking-wider">{stat.label}</div>
              <div className="text-lg font-bold text-theme-primary mt-0.5 tabular-nums">{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 章节详情 */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <InfoCircleOutlined className="text-accent text-sm" />
          <span className="text-sm font-semibold text-theme-primary">章节详情</span>
        </div>
        {currentChapter ? (
          <div className="bg-theme-secondary/80 rounded-xl p-3.5 space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-theme-muted">标题</span>
              <span className="text-[12px] text-theme-primary font-medium truncate ml-2 max-w-35">{currentChapter.title}</span>
            </div>
            <div className="w-full h-px bg-theme-light" />
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-theme-muted">序号</span>
              <span className="text-[12px] text-theme-secondary tabular-nums">{currentChapter.order}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-theme-muted">分卷</span>
              <span className="text-[12px] text-theme-secondary truncate ml-2 max-w-35">
                {currentChapter.volumeId
                  ? book.volumes.find((v) => v.id === currentChapter.volumeId)?.title || '-'
                  : '未分组'}
              </span>
            </div>
            <div className="w-full h-px bg-theme-light" />
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-theme-muted">创建</span>
              <span className="text-[12px] text-theme-secondary tabular-nums">
                {currentChapter.createdAt
                  ? new Date(currentChapter.createdAt).toLocaleString('zh-CN')
                  : '-'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-theme-muted">更新</span>
              <span className="text-[12px] text-theme-secondary tabular-nums">
                {currentChapter.updatedAt
                  ? new Date(currentChapter.updatedAt).toLocaleString('zh-CN')
                  : '-'}
              </span>
            </div>
            {currentChapter.metadata?.summary && (
              <>
                <div className="w-full h-px bg-theme-light" />
                <div>
                  <div className="text-[10px] font-medium text-theme-muted uppercase tracking-wider mb-1">AI 摘要</div>
                  <div className="text-[11px] text-theme-secondary leading-relaxed">{currentChapter.metadata.summary}</div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="bg-theme-secondary/80 rounded-xl p-4 text-center">
            <FileTextOutlined className="text-2xl text-theme-muted mb-2" />
            <div className="text-[11px] text-theme-muted">未选择章节</div>
          </div>
        )}
      </div>

      {/* 搜索结果弹窗 */}
      <Modal
        title={`搜索结果 — "${searchKeyword}"`}
        open={searchModalOpen}
        onCancel={() => setSearchModalOpen(false)}
        footer={null}
        width={520}
        styles={{ body: { maxHeight: 400, overflowY: 'auto' } }}
      >
        {searchResults.length === 0 ? (
          <Empty description="未找到匹配内容" />
        ) : (
          <div className="space-y-3">
            <div className="text-[12px] text-theme-muted mb-2">
              共找到 <span className="font-semibold text-accent">{searchResults.length}</span> 条结果
            </div>
            {searchResults.map((item, idx) => (
              <div
                key={idx}
                className="bg-theme-secondary/60 rounded-lg p-3 hover:bg-theme-hover transition-colors"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[12px] font-semibold text-theme-primary">{item.chapterTitle}</span>
                  <span className="text-[10px] text-theme-muted bg-theme-tertiary px-1.5 py-0.5 rounded">
                    位置 {item.position}
                  </span>
                </div>
                <div className="text-[12px] text-theme-secondary leading-relaxed">
                  ...{highlightKeyword(item.context, item.keyword)}...
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default RightPanel;
