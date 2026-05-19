import React, { useRef, useEffect, useState, useCallback } from 'react';

interface VirtualTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  fileName?: string;
}
const LINE_HEIGHT = 24;
const VirtualTextEditor: React.FC<VirtualTextEditorProps> = ({ content, onChange, fileName }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [lines, setLines] = useState<string[]>(content.split('\n'));
  const [scrollTop, setScrollTop] = useState(0);
  const [cursorPosition, setCursorPosition] = useState({ line: 0, column: 0 });

  const totalHeight = lines.length * LINE_HEIGHT;
  const viewportHeight = 800;
  const visibleLineCount = Math.ceil(viewportHeight / LINE_HEIGHT);
  const buffer = 5;
  const startLine = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - buffer);
  const endLine = Math.min(lines.length, startLine + visibleLineCount + buffer * 2);
  const visibleLines = lines.slice(startLine, endLine);

  useEffect(() => {
    setLines(content.split('\n'));
    setCursorPosition({ line: 0, column: 0 });
  }, [content]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    setScrollTop(target.scrollTop);
  }, []);

  const handleLineClick = useCallback((lineIndex: number, e: React.MouseEvent) => {
    const lineContent = lines[lineIndex];
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const charWidth = 9;
    const column = Math.min(Math.max(0, Math.floor(x / charWidth)), lineContent.length);
    
    setCursorPosition({ line: lineIndex, column });
  }, [lines]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursorPosition(prev => ({
        line: Math.max(0, prev.line - 1),
        column: Math.min(prev.column, lines[Math.max(0, prev.line - 1)]?.length || 0)
      }));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursorPosition(prev => ({
        line: Math.min(lines.length - 1, prev.line + 1),
        column: Math.min(prev.column, lines[Math.min(lines.length - 1, prev.line + 1)]?.length || 0)
      }));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setCursorPosition(prev => {
        if (prev.column > 0) {
          return { ...prev, column: prev.column - 1 };
        } else if (prev.line > 0) {
          const prevLineLength = lines[prev.line - 1]?.length || 0;
          return { line: prev.line - 1, column: prevLineLength };
        }
        return prev;
      });
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setCursorPosition(prev => {
        const currentLineLength = lines[prev.line]?.length || 0;
        if (prev.column < currentLineLength) {
          return { ...prev, column: prev.column + 1 };
        } else if (prev.line < lines.length - 1) {
          return { line: prev.line + 1, column: 0 };
        }
        return prev;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const newLines = [...lines];
      const currentLine = newLines[cursorPosition.line];
      const beforeCursor = currentLine.substring(0, cursorPosition.column);
      const afterCursor = currentLine.substring(cursorPosition.column);
      newLines[cursorPosition.line] = beforeCursor;
      newLines.splice(cursorPosition.line + 1, 0, afterCursor);
      setLines(newLines);
      onChange(newLines.join('\n'));
      setCursorPosition({ line: cursorPosition.line + 1, column: 0 });
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      if (cursorPosition.column === 0 && cursorPosition.line > 0) {
        const newLines = [...lines];
        const prevLine = newLines[cursorPosition.line - 1];
        const currentLine = newLines[cursorPosition.line];
        newLines[cursorPosition.line - 1] = prevLine + currentLine;
        newLines.splice(cursorPosition.line, 1);
        setLines(newLines);
        onChange(newLines.join('\n'));
        setCursorPosition({ line: cursorPosition.line - 1, column: prevLine.length });
      } else if (cursorPosition.column > 0) {
        const newLines = [...lines];
        const currentLine = newLines[cursorPosition.line];
        newLines[cursorPosition.line] = currentLine.substring(0, cursorPosition.column - 1) + currentLine.substring(cursorPosition.column);
        setLines(newLines);
        onChange(newLines.join('\n'));
        setCursorPosition(prev => ({ ...prev, column: prev.column - 1 }));
      }
    } else if (e.key === 'Delete') {
      e.preventDefault();
      const currentLineLength = lines[cursorPosition.line]?.length || 0;
      if (cursorPosition.column === currentLineLength && cursorPosition.line < lines.length - 1) {
        const newLines = [...lines];
        const currentLine = newLines[cursorPosition.line];
        const nextLine = newLines[cursorPosition.line + 1];
        newLines[cursorPosition.line] = currentLine + nextLine;
        newLines.splice(cursorPosition.line + 1, 1);
        setLines(newLines);
        onChange(newLines.join('\n'));
      } else if (cursorPosition.column < currentLineLength) {
        const newLines = [...lines];
        const currentLine = newLines[cursorPosition.line];
        newLines[cursorPosition.line] = currentLine.substring(0, cursorPosition.column) + currentLine.substring(cursorPosition.column + 1);
        setLines(newLines);
        onChange(newLines.join('\n'));
      }
    }
  }, [lines, cursorPosition, onChange]);

  const handleCharInput = useCallback((char: string) => {
    const newLines = [...lines];
    const currentLine = newLines[cursorPosition.line] || '';
    newLines[cursorPosition.line] = currentLine.substring(0, cursorPosition.column) + char + currentLine.substring(cursorPosition.column);
    setLines(newLines);
    onChange(newLines.join('\n'));
    setCursorPosition(prev => ({ ...prev, column: prev.column + 1 }));
  }, [lines, cursorPosition, onChange]);

  useEffect(() => {
    const handleInput = (e: KeyboardEvent) => {
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        handleCharInput(e.key);
      }
    };

    window.addEventListener('keydown', handleInput);
    return () => window.removeEventListener('keydown', handleInput);
  }, [handleCharInput]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const lineTop = cursorPosition.line * LINE_HEIGHT;
      const containerTop = container.scrollTop;
      const containerHeight = container.clientHeight || viewportHeight;
      const lineBottom = lineTop + LINE_HEIGHT;

      if (lineTop < containerTop) {
        container.scrollTop = lineTop;
      } else if (lineBottom > containerTop + containerHeight) {
        container.scrollTop = lineBottom - containerHeight;
      }
    }
  }, [cursorPosition.line]);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
        <div className="text-sm font-medium text-gray-700">
          {fileName || 'Untitled.txt'}
        </div>
        <div className="text-xs text-gray-500">
          Line {cursorPosition.line + 1}, Column {cursorPosition.column + 1}
        </div>
      </div>
      
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-auto relative"
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        style={{ outline: 'none' }}
      >
        <div 
          className="relative min-h-full"
          style={{ height: totalHeight }}
        >
          <div 
            className="absolute left-0 top-0 w-14 bg-gray-100 border-r border-gray-200 overflow-hidden"
            style={{ height: totalHeight }}
          >
            <div 
              className="relative"
              style={{ transform: `translateY(${startLine * LINE_HEIGHT}px)` }}
            >
              {visibleLines.map((_, index) => {
                const lineNumber = startLine + index + 1;
                return (
                  <div
                    key={`num-${lineNumber}`}
                    className="h-6 flex items-center justify-end pr-2 text-xs text-gray-400 font-mono"
                    style={{ lineHeight: LINE_HEIGHT }}
                  >
                    {lineNumber}
                  </div>
                );
              })}
            </div>
          </div>
          
          <div 
            className="absolute left-14 top-0 right-0 overflow-hidden"
            style={{ height: totalHeight }}
          >
            <div 
              className="relative"
              style={{ transform: `translateY(${startLine * LINE_HEIGHT}px)` }}
            >
              {visibleLines.map((line, index) => {
                const absoluteLineIndex = startLine + index;
                const isCursorLine = absoluteLineIndex === cursorPosition.line;
                
                return (
                  <div
                    key={`line-${absoluteLineIndex}`}
                    className={`h-6 flex items-center px-3 font-mono text-sm ${isCursorLine ? 'bg-blue-50' : 'hover:bg-gray-100'} cursor-text select-none`}
                    style={{ lineHeight: LINE_HEIGHT }}
                    onClick={(e) => handleLineClick(absoluteLineIndex, e)}
                  >
                    <span className="text-gray-800 whitespace-pre-wrap break-all">
                      {line || '\u00A0'}
                    </span>
                    {isCursorLine && (
                      <span 
                        className="absolute w-0.5 h-4 bg-blue-500 animate-pulse"
                        style={{ 
                          left: 56 + cursorPosition.column * 9,
                          top: index * LINE_HEIGHT
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VirtualTextEditor;