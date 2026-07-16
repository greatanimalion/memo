import React from 'react'
import { useWriterStore } from '@renderer/store/useWriterStore'
import { FontFamily } from '@type/common'
import { Select, Slider } from 'antd'
import {
  FontSizeOutlined,
  ColumnHeightOutlined,
  FontColorsOutlined,
  BoldOutlined,
} from '@ant-design/icons'

const fontOptions: { value: FontFamily; label: string }[] = [
  { value: 'sans', label: '无衬线' },
  { value: 'serif', label: '衬线体' },
  { value: 'mono', label: '等宽体' },
  { value: 'kaiti', label: '楷体' },
  { value: 'songti', label: '宋体' },
]

const fontFamilyMap: Record<FontFamily, string> = {
  sans: 'sans-serif',
  serif: 'serif',
  mono: '"Courier New", monospace',
  kaiti: '"KaiTi", "STKaiti", serif',
  songti: '"SimSun", "STSong", serif',
}

const ChapterToolbar: React.FC = () => {
  const editorSettings = useWriterStore((s) => s.editorSettings)
  const setEditorFont = useWriterStore((s) => s.setEditorFont)
  const setEditorFontSize = useWriterStore((s) => s.setEditorFontSize)
  const setEditorLineHeight = useWriterStore((s) => s.setEditorLineHeight)
  const setEditorFontWeight = useWriterStore((s) => s.setEditorFontWeight)

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-white border-b border-gray-200">
      <div className="flex items-center gap-2">
        <FontColorsOutlined className="text-gray-400" />
        <Select
          size="small"
          value={editorSettings.fontFamily}
          onChange={setEditorFont}
          options={fontOptions}
          style={{ width: 90 }}
        />
      </div>

      <div className="flex items-center gap-2">
        <FontSizeOutlined className="text-gray-400" />
        <Slider
          className="w-20"
          min={12}
          max={30}
          value={editorSettings.fontSize}
          onChange={setEditorFontSize}
          tooltip={{ formatter: (v) => `${v}px` }}
        />
        <span className="text-xs text-gray-500 w-8">{editorSettings.fontSize}px</span>
      </div>

      <div className="flex items-center gap-2">
        <ColumnHeightOutlined className="text-gray-400" />
        <Slider
          className="w-20"
          min={1.2}
          max={2.5}
          step={0.1}
          value={editorSettings.lineHeight}
          onChange={setEditorLineHeight}
          tooltip={{ formatter: (v) => `${v}` }}
        />
        <span className="text-xs text-gray-500 w-6">{editorSettings.lineHeight}</span>
      </div>

      <div className="flex items-center gap-2">
        <BoldOutlined className="text-gray-400" />
        <Slider
          className="w-20"
          min={100}
          max={900}
          step={100}
          value={editorSettings.fontWeight}
          onChange={setEditorFontWeight}
          tooltip={{ formatter: (v) => `${v}` }}
        />
        <span className="text-xs text-gray-500 w-8">{editorSettings.fontWeight}</span>
      </div>
    </div>
  )
}

export { fontFamilyMap }
export default ChapterToolbar