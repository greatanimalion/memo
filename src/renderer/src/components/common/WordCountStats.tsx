interface WordCountStatsProps {
  content: string;
}

const WordCountStats: React.FC<WordCountStatsProps> = ({ content }) => {
  const charCount = content.length;
  const chineseChars = (
    content.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []
  ).length;
  const englishWords = content
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  const paragraphCount = content.split(/\n\n+/).filter((p) => p.trim()).length;
  const sentenceCount =
    (content.match(/[.!?。！？]+/g) || []).length || (content.trim() ? 1 : 0);

  const stats = [
    { label: "总字符", value: charCount },
    { label: "中文字数", value: chineseChars },
    { label: "英文词数", value: englishWords },
    { label: "段落数", value: paragraphCount },
    { label: "句子数", value: sentenceCount },
    { label: "行数", value: content.split("\n").length },
  ];

  return (
    <div className="p-4 border-b border-gray-200">
      <div className="text-sm font-semibold text-gray-700 mb-3">字数统计</div>
      <div className="grid grid-cols-2 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-lg p-2">
            <div className="text-xs text-gray-400">{stat.label}</div>
            <div className="text-sm font-semibold text-gray-700">
              {stat.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WordCountStats;
