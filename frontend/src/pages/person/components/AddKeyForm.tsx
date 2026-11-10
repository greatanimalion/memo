import React, { useState } from "react";
import { AutoComplete, Button, Input, message } from "antd";
import { PlusOutlined, EyeTwoTone, EyeInvisibleOutlined } from "@ant-design/icons";
import { AIKey } from "@renderer/types/common";
import { MODEL_PRESETS } from "@renderer/utils/helper";

interface AddKeyFormProps {
  onAddKey: (key: AIKey) => void;
}

const PRESET_URLS = new Set(MODEL_PRESETS.map((item) => item.url));

const AddKeyForm: React.FC<AddKeyFormProps> = ({ onAddKey }) => {
  const [newModel, setNewModel] = useState("qwen-plus");
  const [newBaseUrl, setNewBaseUrl] = useState(MODEL_PRESETS[0].url);
  const [newKeyValue, setNewKeyValue] = useState("");

  // 选中预设时自动带出地址；改成自定义模型时清掉自动生成的预设地址
  const handleModelChange = (value: string) => {
    setNewModel(value);
    const preset = MODEL_PRESETS.find((item) => item.value === value);
    if (preset) {
      setNewBaseUrl((prev) =>
        prev === "" || PRESET_URLS.has(prev) ? preset.url : prev,
      );
    } else {
      setNewBaseUrl((prev) => (PRESET_URLS.has(prev) ? "" : prev));
    }
  };

  const handleAddKey = () => {
    const model = newModel.trim();
    const baseUrl = newBaseUrl.trim();
    const key = newKeyValue.trim();
    if (!model || !baseUrl || !key) {
      message.warning("请填写模型名称、接口地址和 API Key");
      return;
    }
    if (!/^https?:\/\//i.test(baseUrl)) {
      message.warning("接口地址需以 http:// 或 https:// 开头");
      return;
    }
    onAddKey({
      id: Date.now(),
      model,
      baseUrl,
      key,
      masked: true,
    });
    setNewModel("qwen-plus");
    setNewBaseUrl(MODEL_PRESETS[0].url);
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
          <AutoComplete
            style={{ width: "100%" }}
            size="large"
            value={newModel}
            allowClear
            placeholder="选择预设，或输入任意自定义模型名"
            onChange={handleModelChange}
            options={MODEL_PRESETS.map((item) => ({
              value: item.value,
              label: `${item.label} (${item.model ?? item.value})`,
            }))}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            接口地址（Base URL）
          </label>
          <Input
            allowClear
            placeholder="https://api.deepseek.com"
            value={newBaseUrl}
            onChange={(e) => setNewBaseUrl(e.target.value)}
            size="large"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            API Key
          </label>
          <Input.Password
            allowClear
            placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            value={newKeyValue}
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
