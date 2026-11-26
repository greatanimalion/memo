import React, { useState } from "react";
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Tag, message } from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  createModelChannel,
  encodeChannelModel,
  modelOptionLabel,
  modelOptionsFromChannels,
  normalizeChannelModels,
  normalizeModelOptionValue,
  selectableModelsByCapability,
  useConfigStore,
  type AiConfig,
  type ApiCallFormat,
  type ModelCapability,
  type ModelChannel,
} from "@/store/use-config-store";
import { fetchChannelModels } from "@/services/api/image";

const CAPABILITY_META: Record<ModelCapability, { label: string; color: string }> = {
  image: { label: "图像", color: "blue" },
  video: { label: "视频", color: "purple" },
  text: { label: "文本", color: "green" },
  audio: { label: "音频", color: "orange" },
};

const CAPABILITY_OPTIONS = (Object.keys(CAPABILITY_META) as ModelCapability[]).map((value) => ({
  value,
  label: CAPABILITY_META[value].label,
}));

const API_FORMAT_OPTIONS = [
  { value: "openai", label: "OpenAI 兼容" },
  { value: "gemini", label: "Gemini" },
];

const DEFAULT_MODEL_FIELDS: Array<{
  key: "imageModel" | "videoModel" | "textModel" | "audioModel";
  capability: ModelCapability;
  label: string;
}> = [
  { key: "imageModel", capability: "image", label: "图像生成模型" },
  { key: "videoModel", capability: "video", label: "视频生成模型" },
  { key: "textModel", capability: "text", label: "文本生成模型" },
  { key: "audioModel", capability: "audio", label: "音频生成模型" },
];

type ChannelFormValues = {
  name: string;
  baseUrl: string;
  apiKey: string;
  apiFormat: ApiCallFormat;
};

type ModelFormValues = {
  name: string;
  capability: ModelCapability;
};

function maskKey(key: string) {
  if (!key) return "未配置密钥";
  if (key.length <= 8) return `${key.slice(0, 2)}****`;
  return `${key.slice(0, 6)}****${key.slice(-4)}`;
}

/** 渠道变更后重新对齐四个能力的默认模型，避免指向已删除的渠道。 */
function firstModelFor(channels: ModelChannel[], capability: ModelCapability) {
  for (const channel of channels) {
    const model = channel.models.find((item) => item.capability === capability);
    if (model) return encodeChannelModel(channel.id, model.name);
  }
  return "";
}

function reconcileDefaults(config: AiConfig, channels: ModelChannel[]): AiConfig {
  const next: AiConfig = { ...config };
  DEFAULT_MODEL_FIELDS.forEach(({ key, capability }) => {
    next[key] = normalizeModelOptionValue(next[key], channels) || firstModelFor(channels, capability);
  });
  next.model = normalizeModelOptionValue(next.model, channels) || next.imageModel;
  return next;
}

