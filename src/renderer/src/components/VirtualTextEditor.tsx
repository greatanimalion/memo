import React, { useRef, useEffect, useState } from 'react';
import { useWriterStore } from '../store/useWriterStore';
import { fontFamilyMap } from './WriterAssistant/ChapterToolbar';

interface TextEditorProps {
  content: string;
  onChange: (content: string) => void;
  fileName?: string;
}

const TextEditor: React.FC<TextEditorProps> = ({ content, onChange, fileName }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [lineCount, setLineCount] = useState(1);
  const [column, setColumn] = useState(1);
  const editorSettings = useWriterStore((s) => s.editorSettings);

  useEffect(() => {
    if (textareaRef.current && textareaRef.current.value !== content) {
      textareaRef.current.value = content;
      updateLineInfo();
    }
  }, [content]);

  const updateLineInfo = () => {
    if (!textareaRef.current) return;   
    const text = textareaRef.current.value;
    const cursorPos = textareaRef.current.selectionStart;
    const textBeforeCursor = text.substring(0, cursorPos);
    const lines = textBeforeCursor.split('\n');
    
    setLineCount(lines.length);
    setColumn(lines[lines.length - 1].length + 1);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    updateLineInfo();
  };

  const handleSelect = () => {
    updateLineInfo();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const tabSpaces = '  ';
      const newText = text.substring(0, start) + tabSpaces + text.substring(end);
      onChange(newText);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + tabSpaces.length;
        updateLineInfo();
      }, 0);
    } else {
      setTimeout(updateLineInfo, 0);
    }
  };

  const lineNumbers = Array.from({ length: Math.max(lineCount, 20) }, (_, i) => i + 1);

  const textareaStyle: React.CSSProperties = {
    fontFamily: fontFamilyMap[editorSettings.fontFamily],
    fontSize: `${editorSettings.fontSize}px`,
    lineHeight: editorSettings.lineHeight,
    fontWeight: editorSettings.fontWeight,
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 rounded-lg shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <div className="text-sm font-medium">{fileName || 'Untitled.txt'}</div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2 bg-white/20 px-3 py-1 rounded-full">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Line {lineCount}, Col {column}</span>
          </div>
          <div className="bg-green-500/30 px-2 py-1 rounded-full">
            <span className="w-2 h-2 bg-green-400 rounded-full inline-block mr-1"></span>
            Ready
          </div>
        </div>
      </div>
      
      <div className="flex-1 flex overflow-hidden">
        <div 
          className="w-14 bg-gray-100 border-r border-gray-200 flex-shrink-0 overflow-hidden select-none"
          style={{ fontSize: `${editorSettings.fontSize}px`, lineHeight: editorSettings.lineHeight }}
        >
          <div className="py-3 px-2">
            {lineNumbers.map((num) => (
              <div
                key={num}
                className="text-xs text-gray-400 font-mono text-right h-full flex items-center justify-end"
              >
                {num}
              </div>
            ))}
          </div>
        </div>
        
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onSelect={handleSelect}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-white border-none outline-none p-3 text-gray-800 resize-none placeholder-gray-300"
          style={textareaStyle}
          placeholder="Start writing..."
          spellCheck={false}
        />
      </div>
      
      <div className="px-4 py-2 bg-gray-100 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-4">
          <span>UTF-8</span>
          <span>LF</span>
        </div>
        <div>
          {content.length} characters | {content.split('\n').length} lines
        </div>
      </div>
    </div>
  );
};

export default TextEditor;