import React, { useState, useRef, useEffect } from 'react';
import { useWriterStore } from '@renderer/store/useWriterStore';
import { Button, Input, Modal } from 'antd';
import {
  SendOutlined,
  StopOutlined,
  BorderOuterOutlined,
  BulbOutlined,
  EditOutlined,
  CheckCircleOutlined,
  ReconciliationOutlined,
} from '@ant-design/icons';
import { port } from '@renderer/constants';

const { TextArea } = Input;

interface BookAgentModalProps {
  open: boolean;
  onClose: () => void;
}

interface AgentPanelProps {
  title: string;
  role: string;
  icon: React.ReactNode;
  content: string;
  status: 'idle' | 'running' | 'done';
  className?: string;
}

const AgentPanel: React.FC<AgentPanelProps> = ({ title, role, icon, content, status, className = '' }) => {
  const statusColor = {
    idle: 'bg-theme-secondary/50',
    running: 'bg-accent-light/30',
    done: 'bg-green-50 dark:bg-green-900/20',
  }[status];

  const statusDot = {
    idle: 'bg-theme-muted',
    running: 'bg-accent animate-pulse',
    done: 'bg-green-500',
  }[status];

  return (
    <div className={`flex flex-col rounded-xl border border-theme-light overflow-hidden ${statusColor} ${className}`}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-theme-light bg-theme-primary/50">
        <span className={`w-2 h-2 rounded-full ${statusDot}`} />
        <span className="text-accent">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-theme-primary truncate">{title}</div>
          <div className="text-[10px] text-theme-muted truncate">{role}</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 text-xs text-theme-secondary whitespace-pre-wrap min-h-0">
        {content || <span className="text-theme-muted italic">等待中...</span>}
      </div>
    </div>
  );
};

