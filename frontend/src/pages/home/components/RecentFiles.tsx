
// ===== 新实现：复用 FileListCard，仅声明差异部分 =====
import React from "react";
import { FileTextOutlined } from "@ant-design/icons";
import { Memory } from "@type";
import { useNavigate } from "react-router-dom";
import { formatDateByTimestamp, formatRelativeTime } from "@renderer/utils/dateUtils";
import { FileListCard } from "@renderer/components/file-list-card";

interface RecentFilesProps {
  files: Memory[];
}

const RecentFiles: React.FC<RecentFilesProps> = ({ files }) => {
  const navigate = useNavigate();

  return (
    <FileListCard
      headerIcon={<FileTextOutlined className="text-2xl text-blue-500" />}
      title="近期文件"
      countText={`共 ${files.length} 个文件`}
      items={files}
      onOpen={(file) => navigate("/memo", { state: { file } })}
      rowIcon={<FileTextOutlined className="text-xl text-blue-500" />}
      renderBody={(file) => (
        <div>
          <p className="font-medium group-hover:text-blue-600 transition-colors" style={{ color: "var(--text-primary)" }}>
            {file.title}
          </p>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            创建：{formatDateByTimestamp(file.created || 0)}
          </p>
        </div>
      )}
      renderTrailing={(file) => (
        <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          更新于：{formatRelativeTime(file.updated || 0)}
        </span>
      )}
    />
  );
};

export default RecentFiles;