import React from "react";
import { Select } from "antd";
import { AIKey } from "@renderer/types/common";

interface DocumentModelManagerProps {
  aiKeys: AIKey[];
  documentModel: string;
  onModelChange: (model: string) => void;
}

const DocumentModelManager: React.FC<DocumentModelManagerProps> = ({
  aiKeys,
  documentModel,
  onModelChange,
}) => {
  return (
    <div className="pt-6" style={{ borderTop: "1px solid var(--border-color)" }}>
      <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
        文档嵌入模型管理
      </h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            模型名称
          </label>
          <Select
            value={documentModel}
            style={{ width: "100%" }}
            onChange={onModelChange}
            size="large"
            options={aiKeys.map((key) => ({
              value: key.model,
              label: key.model,
            }))}
          />
        </div>
      </div>
    </div>
  );
};

export default DocumentModelManager;