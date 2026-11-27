// 首页文件列表卡片。
// RecentFiles 与 StarredFiles 原先只有标题、副信息与右侧尾注不同，
// 其余（卡片外壳、标题栏、行 hover、空态）完全一致，这里合并为通用组件。

import type { ReactNode } from "react";
import { Empty } from "antd";

export interface FileListCardProps<T extends { id: string }> {
    /** 标题栏图标（自带尺寸/颜色 class） */
    headerIcon: ReactNode;
    title: string;
    /** 标题栏右侧计数文案 */
    countText: string;
    items: T[];
    onOpen: (item: T) => void;
    /** 每行左侧图标（自带尺寸/颜色 class） */
    rowIcon: ReactNode;
    /** 每行主体内容（标题及其副信息） */
    renderBody: (item: T) => ReactNode;
    /** 每行右侧尾注（时间、收藏图标等） */
    renderTrailing?: (item: T) => ReactNode;
}

export function FileListCard<T extends { id: string }>({
    headerIcon,
    title,
    countText,
    items,
    onOpen,
    rowIcon,
    renderBody,
    renderTrailing,
}: FileListCardProps<T>) {
    return (
        <div className="rounded-2xl p-4 shadow-lg" style={{ backgroundColor: "var(--bg-primary)" }}>
            <div className="flex items-center gap-3 mb-2.5">
                {headerIcon}
                <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                    {title}
                </h2>
                <span className="ml-auto text-sm" style={{ color: "var(--text-tertiary)" }}>
                    {countText}
                </span>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
                {items.map((item) => (
                    <div
                        key={item.id}
                        className="flex items-center justify-between p-4 rounded-xl transition-colors cursor-pointer group"
                        style={{ backgroundColor: "var(--bg-tertiary)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-tertiary)")}
                        onClick={() => onOpen(item)}
                    >
                        <div className="flex items-center gap-4">
                            {rowIcon}
                            {renderBody(item)}
                        </div>
                        {renderTrailing?.(item)}
                    </div>
                ))}
                {items.length === 0 && (
                    <div className="text-center py-10">
                        <div className="p-5">
                            <Empty />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default FileListCard;
