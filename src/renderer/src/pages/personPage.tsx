import React, { useEffect, useState } from 'react';
import { KeyOutlined,  EyeOutlined, EyeInvisibleOutlined, PlusOutlined, DeleteOutlined, EyeTwoTone } from '@ant-design/icons';
import { Button, Input, message, Popconfirm, Select } from 'antd';
import { AIKey } from '../types/common';

import { maskApiKey } from '../utils/stringUtils';
import { getLocalStore, setLocalStore } from '../utils/localStore';
const PersonPage: React.FC = () => {
  const [aiKeys, setAiKeys] = useState<AIKey[]>([]);
  const [documentModel, setDocumentModel] = useState('请选择模型');
  useEffect(() => {
    const model: AIKey[] = getLocalStore<AIKey[]>('model')?.value || [];
    const _documentModel = getLocalStore<string>('documentModel')?.value || '请选择模型';
    setAiKeys(model);
    setDocumentModel(_documentModel);
  }, [])
  const [NewModel, setNewModel] = useState('qwen-plus');
  const [newKeyValue, setNewKeyValue] = useState('');

  const toggleKeyVisibility = (id: number) => {
    setAiKeys(keys =>
      keys.map(key =>
        key.id === id ? { ...key, masked: !key.masked } : key
      )
    );
  };

  const handleDocumentModelChange = (value: string) => {
    setLocalStore('documentModel', { value });
    setDocumentModel(value);
  };
  const handleAddKey = () => {
    if (!NewModel || !newKeyValue) {
      message.warning('请填写完整的 API Key 信息');
      return;
    }
    const newModel: AIKey = {
      id: Date.now(),
      model: NewModel,
      key: newKeyValue,
      masked: true
    };
    const AImodels = [...aiKeys, newModel];
    setLocalStore('model', { value: AImodels });
    setAiKeys(AImodels);
    setNewModel('qwen-plus');
    setNewKeyValue('');
    message.success('API Key 添加成功');
  };

  const handleDeleteKey = (id: number) => {
    const AImodels = aiKeys.filter(key => key.id !== id);
    setAiKeys(AImodels);
    setLocalStore('model', { value: AImodels });
    message.success('API Key 删除成功');
  };
  return (
    <div className="flex-1 bg-gray-50 overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 页面标题 */}
        <div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">模型密钥管理</h1>
          <p className="text-gray-500">管理您的 AI API 密钥</p>
        </div>
 
        <div className="bg-white rounded-2xl p-6 shadow-lg">
          {/* 添加 API Key 按钮 */}
          <div className="flex items-center gap-3 mb-6 ">
            <KeyOutlined className="text-2xl text-blue-500" />
            <h2 className="text-2xl font-bold text-gray-800">API Key 管理</h2>
          </div>
          {/* 已添加的 Key 列表 */}
          <div className="space-y-3 mb-6">
            {aiKeys.map((key) => (
              <div key={key.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold">
                    {key.model.substring(0, 1)}
                  </div> 
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">{key.model}</p>
                    <p className="text-sm font-mono text-gray-500 break-all">
                      {key.masked ? maskApiKey(key.key) : key.key}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleKeyVisibility(key.id)}
                    className="p-2 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                    title={key.masked ? '显示密钥' : '隐藏密钥'}
                  >
                    {key.masked ? (
                      <EyeOutlined className="text-gray-500 " />
                    ) : (
                      <EyeInvisibleOutlined className="text-gray-500  " />
                    )}
                  </button>
                  <Popconfirm
                    title="确认删除此密钥"
                    placement="leftTop"
                    description="删除后你将无法使用该 API 进行文本生成?"
                    okText="确认"
                    onConfirm={() => handleDeleteKey(key.id)}
                    cancelText="取消" >
                    <Button danger>删除密钥 <DeleteOutlined className="text-red-500" /></Button>
                  </Popconfirm>
                </div>
              </div>
            ))}
          </div>

          {/* 添加新 Key */}
          <div className="border-t border-gray-200 pt-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">添加新的 API Key</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">模型名称</label>
                <Select
                  defaultValue="qwen-plus"
                  style={{ width: '100%' }}
                  onChange={(value) => setNewModel(value)}
                  size='large'
                  options={[
                    { value: 'qwen-plus', label: 'QwenPlus' },
                    { value: 'openai', label: 'OpenAI' },
                    { value: 'deepseek', label: 'DeepSeek' },
                    { value: 'glm-5.1', label: 'glm-5.1' },
                    {value: 'openRouter', label: 'openRouter'}
                  ]}
                />
              </div>
              <div style={{}}>
                <label className="block text-sm font-medium text-gray-700 mb-2">API Key</label>
                <Input.Password allowClear
                  placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  onChange={(e) => setNewKeyValue(e.target.value)}
                  type={'password'}
                  iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
                  size='large'
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
          {/* 文档嵌入模型 管理 */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">文档嵌入模型管理</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">模型名称</label>
                <Select
                  value={documentModel}
                  style={{ width: '100%' }}
                  onChange={handleDocumentModelChange}
                  size='large'
                  options={aiKeys.map(key => ({
                    value: key.model, label: key.model
                  }))}
                />
              </div>
            </div>
          </div>
        </div>
       
      </div>
    </div>
  );
};

export default PersonPage;
