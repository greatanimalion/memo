import React from 'react'
import { useWriterStore } from '@renderer/store/useWriterStore'
import { Button, Input, Tag, Tooltip } from 'antd'
import {
  CloseOutlined,
  RobotOutlined,
  SendOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
} from '@ant-design/icons'

const { TextArea } = Input

const AIAssistantPanel: React.FC = () => {
  const aiPanelOpen = useWriterStore((s) => s.aiPanelOpen)
  const setAiPanelOpen = useWriterStore((s) => s.setAiPanelOpen)
  const book = useWriterStore((s) => s.book)
  const currentChapterId = useWriterStore((s) => s.currentChapterId)

  const [prompt, setPrompt] = React.useState('')
  const [messages, setMessages] = React.useState<{ role: string; content: string }[]>([])

  const currentChapter = book.chapters.find((c) => c.id === currentChapterId)

  const handleSend = () => {
    if (!prompt.trim()) return
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: prompt },
      { role: 'assistant', content: 'AI 助手功能开发中，敬请期待...' },
    ])
    setPrompt('')
  }

  if (!aiPanelOpen) return null

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <RobotOutlined className="text-blue-500" />
          <span className="text-sm font-semibold text-gray-700">AI 助手</span>
        </div>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          onClick={() => setAiPanelOpen(false)}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
          <FileTextOutlined />
          <span>当前章节：{currentChapter?.title || '未选择'}</span>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          <Tooltip title="续写当前段落">
            <Tag
              className="cursor-pointer"
              color="blue"
              onClick={() => setPrompt('请帮我续写当前段落：')}
            >
              <ThunderboltOutlined /> 续写
            </Tag>
          </Tooltip>
          <Tooltip title="优化文字表达">
            <Tag
              className="cursor-pointer"
              color="green"
              onClick={() => setPrompt('请帮我优化以下文字的表述：')}
            >
              <ThunderboltOutlined /> 润色
            </Tag>
          </Tooltip>
          <Tooltip title="概括章节内容">
            <Tag
              className="cursor-pointer"
              color="purple"
              onClick={() => setPrompt('请帮我概括本章内容：')}
            >
              <ThunderboltOutlined /> 摘要
            </Tag>
          </Tooltip>
        </div>

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`text-sm p-3 rounded-xl ${
              msg.role === 'user'
                ? 'bg-blue-50 text-blue-800 ml-4'
                : 'bg-gray-50 text-gray-700 mr-4'
            }`}
          >
            {msg.content}
          </div>
        ))}
      </div>

      <div className="px-4 py-3 border-t border-gray-200">
        <div className="flex gap-2">
          <TextArea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="输入指令或问题..."
            autoSize={{ minRows: 2, maxRows: 4 }}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            className="text-xs"
          />

          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            className="self-end"
          />
        </div>
      </div>
    </div>
  )
}

export default AIAssistantPanel