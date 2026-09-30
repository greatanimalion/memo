import React from "react";
import {
  EyeOutlined,
  EyeInvisibleOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { Button, Popconfirm } from "antd";
import { AIKey } from "@renderer/types/common";
import { maskApiKey } from "@renderer/utils/stringUtils";

interface ApiKeyListProps {
  aiKeys: AIKey[];
  onToggleVisibility: (id: number) => void;
  onDeleteKey: (id: number) => void;
}

const ApiKeyList: React.FC<ApiKeyListProps> = ({
  aiKeys,
  onToggleVisibility,
  onDeleteKey,
}) => {
  return (
    <div className="space-y-3 mb-6">
      {aiKeys.map((key) => (
        <div
          key={key.id}
          className="flex items-center justify-between p-4 rounded-xl"
          style={{ backgroundColor: "var(--bg-tertiary)" }}
        >
          <div className="flex items-center gap-4 flex-1">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold">
              {key.model.substring(0, 1)}
            </div>
            <div className="flex-1">
              <p className="font-medium" style={{ color: "var(--text-primary)" }}>{key.model}</p>
              <p className="text-sm font-mono break-all" style={{ color: "var(--text-tertiary)" }}>
                {key.masked ? maskApiKey(key.key) : key.key}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggleVisibility(key.id)}
              className="p-2 rounded-lg transition-colors cursor-pointer"
              style={{ color: "var(--text-tertiary)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              title={key.masked ? "显示密钥" : "隐藏密钥"}
            >
              {key.masked ? (
                <EyeOutlined />
              ) : (
                <EyeInvisibleOutlined />
              )}
            </button>
            <Popconfirm
              title="确认删除此密钥"
              placement="leftTop"
              description="删除后你将无法使用该 API 进行文本生成?"
              okText="确认"
              onConfirm={() => onDeleteKey(key.id)}
              cancelText="取消"
            >
              <Button danger>
                删除密钥 <DeleteOutlined className="text-red-500" />
              </Button>
            </Popconfirm>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ApiKeyList;