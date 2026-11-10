import React from "react";
import { FileTextOutlined } from "@ant-design/icons";
import { Empty } from "antd";
import { Memory } from "@type";
import { useNavigate } from "react-router-dom";
import { formatDateByTimestamp, formatRelativeTime } from "@renderer/utils/dateUtils";

interface RecentFilesProps {
  files: Memory[];
}

const RecentFiles: React.FC<RecentFilesProps> = ({ files }) => {
  const navigate = useNavigate();

  const openRecentFile = (file: Memory) => {
    navigate("/memo", { state: { file } });
  };

  return (
    <div className="rounded-2xl p-4 shadow-lg" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="flex items-center gap-3 mb-2.5">
        <FileTextOutlined className="text-2xl text-blue-500" />
        <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>近期文件</h2>
        <span className="ml-auto text-sm" style={{ color: "var(--text-tertiary)" }}>
          共 {files.length} 个文件
        </span>
      </div>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {files.map((file) => (
          <div
            key={file.id}
            className="flex items-center justify-between p-4 rounded-xl transition-colors cursor-pointer group"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-tertiary)")}
            onClick={() => openRecentFile(file)}
          >
            <div className="flex items-center gap-4">
              <FileTextOutlined className="text-xl text-blue-500" />
              <div>
                <p className="font-medium group-hover:text-blue-600 transition-colors" style={{ color: "var(--text-primary)" }}>
                  {file.title}
                </p>
                <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                  创建：{formatDateByTimestamp(file.created || 0)}
                </p>
              </div>
            </div>
            <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              更新于：{formatRelativeTime(file.updated || 0)}
            </span>
          </div>
        ))}
        {files.length === 0 && (
          <div className="text-center py-10">
            <div className="p-5">
              <Empty />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecentFiles;