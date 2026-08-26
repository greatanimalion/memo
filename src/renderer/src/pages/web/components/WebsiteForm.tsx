import React, { useState, useEffect } from "react";
import { Modal, Form, Input, Radio, message } from "antd";

// 图标类型定义
interface webType {
  name: string;
  url: string;
  iconType: "emoji" | "image";
  emoji?: string;
  imageUrl?: string;
  imageType?: "url" | "base64";
}

// 预设图标列表
const presetIcons = [
  "🚀",
  "📦",
  "🎨",
  "⚡",
  "🔥",
  "💎",
  "🌟",
  "🎯",
  "💡",
  "🎮",
  "📚",
  "🎵",
  "🎬",
  "📷",
  "💻",
  "🌈",
];

// 获取网站favicon
const getFaviconUrl = (url: string): string => {
  try {
    const domain = new URL(url).hostname;
    // 尝试使用Google的favicon服务获取
    return `https://icon.bqb.cool?url=${domain}`;
  } catch {
    return "";
  }
};

interface WebsiteFormProps {
  isOpen: boolean;
  editingWebsite: webType | null;
  onSubmit: (website: webType) => void;
  onCancel: () => void;
}

const WebsiteForm: React.FC<WebsiteFormProps> = ({
  isOpen,
  editingWebsite,
  onSubmit,
  onCancel,
}) => {
  const [form] = Form.useForm();
  const [currentImoji, setCurrentImoji] = useState("");

  useEffect(() => {
    if (editingWebsite) {
      form.setFieldsValue({
        name: editingWebsite.name,
        url: editingWebsite.url,
        iconType: editingWebsite.iconType,
        emoji: editingWebsite.emoji || "",
        imageUrl: editingWebsite.imageUrl || "",
      });
    } else {
      form.resetFields();
    }
  }, [editingWebsite, form]);

  const selectEmoji = (emoji: string) => {
    form.setFieldValue("emoji", emoji);
    setCurrentImoji(emoji);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const newWeb: webType = {
      name: values.name,
      url: values.url,
      iconType: values.iconType,
      emoji: values.iconType === "emoji" ? values.emoji : undefined,
      imageUrl:
        values.iconType === "image"
          ? values.imageUrl || getFaviconUrl(values.url)
          : undefined,
    };
    onSubmit(newWeb);
    form.resetFields();
    setCurrentImoji("");
  };

  return (
    <Modal
      title={editingWebsite ? "编辑图标" : "添加图标"}
      open={isOpen}
      onOk={handleSubmit}
      onCancel={() => {
        onCancel();
        form.resetFields();
      }}
      okText={editingWebsite ? "保存" : "添加"}
      cancelText="取消"
      width={480}
      className="glass-modal"
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        className="mt-4"
        initialValues={{
          iconType: "image",
          emoji: "🚀",
        }}
      >
        <Form.Item
          name="name"
          label="名称"
          rules={[
            { required: true, message: "请输入图标名称" },
            { max: 20, message: "名称最多20个字符" },
          ]}
        >
          <Input placeholder="例如：Google" />
        </Form.Item>

        <Form.Item
          name="url"
          label="网址"
          rules={[
            { required: true, message: "请输入网址" },
            { type: "url", message: "请输入有效的网址" },
          ]}
        >
          <Input placeholder="https://www.google.com" />
        </Form.Item>

        <Form.Item name="iconType" label="图标类型">
          <Radio.Group>
            <Radio value="image"> 网站图标 </Radio>
            <Radio value="emoji"> 表情图标 </Radio>
          </Radio.Group>
        </Form.Item>
        <Form.Item
          shouldUpdate={(prev, curr) => prev.iconType !== curr.iconType}
        >
          {({ getFieldValue }) =>
            getFieldValue("iconType") === "emoji" ? (
              <Form.Item
                name="emoji"
                label="选择表情"
                rules={[{ required: true, message: "请选择一个表情" }]}
              >
                <div className="grid grid-cols-8 gap-2 p-4 bg-gray-50 rounded-xl">
                  {presetIcons.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => selectEmoji(emoji)}
                      className={`w-10 h-10 flex items-center cursor-pointer justify-center text-xl rounded-lg transition-all hover:bg-gray-200 ${
                        currentImoji === emoji
                          ? "bg-gray-200 ring-2 ring-gray-600 scale-110"
                          : "bg-white hover:bg-gray-100 hover:scale-105"
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </Form.Item>
            ) : (
              <Form.Item
                name="imageUrl"
                label="自定义图标URL（可选）"
                tooltip="留空则自动获取网站图标"
              >
                <Input placeholder="https://example.com/icon.png" />
              </Form.Item>
            )
          }
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default WebsiteForm;