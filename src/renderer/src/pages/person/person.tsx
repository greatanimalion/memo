import React, { useEffect, useState } from "react";
import { KeyOutlined } from "@ant-design/icons";
import { AIKey } from "@renderer/types/common";
import { getLocalStore, setLocalStore } from "@renderer/utils/localStore";
import ApiKeyList from "./components/ApiKeyList";
import AddKeyForm from "./components/AddKeyForm";
import DocumentModelManager from "./components/DocumentModelManager";

const PersonPage: React.FC = () => {
  const [aiKeys, setAiKeys] = useState<AIKey[]>([]);
  const [documentModel, setDocumentModel] = useState("请选择模型");

  useEffect(() => {
    const model: AIKey[] = getLocalStore<AIKey[]>("model")?.value || [];
    const _documentModel =
      getLocalStore<string>("documentModel")?.value || "请选择模型";
    setAiKeys(model);
    setDocumentModel(_documentModel);
  }, []);

  const toggleKeyVisibility = (id: number) => {
    setAiKeys((keys) =>
      keys.map((key) =>
        key.id === id ? { ...key, masked: !key.masked } : key,
      ),
    );
  };

  const handleDocumentModelChange = (value: string) => {
    setLocalStore("documentModel", { value });
    setDocumentModel(value);
  };

  const handleAddKey = (newModel: AIKey) => {
    const AImodels = [...aiKeys, newModel];
    setLocalStore("model", { value: AImodels });
    setAiKeys(AImodels);
  };

  const handleDeleteKey = (id: number) => {
    const AImodels = aiKeys.filter((key) => key.id !== id);
    setAiKeys(AImodels);
    setLocalStore("model", { value: AImodels });
  };

  return (
    <div className="flex-1 overflow-y-auto p-8" style={{ backgroundColor: "var(--bg-secondary)" }}>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 页面标题 */}
        <div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            模型密钥管理
          </h1>
          <p style={{ color: "var(--text-tertiary)" }}>管理您的 AI API 密钥</p>
        </div>

        <div className="rounded-2xl p-6 shadow-lg" style={{ backgroundColor: "var(--bg-primary)" }}>
          {/* 添加 API Key 按钮 */}
          <div className="flex items-center gap-3 mb-6 ">
            <KeyOutlined className="text-2xl text-blue-500" />
            <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>API Key 管理</h2>
          </div>
          
          <ApiKeyList
            aiKeys={aiKeys}
            onToggleVisibility={toggleKeyVisibility}
            onDeleteKey={handleDeleteKey}
          />
          
          <AddKeyForm onAddKey={handleAddKey} />
          
          <DocumentModelManager
            aiKeys={aiKeys}
            documentModel={documentModel}
            onModelChange={handleDocumentModelChange}
          />
        </div>
      </div>
    </div>
  );
};

export default PersonPage;