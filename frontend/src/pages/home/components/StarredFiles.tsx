// ===== 新实现：复用 FileListCard，仅声明差异部分 =====
import React from "react";
import { FileTextOutlined, StarOutlined } from "@ant-design/icons";
import { Memory } from "@type";
import { useNavigate } from "react-router-dom";
import { FileListCard } from "@renderer/components/file-list-card";

interface StarredFilesProps {
  files: Memory[];
}

const StarredFiles: React.FC<StarredFilesProps> = ({ files }) => {
  const navigate = useNavigate();

  return (
    <FileListCard
      headerIcon={<StarOutlined className="text-2xl" />}
      title="我的收藏"
      countText={`共 ${files.length} 项`}
      items={files}
      onOpen={(item) => navigate("/memo", { state: { file: item } })}
      rowIcon={<FileTextOutlined className="text-xl text-blue-500" />}
      renderBody={(item) => (
        <p className="font-medium group-hover:text-blue-600 transition-colors" style={{ color: "var(--text-primary)" }}>
          {item.title}
        </p>
      )}
      renderTrailing={() => (
        <StarOutlined className="text-yellow-500" style={{ color: "oklch(79.5% 0.184 86.047)" }} />
      )}
    />
  );
};

export default StarredFiles;