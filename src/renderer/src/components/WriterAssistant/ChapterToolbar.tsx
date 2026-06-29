import React from "react";
import { useWriterStore } from "../../store/useWriterStore";
import FontSettings from "../common/FontSettings";

const ChapterToolbar: React.FC = () => {
  const editorSettings = useWriterStore((s) => s.editorSettings);
  const setEditorFont = useWriterStore((s) => s.setEditorFont);
  const setEditorFontSize = useWriterStore((s) => s.setEditorFontSize);
  const setEditorLineHeight = useWriterStore((s) => s.setEditorLineHeight);
  const setEditorFontWeight = useWriterStore((s) => s.setEditorFontWeight);

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-white border-b border-gray-200">
      <FontSettings
        fontFamily={editorSettings.fontFamily}
        fontSize={editorSettings.fontSize}
        lineHeight={editorSettings.lineHeight}
        fontWeight={editorSettings.fontWeight}
        onChangeFont={setEditorFont}
        onChangeFontSize={setEditorFontSize}
        onChangeLineHeight={setEditorLineHeight}
        onChangeFontWeight={setEditorFontWeight}
        compact
      />
    </div>
  );
};

export { fontFamilyMap } from "../common/FontSettings";
export default ChapterToolbar;
