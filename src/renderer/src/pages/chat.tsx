import React, { useState, useCallback, useEffect } from 'react';
import { PlusOutlined, DeleteOutlined, CopyOutlined, AliwangwangOutlined } from '@ant-design/icons';
import { Button, Dropdown, Empty, message, Modal } from 'antd';
import { AIKey } from '../types/common';
import type { Message } from '../../../types/agents';
import { formatTime } from '../utils/dateUtils';
import ChatPanel from '../components/ChatPanel';
import { XMarkdown } from '@ant-design/x-markdown';
import AISender from '../components/common/AISender';
import { Think } from '@ant-design/x';
import { getLocalStore, setLocalStore } from '../utils/localStore';
import { useChat } from '../hooks/useChat';
import { updateSession } from '../services/session';

const ChatPage: React.FC = () => {
  const {
    sessions,
    currentSessionId,
    currentSession,
    agents,
    setAgents,
    prompt,
    setPrompt,
    messagesEndRef,
    handleNewSession,
    pushSessionToCurrentSession,
    handleSelectSession,
    handleDeleteSession,
  } = useChat();

  const [messageApi, contextHolder] = message.useMessage();
  const [isTyping, setIsTyping] = useState(false);
  const [typingDate, setTypingDate] = useState('');
  const [typingTarget, setTypingTarget] = useState('');
  const [typeId, setTypeId] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [openAgent, setOpenAgent] = useState(false);
  const [stopReply, setStopReply] = useState(false);
  const [pendingResponse, setPendingResponse] = useState<{
    content: string;
    timestamp: number;
  } | null>(null);
  const [showResumeModal, setShowResumeModal] = useState(false);

  useEffect(() => {
    if (currentSession && currentSessionId) {
      const pendingKey = `pending_response_${currentSessionId}`;
      const saved = getLocalStore<string>(pendingKey)?.value;
      if (saved) {
        try {
          const data = JSON.parse(saved);
          if (data.content && data.content.length > 0) {
            setPendingResponse(data);
            setShowResumeModal(true);
          }
        } catch (e) {
          console.error('解析未完成响应失败:', e);
        }
      }
    }
  }, [currentSession, currentSessionId]);

  const clearPendingResponse = useCallback(() => {
    if (currentSessionId) {
      const pendingKey = `pending_response_${currentSessionId}`;
      setLocalStore(pendingKey, { value: '' });
      setPendingResponse(null);
      setShowResumeModal(false);
    }
  }, [currentSessionId]);

  const handleResumeResponse = useCallback(() => {
    if (pendingResponse && currentSession) {
      setTypingTarget(pendingResponse.content);
      setTypingDate(pendingResponse.timestamp.toString());
      setIsTyping(true);
      setTypeId(currentSessionId!);
      setShowResumeModal(false);
      const userMessage = currentSession.messages[currentSession.messages.length - 1];
      if (userMessage && userMessage.role === 'user') {
        handleSend(userMessage.content);
      }
    }
  }, [pendingResponse, currentSession, currentSessionId]);

  const handleSend = useCallback(async (inputValue: string) => {
    const userContent = inputValue.trim();
    const model = getLocalStore('selectedAI')?.value || '';
    const api_key = (getLocalStore('model')?.value as AIKey[] || []).find(c => c.model === model)?.key || '';

    if (!userContent || !currentSession) {
      messageApi.warning('消息不能为空');
      return;
    }
    if (!model || !api_key) {
      messageApi.error('请选择模型');
      return;
    }
    
    setIsThinking(true);
    const messId = Date.now();
    const userMessage: Message = {
      role: 'user',
      content: userContent,
      timestamp: messId,
    };

    const updatedSessions = sessions.map(conv => {
      if (conv.id === currentSessionId) {
        const newMessages = [...conv.messages, userMessage];
        let newTitle = conv.title;
        if (conv.messages.length <= 1) {
          newTitle = inputValue.slice(0, 16) + (inputValue.length > 16 ? '...' : '');
        }
        return { ...conv, title: newTitle, messages: newMessages };
      }
      return conv;
    });
    const _currentSession = updatedSessions.find(c => c.id === currentSessionId)!;
    pushSessionToCurrentSession(_currentSession);
    setTypeId(currentSessionId);
    setIsTyping(true);

    try {
      let _prompt = userContent;
      if (prompt) {
        _prompt = `请基于以下文档内容回答问题：\n ${prompt}\n问题：${userContent}`;
      }
      const url = openAgent ? 'http://localhost:32068/api/chat-agent' : 'http://localhost:32068/api/chat-stream';
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: _prompt,
          model,
          apiKey: api_key,
          history: _currentSession.messages,
          requestId: currentSessionId
        }),
      });
      if (!response.body) {
        throw new Error('响应体为空');
      }
      const aiMessage: Message = {
        timestamp: Date.now(),
        role: 'system',
        content: '',
      };
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulatedContent = '';
      setTypingDate(Date.now().toString());
      
      const saveInterval = setInterval(() => {
        if (accumulatedContent.length > 0 && currentSessionId) {
          const pendingKey = `pending_response_${currentSessionId}`;
          setLocalStore(pendingKey, {
            value: JSON.stringify({
              content: accumulatedContent,
              timestamp: Date.now(),
            })
          });
        }
      }, 1000);

      try {
        while (true) {
          if (stopReply) {
            setStopReply(false);
            break;
          }
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          accumulatedContent += chunk;
          setTypingTarget(accumulatedContent);
        }
        aiMessage.content = accumulatedContent;
      } finally {
        clearInterval(saveInterval);
        reader.releaseLock();
        if (currentSessionId) {
          const pendingKey = `pending_response_${currentSessionId}`;
          setLocalStore(pendingKey, { value: '' });
        }
      }
      _currentSession.messages.push(aiMessage);
    } catch (error) {
      console.error('发送消息时出错:', error);
      if (!stopReply) {
        const errorMessage = '抱歉，我在处理您的请求时遇到了问题，请稍后重试。';
        _currentSession.messages.push({
          role: 'system',
          content: errorMessage,
          timestamp: Date.now(),
        });
        setTypingTarget(errorMessage);
      }
    } finally {
      setTypeId('');
      pushSessionToCurrentSession(_currentSession);
      setIsTyping(false);
      setTypingTarget('');
      updateSession(_currentSession);
    }
    setIsThinking(false);
  }, [currentSession, currentSessionId, sessions, prompt, openAgent, messageApi, pushSessionToCurrentSession, stopReply]);

  const handleCopyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
    message.success('已复制到剪贴板');
  }, []);

  const deleteMessage = useCallback((message: Message) => {
    if (!currentSession) return;
    if (currentSession.messages.length === 1) {
      messageApi.warning('无法删除第一条消息');
      return;
    }

    let pre = 0;
    if (message.role === 'system') {
      for (let i = 0; i < currentSession.messages.length; i++) {
        if (currentSession.messages[i].timestamp === message.timestamp) {
          if (i === 0) {
            messageApi.warning('无法删除第一条消息');
            return;
          }
          pre = currentSession.messages[i - 1].timestamp;
          break;
        }
      }
    } else {
      for (let i = 0; i < currentSession.messages.length; i++) {
        if (i === currentSession.messages.length - 1) {
          messageApi.warning('请先停止回复再删除消息');
          return;
        }
        if (currentSession.messages[i].timestamp === message.timestamp) {
          pre = currentSession.messages[i + 1].timestamp;
          break;
        }
      }
    }

    const newMessages = currentSession.messages.filter(
      m => m.timestamp !== message.timestamp && m.timestamp !== pre
    );
    pushSessionToCurrentSession({ ...currentSession, messages: newMessages });
    updateSession({ ...currentSession, messages: newMessages });
  }, [currentSession, messageApi, pushSessionToCurrentSession]);

  const getMessageActions = useCallback((msg: Message) => [
    {
      key: 'copy',
      label: '复制',
      icon: <CopyOutlined />,
      onClick: () => handleCopyMessage(msg.content),
    },
    {
      key: 'delete',
      label: '删除',
      icon: <DeleteOutlined />,
      onClick: () => deleteMessage(msg),
    },
  ], [handleCopyMessage, deleteMessage]);

  const handleDeleteSessionWithEvent = useCallback(async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sessions.length === 1) {
      message.warning('至少保留一个对话');
      return;
    }
    const pendingKey = `pending_response_${sessionId}`;
    setLocalStore(pendingKey, { value: '' });
    await handleDeleteSession(sessionId);
    messageApi.success('删除成功');
  }, [sessions.length, handleDeleteSession, messageApi]);

  return (
    <div className="flex flex-1 h-full bg-white w-full">
      {contextHolder}
      <Modal
        title="恢复未完成的回复"
        open={showResumeModal}
        footer={[
          <Button key="discard" onClick={clearPendingResponse}>
            放弃
          </Button>,
          <Button key="resume" type="primary" onClick={handleResumeResponse}>
            <AliwangwangOutlined /> 继续回复
          </Button>,
        ]}
      >
        <p>检测到您上次有未完成的AI回复，是否继续？</p>
        <div className="mt-3 p-3 bg-gray-50 rounded-lg max-h-40 overflow-auto">
          <p className="text-sm text-gray-600">上次已收到的内容：</p>
          <XMarkdown content={pendingResponse?.content || ''} />
        </div>
      </Modal>

      <div className="w-60 border-r border-gray-200 overflow-auto flex flex-col max-md:w-0 transition-width duration-300">
        <div className="p-4 border-b border-gray-200">
          <Button
            icon={<PlusOutlined />}
            onClick={handleNewSession}
            className="w-full"
          >
            新建对话
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {sessions.length > 0 ? (
            sessions.map((conv) => (
              <div
                key={conv.id}
                onClick={() => handleSelectSession(conv.id)}
                className={`p-3 rounded-lg cursor-pointer transition-all duration-200 ${currentSessionId === conv.id ? 'shadow-lg' : 'hover:bg-gray-100 border-transparent'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm text-gray-800 truncate">{conv.title}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {conv.messages.length > 1
                        ? conv.messages[conv.messages.length - 1].content.slice(0, 30)
                        : '新对话'}
                    </p>
                  </div>
                  {sessions.length > 1 && (
                    <button
                      onClick={(e) => handleDeleteSessionWithEvent(conv.id, e)}
                      className="p-1 hover:bg-gray-200 rounded transition-colors ml-2 cursor-pointer"
                    >
                      <DeleteOutlined className="text-gray-400 text-sm" />
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="p-5">
              <Empty />
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {currentSession?.messages.map((msg) => (
              <div
                key={msg.timestamp}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex items-start gap-3 max-w-[85%] overflow-auto ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className="flex-1">
                    <Dropdown
                      menu={{ items: getMessageActions(msg as Message) }}
                      trigger={['contextMenu']}
                    >
                      <div
                        className={`rounded-2xl px-4 py-3 text-gray-800 ${msg.role === 'user' ? 'bg-[#ebf5ff] rounded-tr-sm' : 'bg-gray-100 rounded-tl-sm'
                          }`}
                      >
                        <XMarkdown content={msg.content} />
                        <p className="text-xs mt-2 text-gray-400">
                          {formatTime(msg.timestamp)}
                        </p>
                      </div>
                    </Dropdown>
                  </div>
                </div>
              </div>
            ))}

            {isThinking && currentSessionId === typeId && (
              <div className="flex justify-start">
                <div className="flex items-start gap-3 max-w-[85%]">
                  <div className="flex-1">
                    <Think title="Complete thinking" blink loading={true} />
                    {isTyping && (
                      <div className="rounded-2xl px-4 py-3 bg-gray-100 text-gray-800 rounded-tl-sm">
                        <XMarkdown content={typingTarget} />
                        <p className="text-xs mt-2 text-gray-400">
                          {formatTime(+typingDate)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        <AISender
          openAgent={openAgent}
          setOpenAgent={setOpenAgent}
          setPrompt={setPrompt}
          handleSend={handleSend}
          isThinking={isThinking}
          requestId={currentSessionId}
          agents={agents}
        />
      </div>

      <ChatPanel
        handleCopyMessage={handleCopyMessage}
        agents={agents}
        setAgents={setAgents}
        sessions={sessions}
        currentSession={currentSession}
      />
    </div>
  );
};

export default ChatPage;
