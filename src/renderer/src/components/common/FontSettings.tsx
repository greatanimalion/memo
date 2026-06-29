import { FontFamily } from "../../types/common";
import { Select, Slider } from "antd";
import {
  FontSizeOutlined,
  ColumnHeightOutlined,
  FontColorsOutlined,
  BoldOutlined,
} from "@ant-design/icons";

export const fontFamilyMap: Record<FontFamily, string> = {
  sans: "sans-serif",
  serif: "serif",
  mono: '"Courier New", monospace',
  kaiti: '"KaiTi", "STKaiti", serif',
  songti: '"SimSun", "STSong", serif',
};

const fontOptions: { value: FontFamily; label: string }[] = [
  { value: "sans", label: "无衬线" },
  { value: "serif", label: "衬线体" },
  { value: "mono", label: "等宽体" },
  { value: "kaiti", label: "楷体" },
  { value: "songti", label: "宋体" },
];

interface FontSettingsProps {
  fontFamily: FontFamily;
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
  onChangeFont: (font: FontFamily) => void;
  onChangeFontSize: (size: number) => void;
  onChangeLineHeight: (height: number) => void;
  onChangeFontWeight: (weight: number) => void;
  compact?: boolean;
}

const FontSettings: React.FC<FontSettingsProps> = ({
  fontFamily,
  fontSize,
  lineHeight,
  fontWeight,
  onChangeFont,
  onChangeFontSize,
  onChangeLineHeight,
  onChangeFontWeight,
  compact = false,
}) => {
  const sliderClass = compact ? "w-20" : "flex-1";

  return (
    <div
      className={`${compact ? "flex items-center gap-4 px-4 py-2 bg-white border-b border-gray-200" : ""}`}
    >
      {!compact && (
        <div className="text-sm font-semibold text-gray-700 mb-3">字体设置</div>
      )}

      <div className={`flex items-center gap-2 mb-3`}>
        <FontColorsOutlined className="w-4 h-4 text-gray-400" />
        <Select
          size="small"
          value={fontFamily}
          onChange={onChangeFont}
          options={fontOptions}
          className="flex-1"
          style={compact ? { width: 90 } : undefined}
        />
      </div>

      <div className="flex items-center gap-2 mb-3">
        <FontSizeOutlined className="w-4 h-4 text-gray-400" />
        <Slider
          className={sliderClass}
          min={12}
          max={30}
          value={fontSize}
          onChange={onChangeFontSize}
          tooltip={{ formatter: (v) => `${v}px` }}
        />
        <span className="text-xs text-gray-500 w-8 text-right">
          {fontSize}px
        </span>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <ColumnHeightOutlined className="w-4 h-4 text-gray-400" />
        <Slider
          className={sliderClass}
          min={1.2}
          max={2.5}
          step={0.1}
          value={lineHeight}
          onChange={onChangeLineHeight}
          tooltip={{ formatter: (v) => `${v}` }}
        />
        <span className="text-xs text-gray-500 w-6 text-right">
          {lineHeight}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <BoldOutlined className="w-4 h-4 text-gray-400" />
        <Slider
          className={sliderClass}
          min={100}
          max={900}
          step={100}
          value={fontWeight}
          onChange={onChangeFontWeight}
          tooltip={{ formatter: (v) => `${v}` }}
        />
        <span className="text-xs text-gray-500 w-8 text-right">
          {fontWeight}
        </span>
      </div>
    </div>
  );
};

export default FontSettings;
