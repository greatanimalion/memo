import React, { useState } from "react";
import { Button, Input, message, Select } from "antd";
import { PlusOutlined, EyeTwoTone, EyeInvisibleOutlined } from "@ant-design/icons";
import { AIKey } from "@renderer/types/common";

interface AddKeyFormProps {
  onAddKey: (key: AIKey) => void;
}

const AddKeyForm: React.FC<AddKeyFormProps> = ({ onAddKey }) => {
  const [NewModel, setNewModel] = useState("qwen-plus");
  const [newKeyValue, setNewKeyValue] = useState("");

  const handleAddKey = () => {
    if (!NewModel || !newKeyValue) {
      message.warning("请填写完整的 API Key 信息");
      return;
    }
    const newModel: AIKey = {
      id: Date.now(),
      model: NewModel,
      key: newKeyValue,
      masked: true,
    };
    onAddKey(newModel);
    setNewModel("qwen-plus");
    setNewKeyValue("");
    message.success("API Key 添加成功");
  };

  return (
    <div className="pt-6 mb-6" style={{ borderTop: "1px solid var(--border-color)" }}>
      <h3 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
        添加新的 API Key
      </h3>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            模型名称
          </label>
          <Select
            defaultValue="qwen-plus"
            style={{ width: "100%" }}
            onChange={(value) => setNewModel(value)}
            size="large"
            options={[
              { value: "qwen-plus", label: "QwenPlus" },
              { value: "openai", label: "OpenAI" },
              { value: "deepseek", label: "DeepSeek" },
              { value: "glm-5.1", label: "glm-5.1" },
              { value: "openRouter", label: "openRouter" },
            ]}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            API Key
          </label>
          <Input.Password
            allowClear
            placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            onChange={(e) => setNewKeyValue(e.target.value)}
            type={"password"}
            iconRender={(visible) =>
              visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
            }
            size="large"
          />
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAddKey}
          className="w-full h-11"
        >
          添加 API Key
        </Button>
      </div>
    </div>
  );
};

export default AddKeyForm;