const CanvasApiManager: React.FC = () => {
  const config = useConfigStore((state) => state.config);
  const updateConfig = useConfigStore((state) => state.updateConfig);
  const channels = config.channels;

  const [channelForm] = Form.useForm<ChannelFormValues>();
  const [modelForm] = Form.useForm<ModelFormValues>();
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [modelChannelId, setModelChannelId] = useState<string | null>(null);
  const [busyChannelId, setBusyChannelId] = useState<string | null>(null);
  const [revealedIds, setRevealedIds] = useState<string[]>([]);

  const commitChannels = (nextChannels: ModelChannel[]) => {
    useConfigStore.setState((state) => ({
      config: reconcileDefaults(
        { ...state.config, channels: nextChannels, models: modelOptionsFromChannels(nextChannels) },
        nextChannels,
      ),
    }));
  };

  const updateChannel = (channelId: string, patch: Partial<ModelChannel>) => {
    commitChannels(channels.map((channel) => (channel.id === channelId ? { ...channel, ...patch } : channel)));
  };

  const openCreateChannel = () => {
    setEditingChannelId(null);
    channelForm.resetFields();
    channelForm.setFieldsValue({ name: "", baseUrl: "", apiKey: "", apiFormat: "openai" });
    setChannelModalOpen(true);
  };

  const openEditChannel = (channel: ModelChannel) => {
    setEditingChannelId(channel.id);
    channelForm.setFieldsValue({
      name: channel.name,
      baseUrl: channel.baseUrl,
      apiKey: channel.apiKey,
      apiFormat: channel.apiFormat,
    });
    setChannelModalOpen(true);
  };

  const handleChannelSave = () => {
    channelForm
      .validateFields()
      .then((values) => {
        const baseUrl = values.baseUrl.trim();
        const apiKey = values.apiKey.trim();
        if (editingChannelId) {
          updateChannel(editingChannelId, {
            name: values.name.trim(),
            baseUrl,
            apiKey,
            apiFormat: values.apiFormat,
          });
          message.success("渠道已更新");
        } else {
          const channel = createModelChannel({
            name: values.name.trim(),
            baseUrl,
            apiKey,
            apiFormat: values.apiFormat,
          });
          commitChannels([...channels, channel]);
          message.success("渠道已添加");
        }
        setChannelModalOpen(false);
        setEditingChannelId(null);
      })
      .catch(() => undefined);
  };

  const handleChannelDelete = (channelId: string) => {
    commitChannels(channels.filter((channel) => channel.id !== channelId));
    message.success("渠道已删除");
  };

  const toggleReveal = (channelId: string) => {
    setRevealedIds((ids) => (ids.includes(channelId) ? ids.filter((id) => id !== channelId) : [...ids, channelId]));
  };

  const handleFetchModels = async (channel: ModelChannel) => {
    if (!channel.baseUrl.trim() || !channel.apiKey.trim()) {
      message.warning("请先填写接口地址和 API Key");
      return;
    }
    setBusyChannelId(channel.id);
    try {
      const names = await fetchChannelModels(channel);
      const models = normalizeChannelModels([...channel.models, ...names]);
      const added = models.length - channel.models.length;
      updateChannel(channel.id, { models });
      message.success(added > 0 ? `拉取完成，新增 ${added} 个模型` : "拉取完成，没有新模型");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "拉取模型失败");
    } finally {
      setBusyChannelId(null);
    }
  };

  const openAddModel = (channelId: string) => {
    setModelChannelId(channelId);
    modelForm.resetFields();
    modelForm.setFieldsValue({ name: "", capability: "image" });
  };

  const handleModelSave = () => {
    modelForm
      .validateFields()
      .then((values) => {
        if (!modelChannelId) return;
        const channel = channels.find((item) => item.id === modelChannelId);
        if (!channel) return;
        const name = values.name.trim();
        if (channel.models.some((model) => model.name === name)) {
          message.warning("该模型已存在");
          return;
        }
        updateChannel(channel.id, { models: [...channel.models, { name, capability: values.capability }] });
        setModelChannelId(null);
        message.success("模型已添加");
      })
      .catch(() => undefined);
  };

  const removeModel = (channelId: string, modelName: string) => {
    const channel = channels.find((item) => item.id === channelId);
    if (!channel) return;
    updateChannel(channelId, { models: channel.models.filter((model) => model.name !== modelName) });
  };

  const changeModelCapability = (channelId: string, modelName: string, capability: ModelCapability) => {
    const channel = channels.find((item) => item.id === channelId);
    if (!channel) return;
    updateChannel(channelId, {
      models: channel.models.map((model) => (model.name === modelName ? { ...model, capability } : model)),
    });
  };

  return (
    <div className="pt-6" style={{ borderTop: "1px solid var(--border-color)" }}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            画布 API 管理
          </h2>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            画布在浏览器中直接调用第三方接口，这里配置接口地址、API Key 与模型名称。
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateChannel}>
          新增渠道
        </Button>
      </div>

      {channels.length === 0 ? (
        <div
          className="p-6 rounded-xl text-center text-sm"
          style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-tertiary)" }}
        >
          还没有渠道，点击右上角「新增渠道」开始配置
        </div>
      ) : (
        <div className="space-y-3">
          {channels.map((channel) => {
            const revealed = revealedIds.includes(channel.id);
            return (
              <div key={channel.id} className="p-4 rounded-xl space-y-3" style={{ backgroundColor: "var(--bg-tertiary)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                        {channel.name}
                      </span>
                      <Tag color={channel.apiFormat === "gemini" ? "purple" : "geekblue"}>
                        {channel.apiFormat === "gemini" ? "Gemini" : "OpenAI 兼容"}
                      </Tag>
                      <Tag>{channel.models.length} 个模型</Tag>
                    </div>
                    <p className="text-xs font-mono break-all mt-1" style={{ color: "var(--text-tertiary)" }}>
                      {channel.baseUrl || "未填写接口地址"}
                    </p>
                    <p className="text-xs font-mono break-all" style={{ color: "var(--text-tertiary)" }}>
                      {revealed ? channel.apiKey || "未配置密钥" : maskKey(channel.apiKey)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="small"
                      type="text"
                      icon={revealed ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                      title={revealed ? "隐藏密钥" : "显示密钥"}
                      onClick={() => toggleReveal(channel.id)}
                    />
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      loading={busyChannelId === channel.id}
                      onClick={() => handleFetchModels(channel)}
                    >
                      拉取模型
                    </Button>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEditChannel(channel)}>
                      编辑
                    </Button>
                    <Popconfirm
                      title="确认删除该渠道"
                      description="删除后引用该渠道的节点需要重新选择模型"
                      okText="确认"
                      cancelText="取消"
                      onConfirm={() => handleChannelDelete(channel.id)}
                    >
                      <Button size="small" danger icon={<DeleteOutlined />}>
                        删除
                      </Button>
                    </Popconfirm>
                  </div>
                </div>

                <div className="space-y-2">
                  {channel.models.length === 0 ? (
                    <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                      暂无模型，可「拉取模型」或手动添加
                    </p>
                  ) : (
                    channel.models.map((model) => (
                      <div key={model.name} className="flex items-center gap-2">
                        <span
                          className="flex-1 min-w-0 truncate text-sm font-mono"
                          style={{ color: "var(--text-primary)" }}
                          title={model.name}
                        >
                          {model.name}
                        </span>
                        <Select
                          size="small"
                          value={model.capability}
                          style={{ width: 96 }}
                          options={CAPABILITY_OPTIONS}
                          onChange={(value) => changeModelCapability(channel.id, model.name, value)}
                        />
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => removeModel(channel.id, model.name)}
                        />
                      </div>
                    ))
                  )}
                  <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => openAddModel(channel.id)}>
                    添加模型
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        {DEFAULT_MODEL_FIELDS.map((field) => (
          <div key={field.key}>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              {field.label}
            </label>
            <Select
              style={{ width: "100%" }}
              size="large"
              value={config[field.key] || undefined}
              placeholder="未选择模型"
              options={selectableModelsByCapability(config, field.capability).map((value) => ({
                value,
                label: modelOptionLabel(config, value),
              }))}
              onChange={(value) => updateConfig(field.key, value)}
            />
          </div>
        ))}
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            画布默认生图张数
          </label>
          <InputNumber
            style={{ width: "100%" }}
            size="large"
            min={1}
            max={15}
            value={Number(config.canvasImageCount) || 1}
            onChange={(value) => updateConfig("canvasImageCount", String(value || 1))}
          />
        </div>
      </div>

      <Modal
        title={editingChannelId ? "编辑渠道" : "新增渠道"}
        open={channelModalOpen}
        onOk={handleChannelSave}
        onCancel={() => {
          setChannelModalOpen(false);
          setEditingChannelId(null);
        }}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={channelForm} layout="vertical" className="mt-4">
          <Form.Item name="name" label="渠道名称" rules={[{ required: true, message: "请输入渠道名称" }]}>
            <Input allowClear placeholder="例如 OpenAI 官方 / 某中转站" />
          </Form.Item>
          <Form.Item
            name="baseUrl"
            label="接口地址（Base URL）"
            rules={[
              { required: true, message: "请输入接口地址" },
              { pattern: /^https?:\/\//i, message: "需以 http:// 或 https:// 开头" },
            ]}
          >
            <Input allowClear placeholder="https://api.openai.com" />
          </Form.Item>
          <Form.Item name="apiKey" label="API Key" rules={[{ required: true, message: "请输入 API Key" }]}>
            <Input.Password allowClear placeholder="sk-xxxxxxxxxxxxxxxx" />
          </Form.Item>
          <Form.Item name="apiFormat" label="接口协议" rules={[{ required: true, message: "请选择接口协议" }]}>
            <Select options={API_FORMAT_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="添加模型"
        open={Boolean(modelChannelId)}
        onOk={handleModelSave}
        onCancel={() => setModelChannelId(null)}
        okText="添加"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={modelForm} layout="vertical" className="mt-4">
          <Form.Item name="name" label="模型名称" rules={[{ required: true, message: "请输入模型名称" }]}>
            <Input allowClear placeholder="例如 gpt-image-1 / seedream-4.0 / veo-3" />
          </Form.Item>
          <Form.Item name="capability" label="能力类型" rules={[{ required: true, message: "请选择能力类型" }]}>
            <Select options={CAPABILITY_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CanvasApiManager;
