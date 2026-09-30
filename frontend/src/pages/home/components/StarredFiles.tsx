import React from "react";
import { FileTextOutlined, StarOutlined } from "@ant-design/icons";
import { Empty } from "antd";
import { Memory } from "@type";
import { useNavigate } from "react-router-dom";

interface StarredFilesProps {
  files: Memory[];
}

const StarredFiles: React.FC<StarredFilesProps> = ({ files }) => {
  const navigate = useNavigate();

  const openRecentFile = (file: Memory) => {
    navigate("/memo", { state: { file } });
  };

  return (
    <div className="rounded-2xl p-6 shadow-lg" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="flex items-center gap-3 mb-6">
        <StarOutlined className="text-2xl" />
        <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>我的收藏</h2>
        <span className="ml-auto text-sm" style={{ color: "var(--text-tertiary)" }}>
          共 {files.length} 项
        </span>
      </div>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {files.map((item) => (
          <div
            key={item.id}
            onClick={() => openRecentFile(item)}
            className="flex items-center justify-between p-4 rounded-xl transition-colors cursor-pointer group"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-tertiary)")}
          >
            <div className="flex items-center gap-4">
              <FileTextOutlined className="text-xl text-blue-500" />
              <p className="font-medium group-hover:text-blue-600 transition-colors" style={{ color: "var(--text-primary)" }}>
                {item.title}
              </p>
            </div>
            <StarOutlined
              className="text-yellow-500"
              style={{ color: "oklch(79.5% 0.184 86.047)" }}
            />
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

export default StarredFiles;