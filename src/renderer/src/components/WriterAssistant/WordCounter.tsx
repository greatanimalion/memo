import React from 'react'
import { useWriterStore } from '../../store/useWriterStore'

function countChineseChars(text: string): number {
  return (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length
}

function countEnglishWords(text: string): number {
  return text
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length
}

function countPunctuation(text: string): number {
  return (text.match(/[，。！？、；：“”‘’《》【】（）…—·\.\?,!;:"'<>\[\](){}]/g) || []).length
}

function countParagraphs(text: string): number {
  return text.split(/\n\s*\n/).filter(Boolean).length
}

function countSentences(text: string): number {
  return (text.match(/[。！？\n]+/g) || []).length
}

function estimateReadingTime(text: string): number {
  const totalChars = countChineseChars(text) + countEnglishWords(text)
  return Math.ceil(totalChars / 300)
}

const WordCounter: React.FC = () => {
  const book = useWriterStore((s) => s.book)
  const currentChapterId = useWriterStore((s) => s.currentChapterId)

  const currentChapter = book.chapters.find((c) => c.id === currentChapterId)
  const content = currentChapter?.content || ''

  const stats = React.useMemo(() => {
    return {
      chineseChars: countChineseChars(content),
      englishWords: countEnglishWords(content),
      punctuation: countPunctuation(content),
      paragraphs: countParagraphs(content),
      sentences: countSentences(content),
      readingTime: estimateReadingTime(content),
      totalChars: content.length,
    }
  }, [content])

  const items = [
    { label: '总字符', value: stats.totalChars },
    { label: '中文字数', value: stats.chineseChars },
    { label: '英文词数', value: stats.englishWords },
    { label: '标点符号', value: stats.punctuation },
    { label: '段落数', value: stats.paragraphs },
    { label: '句子数', value: stats.sentences },
    { label: '预计阅读', value: `${stats.readingTime} 分钟` },
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-sm font-semibold text-gray-700 mb-3">字数统计</div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between px-2 py-1.5 bg-gray-50 rounded-lg">
            <span className="text-xs text-gray-500">{item.label}</span>
            <span className="text-sm font-medium text-gray-800">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default WordCounter