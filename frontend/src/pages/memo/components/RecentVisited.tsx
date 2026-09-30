import React, { useCallback, useEffect, useState } from "react";
import { ClockCircleOutlined, FileOutlined } from "@ant-design/icons";
import { Empty, Spin } from "antd";
import { Memory } from "@type/memory";
import { getRecentMemorys } from "@renderer/services/memeoy";
import useFileStore from "@renderer/store/useFileStore";
import { formatRelativeTime } from "@renderer/utils/dateUtils";
import { regularNumberSize } from "@renderer/utils/number";

const RecentVisited: React.FC = () => {
  const [files, setFiles] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const selectedFile = useFileStore((state) => state.selectedFile);
  const setSelectedFile = useFileStore((state) => state.setSelectedFile);

  const loadRecent = useCallback(async () => {
    setLoading(true);
    const list = await getRecentMemorys();
    setFiles(Array.isArray(list) ? list : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  // 从编辑器返回列表时刷新（后端在打开文件时会更新 visitedTime）
  useEffect(() => {
    if (!selectedFile) {
      loadRecent();
    }
  }, [selectedFile, loadRecent]);

  return (
    <aside
      className="w-60 shrink-0 flex flex-col border-l overflow-hidden"
      style={{
        backgroundColor: "var(--bg-primary)",
        borderColor: "var(--border-color)",
      }}
    >
      <div
        className="px-4 py-3 flex items-center gap-2 border-b shrink-0"
        style={{ borderColor: "var(--border-color)" }}
      >
        <ClockCircleOutlined style={{ color: "var(--text-secondary)" }} />
        <span
          className="font-semibold text-sm"
          style={{ color: "var(--text-primary)" }}
        >
          最近访问
        </span>
        <span
          className="ml-auto text-xs"
          style={{ color: "var(--text-tertiary)" }}
        >
          {files.length} 个
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        {loading ? (
          <div className="flex justify-center py-8">
            <Spin />
          </div>
        ) : files.length === 0 ? (
          <div className="py-8">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无最近访问"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {files.map((file) => (
              <div
                key={file.id}
                onClick={() => setSelectedFile(file)}
                className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors hover:bg-(--bg-hover)"
              >
                <FileOutlined
                  className="text-lg shrink-0"
                  style={{ color: "oklch(62.3% 0.214 259.815)" }}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="text-sm truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {file.title}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    访问于 {formatRelativeTime(+file.visitedTime!)}
                  </div>
                </div>
                <span
                  className="text-xs shrink-0"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {regularNumberSize(file.size || 0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};

export default RecentVisited;
