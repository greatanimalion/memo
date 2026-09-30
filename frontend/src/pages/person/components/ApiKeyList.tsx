import React, { useEffect, useState } from "react";
import {
  EyeOutlined,
  EyeInvisibleOutlined,
  DeleteOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { AutoComplete, Button, Form, Input, Modal, Popconfirm, message } from "antd";
import { AIKey } from "@renderer/types/common";
import { maskApiKey } from "@renderer/utils/stringUtils";
import { MODEL_PRESETS } from "@renderer/utils/helper";

interface ApiKeyListProps {
  aiKeys: AIKey[];
  onToggleVisibility: (id: number) => void;
  onDeleteKey: (id: number) => void;
  onUpdateKey: (key: AIKey) => void;
}

const ApiKeyList: React.FC<ApiKeyListProps> = ({
  aiKeys,
  onToggleVisibility,
  onDeleteKey,
  onUpdateKey,
}) => {
  const [editing, setEditing] = useState<AIKey | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    if (editing) {
      form.setFieldsValue({
        model: editing.model,
        baseUrl: editing.baseUrl || "",
        key: editing.key,
      });
    } else {
      form.resetFields();
    }
  }, [editing, form]);

  const handleSave = () => {
    form.validateFields().then((values) => {
      if (!editing) return;
      if (!/^https?:\/\//i.test(values.baseUrl)) {
        message.warning("接口地址需以 http:// 或 https:// 开头");
        return;
      }
      onUpdateKey({
        ...editing,
        model: values.model.trim(),
        baseUrl: values.baseUrl.trim(),
        key: values.key.trim(),
        masked: true,
      });
      setEditing(null);
      message.success("密钥配置已更新");
    });
  };

  return (
    <div className="space-y-3 mb-6">
      {aiKeys.map((key) => (
        <div
          key={key.id}
          className="flex items-center justify-between p-4 rounded-xl"
          style={{ backgroundColor: "var(--bg-tertiary)" }}
        >
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold">
              {key.model.substring(0, 1)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium" style={{ color: "var(--text-primary)" }}>{key.model}</p>
              <p className="text-sm font-mono break-all" style={{ color: "var(--text-tertiary)" }}>
                {key.masked ? maskApiKey(key.key) : key.key}
              </p>
              <p className="text-xs break-all" style={{ color: "var(--text-tertiary)" }}>
                {key.baseUrl || "预设端点"}
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
            <Button
              icon={<EditOutlined />}
              style={{ color: "var(--accent-color)" }}
              onClick={() => setEditing(key)}
            >
              编辑
            </Button>
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

      <Modal
        title="编辑 API Key"
        open={!!editing}
        onOk={handleSave}
        onCancel={() => setEditing(null)}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item
            name="model"
            label="模型名称"
            rules={[{ required: true, message: "请输入模型名称" }]}
          >
            <AutoComplete
              allowClear
              placeholder="预设模型或自定义模型名"
              options={MODEL_PRESETS.map((item) => ({
                value: item.value,
                label: `${item.label} (${item.model ?? item.value})`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="baseUrl"
            label="接口地址（Base URL）"
            rules={[
              { required: true, message: "请输入接口地址" },
              { pattern: /^https?:\/\//i, message: "需以 http:// 或 https:// 开头" },
            ]}
          >
            <Input allowClear placeholder="https://api.deepseek.com" />
          </Form.Item>
          <Form.Item
            name="key"
            label="API Key"
            rules={[{ required: true, message: "请输入 API Key" }]}
          >
            <Input.Password allowClear placeholder="sk-xxxxxxxx" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ApiKeyList;
