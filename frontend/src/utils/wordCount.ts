// 文本字数统计的统一实现。
// 原先 useWriterStore 与 RightPanel 各有一份完全相同的
// 「中文字符 + 英文单词」正则统计，这里收敛为单一来源。

const CJK_CHAR = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g;

export type CountWordsMode = "chinese" | "english" | "all";

/** 按模式统计字数：chinese=中文字符+英文单词，english=英文单词，all=字符总数。 */
export function countWords(text: string, mode: CountWordsMode = "chinese"): number {
    if (mode === "chinese") {
        const chineseChars = (text.match(CJK_CHAR) || []).length;
        const englishWords = text.replace(CJK_CHAR, " ").split(/\s+/).filter(Boolean).length;
        return chineseChars + englishWords;
    }
    if (mode === "english") {
        return text.split(/\s+/).filter(Boolean).length;
    }
    return text.length;
}

export interface TextStats {
    /** 字符总数 */
    chars: number;
    /** 中文字符数 */
    chineseChars: number;
    /** 英文单词数 */
    englishWords: number;
    /** 中文 + 英文合计字数 */
    words: number;
    /** 段落数（空行分隔） */
    paragraphs: number;
    /** 句子数（按中英文句末标点） */
    sentences: number;
}

/** 一次性产出侧栏需要的全部统计指标，避免调用方重复写正则。 */
export function getTextStats(text: string): TextStats {
    const chineseChars = (text.match(CJK_CHAR) || []).length;
    const englishWords = text.replace(CJK_CHAR, " ").split(/\s+/).filter(Boolean).length;
    return {
        chars: text.length,
        chineseChars,
        englishWords,
        words: chineseChars + englishWords,
        paragraphs: text.split(/\n\n+/).filter((p) => p.trim()).length,
        sentences: (text.match(/[.!?。！？]+/g) || []).length || (text.trim() ? 1 : 0),
    };
}