const BookAgentModal: React.FC<BookAgentModalProps> = ({ open, onClose }) => {
  const book = useWriterStore((s) => s.book);
  const [prompt, setPrompt] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [orchestratorContent, setOrchestratorContent] = useState('');
  const [thinkerContent, setThinkerContent] = useState('');
  const [writerContent, setWriterContent] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [consistencyContent, setConsistencyContent] = useState('');

  const [orchestratorStatus, setOrchestratorStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [thinkerStatus, setThinkerStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [writerStatus, setWriterStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [editorStatus, setEditorStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [consistencyStatus, setConsistencyStatus] = useState<'idle' | 'running' | 'done'>('idle');

  useEffect(() => {
    if (!open) {
      setOrchestratorContent('');
      setThinkerContent('');
      setWriterContent('');
      setEditorContent('');
      setConsistencyContent('');
      setOrchestratorStatus('idle');
      setThinkerStatus('idle');
      setWriterStatus('idle');
      setEditorStatus('idle');
      setConsistencyStatus('idle');
      setPrompt('');
      setIsStreaming(false);
    }
  }, [open]);

  const parseAndDistribute = (fullText: string) => {
    const orchestratorParts: string[] = [];
    const thinkerParts: string[] = [];
    const writerParts: string[] = [];
    const editorParts: string[] = [];
    const consistencyParts: string[] = [];

    const sections = fullText.split(/### \[/);
    for (const section of sections) {
      if (section.startsWith('orchestrator]')) {
        orchestratorParts.push(section.replace('orchestrator]\n\n', ''));
      } else if (section.startsWith('thinker]')) {
        thinkerParts.push(section.replace('thinker]\n\n', ''));
      } else if (section.startsWith('writer]')) {
        writerParts.push(section.replace('writer]\n\n', ''));
      } else if (section.startsWith('editor]')) {
        editorParts.push(section.replace('editor]\n\n', ''));
      } else if (section.startsWith('consistency]')) {
        consistencyParts.push(section.replace('consistency]\n\n', ''));
      } else if (section.startsWith('system]')) {
        orchestratorParts.push(section.replace('system]\n', ''));
      }
    }

    if (orchestratorParts.length) setOrchestratorContent(orchestratorParts.join('\n'));
    if (thinkerParts.length) setThinkerContent(thinkerParts.join('\n'));
    if (writerParts.length) setWriterContent(writerParts.join('\n'));
    if (editorParts.length) setEditorContent(editorParts.join('\n'));
    if (consistencyParts.length) setConsistencyContent(consistencyParts.join('\n'));

    if (orchestratorParts.length) setOrchestratorStatus('running');
    if (thinkerParts.length) setThinkerStatus('running');
    if (writerParts.length) setWriterStatus('running');
    if (editorParts.length) setEditorStatus('running');
    if (consistencyParts.length) setConsistencyStatus('running');
  };

  const handleSend = async () => {
    if (!prompt.trim() || !book.id) return;

    const userMessage = prompt.trim();
    const newRequestId = `book-agent-${Date.now()}`;
    setRequestId(newRequestId);
    setPrompt('');
    setIsStreaming(true);

    setOrchestratorContent('正在启动...');
    setOrchestratorStatus('running');

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(`http://localhost:${port}/api/book-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userMessage,
          bookId: book.id,
          model: 'deepseek-v4-flash',
          apiKey: 'sk-108afdf674fc46838cb861e35350da71',
          requestId: newRequestId,
        }),
        signal: abortController.signal,
      });

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        parseAndDistribute(accumulated);
      }

      setOrchestratorStatus('done');
      setThinkerStatus('done');
      setWriterStatus('done');
      setEditorStatus('done');
      setConsistencyStatus('done');
    } catch (error: any) {
      if (error.name === 'AbortError') {
        setOrchestratorContent((prev) => prev + '\n\n[任务已取消]');
      } else {
        console.error('Book Agent error:', error);
        setOrchestratorContent(`[错误] ${error.message}`);
      }
    } finally {
      setIsStreaming(false);
      setRequestId(null);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (requestId) {
      fetch(`http://localhost:${port}/api/chat-cancel?requestId=${requestId}`);
    }
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={900}
      height={700}
      className="book-agent-modal"
      styles={{ body: { height: 700, display: 'flex', flexDirection: 'column', padding: 0 } }}
      title={
        <div className="flex items-center gap-2">
          <BorderOuterOutlined className="text-accent" />
          <span>AI 写书工作台</span>
        </div>
      }
    >
      <div className="flex flex-col h-full">
        {/* 顶部：Orchestrator 总控 */}
        <div className="h-36 shrink-0 p-2">
          <AgentPanel
            title="Orchestrator"
            role="总控/规划 — 调度其他 Agent，质量把关"
            icon={<BorderOuterOutlined />}
            content={orchestratorContent}
            status={orchestratorStatus}
            className="h-full"
          />
        </div>

        {/* 中间：左 Thinker / 右 Writer */}
        <div className="flex-1 flex gap-2 p-2 pt-0 min-h-0">
          <div className="flex-1 min-w-0">
            <AgentPanel
              title="Thinker"
              role="构思/规划 — 大纲生成，结构设计"
              icon={<BulbOutlined />}
              content={thinkerContent}
              status={thinkerStatus}
              className="h-full"
            />
          </div>
          <div className="flex-1 min-w-0">
            <AgentPanel
              title="Writer"
              role="写作 — 撰写章节正文"
              icon={<EditOutlined />}
              content={writerContent}
              status={writerStatus}
              className="h-full"
            />
          </div>
        </div>

        {/* 底部：左 Editor / 右 Consistency */}
        <div className="h-44 shrink-0 flex gap-2 p-2 pt-0">
          <div className="flex-1 min-w-0">
            <AgentPanel
              title="Editor"
              role="编辑/审校 — 润色优化，节奏把控"
              icon={<ReconciliationOutlined />}
              content={editorContent}
              status={editorStatus}
              className="h-full"
            />
          </div>
          <div className="flex-1 min-w-0">
            <AgentPanel
              title="Consistency"
              role="一致性检查 — 防止设定矛盾"
              icon={<CheckCircleOutlined />}
              content={consistencyContent}
              status={consistencyStatus}
              className="h-full"
            />
          </div>
        </div>

        {/* 输入栏 */}
        <div className="px-4 py-3 border-t border-theme-light shrink-0">
          <div className="flex gap-2">
            <TextArea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述你的写书需求，例如：帮我写一本科幻小说..."
              autoSize={{ minRows: 2, maxRows: 4 }}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={isStreaming}
              className="text-xs"
            />
            {isStreaming ? (
              <Button
                type="primary"
                danger
                icon={<StopOutlined />}
                onClick={handleCancel}
                className="self-end"
              />
            ) : (
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleSend}
                className="self-end"
              />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default BookAgentModal;
