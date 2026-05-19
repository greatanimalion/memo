import { useEffect, useState } from "react"
import { Button, Modal, Form, Input, message, Empty, Dropdown, Radio } from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    GlobalOutlined,
} from '@ant-design/icons';
import { getLocalStore, setLocalStore } from "../utils/localStore";
import { webListcontent } from "../constants";

export default function WebPage() {
    const [url, setUrl] = useState("")
    useEffect(() => {
        const webview = document.querySelector('webview')
        if (!webview) return
        function handlePageLoad(event) {
            console.log('页内跳转:', event.url)
        }
        webview.addEventListener('did-navigate-in-page', handlePageLoad)
        return () => {
            webview.removeEventListener('did-navigate-in-page', handlePageLoad)
        }
    }, [])
    return (<>
        <>
            {!url && <App setUrl={setUrl} />}
            {!!url && <webview src={url} style={{ width: '100%', height: '100%' }}></webview>}
        </>
    </>)
}



// 图标类型定义
interface webType {
    name: string;
    url: string;
    iconType: 'emoji' | 'image';
    emoji?: string;
    imageUrl?: string;
    imageType?: 'url' | 'base64'
}

// 预设图标列表
const presetIcons = ['🚀', '📦', '🎨', '⚡', '🔥', '💎', '🌟', '🎯', '💡', '🎮', '📚', '🎵', '🎬', '📷', '💻', '🌈'];

// 获取网站favicon
const getFaviconUrl = (url: string): string => {
    try {
        const domain = new URL(url).hostname;
        // 尝试使用Google的favicon服务获取
        return `https://icon.bqb.cool?url=${domain}`;
    } catch {
        return '';
    }
};

function App({ setUrl }) {
    const [web, setWeb] = useState<webType[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingWeb, setEditingWeb] = useState<webType | null>(null);
    const [form] = Form.useForm();
    const [currentImoji, setCurrentImoji] = useState("")
    useEffect(() => {
        let _web = getLocalStore<webType[]>('web')?.value
        if (!_web) {
            _web = webListcontent as webType[]
            setLocalStore('web', { value: _web })
        }
        setWeb(_web)
    }, [])
    // 打开添加弹窗
    const handleAdd = () => {
        setEditingWeb(null);
        form.resetFields();
        setIsModalOpen(true);
    };

    // 打开编辑弹窗
    const handleEdit = (icon: webType) => {
        setEditingWeb(icon);
        form.setFieldsValue({
            name: icon.name,
            url: icon.url,
            iconType: icon.iconType,
            emoji: icon.emoji || '',
            imageUrl: icon.imageUrl || '',
        });
        setIsModalOpen(true);
    };

    // 删除图标
    const handleDelete = (name: string) => {
        Modal.confirm({
            title: '确认删除',
            content: '确定要删除这个图标吗？',
            okText: '确认',
            cancelText: '取消',
            okButtonProps: { danger: true },
            onOk: () => {
                const _web = web.filter(item => item.name !== name);
                setWeb(_web);
                setLocalStore('web', { value: _web })
                message.success('删除成功');
            },
        });
    };

    // 提交表单
    const handleSubmit = async () => {
        const values = await form.validateFields();
        const newWeb: webType = {
            name: values.name,
            url: values.url,
            iconType: values.iconType,
            emoji: values.iconType === 'emoji' ? values.emoji : undefined,
            imageUrl: values.iconType === 'image'
                ? (values.imageUrl || getFaviconUrl(values.url))
                : undefined,
        };
        if (editingWeb) {
            // 编辑模式
            const _newWeb = web.map(item => item.name === editingWeb.name ? newWeb : item)
            setWeb(_newWeb);
            setLocalStore('web', { value: _newWeb })
            message.success('修改成功');
        } else {
            // 添加模式
            const i = web.findIndex(item => item.name === newWeb.name)
            if (i >= 0) {
                message.error('图标名称重复，请重新输入')
                return
            }
            const _newWeb = [...web, newWeb]
            setWeb(_newWeb);
            setLocalStore('web', { value: _newWeb })
            message.success('添加成功');
        }
        setIsModalOpen(false);
        form.resetFields();
        setCurrentImoji("")
    };

    // 选择表情
    const selectEmoji = (emoji: string) => {
        form.setFieldValue('emoji', emoji);
        setCurrentImoji(emoji)
    };

    // 渲染图标
    const renderIcon = (icon: webType) => {
        if (icon.iconType === 'emoji' && icon.emoji) {
            return (
                <div className="w-12 h-12 flex items-center justify-center text-3xl  rounded-xl  ">
                    {icon.emoji}
                </div>
            );
        }

        if (icon.imageUrl) {
            return (
                <img
                    src={icon.imageUrl}
                    alt={icon.name}
                    className="w-12 h-12 rounded-xl  bg-white  "
                    onError={(e) => {
                        (e.target as HTMLImageElement).src = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='80'>🌐</text></svg>`;
                    }}
                />
            );
        }

        return (
            <div className="w-12 h-12 flex items-center justify-center bg-linear-to-br from-gray-700 to-gray-900 rounded-xl text-white text-2xl shadow-lg">
                <GlobalOutlined />
            </div>
        );
    };

    return (
        <div className="flex-1 p-4 md:p-8">
            {/* 顶部工具栏 */}
            <div className="max-w-5xl mx-auto mb-6">
                <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">

                        <h1 className="text-xl font-semibold text-gray-800">我的网站</h1>
                    </div>
                    <Button

                        icon={<PlusOutlined />}
                        onClick={handleAdd}
                        size="large"
                        className="bg-linear-to-br from-gray-800 to-gray-95  border-0  rounded-xl"
                    >
                        添加图标
                    </Button>
                </div>
            </div>

            {/* 图标网格 */}
            <div className="bg-white rounded-2xl p-6 shadow-lg  ">
                <div className="">
                    {web.length > 0 ? (
                        <div className="flex flex-wrap gap-4">
                            {web.map((w, i) => (
                                <div
                                    key={i}
                                    className="hover:-translate-y-2  duration-200 flex flex-col items-center gap-2 p-4 rounded-2xl  cursor-pointer relative"
                                >
                                    <Dropdown menu={{
                                        items: [
                                            { key: '1', label: <div className=' flex gap-1 items-center' onClick={() => handleEdit(w)}><EditOutlined />编辑</div>, },
                                            { key: '2', label: <div className='text-red-500 flex gap-1 items-center' onClick={() => handleDelete(w.name)} ><DeleteOutlined />删除</div> },
                                        ]
                                    }} placement="top">
                                        <span
                                            rel="noopener noreferrer"
                                            className="flex flex-col items-center gap-2 no-underline"
                                            onClick={() => setUrl(w.url)}
                                        >

                                            {renderIcon(w)}
                                            <span className="text-sm text-gray-700 text-center max-w-full truncate">
                                                {w.name}
                                            </span>
                                        </span>
                                    </Dropdown>

                                </div>
                            ))}
                        </div>
                    ) : (
                        <Empty
                            description={
                                <span className="text-gray-500">还没有添加任何图标，点击右上角添加</span>
                            }
                            className="py-12"
                        >
                            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                                添加图标
                            </Button>
                        </Empty>
                    )}
                </div>
            </div>

            {/* 添加/编辑弹窗 */}
            <Modal
                title={editingWeb ? '编辑图标' : '添加图标'}
                open={isModalOpen}
                onOk={handleSubmit}
                onCancel={() => {
                    setIsModalOpen(false);
                    form.resetFields();
                }}
                okText={editingWeb ? '保存' : '添加'}
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
                        iconType: 'image',
                        emoji: '🚀',
                    }}
                >
                    <Form.Item
                        name="name"
                        label="名称"
                        rules={[
                            { required: true, message: '请输入图标名称' },
                            { max: 20, message: '名称最多20个字符' },
                        ]}
                    >
                        <Input placeholder="例如：Google" />
                    </Form.Item>

                    <Form.Item
                        name="url"
                        label="网址"
                        rules={[
                            { required: true, message: '请输入网址' },
                            { type: 'url', message: '请输入有效的网址' },
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
                    <Form.Item shouldUpdate={(prev, curr) => prev.iconType !== curr.iconType}>
                        {({ getFieldValue }) =>
                            getFieldValue('iconType') === 'emoji' ? (
                                <Form.Item
                                    name="emoji"
                                    label="选择表情"
                                    rules={[{ required: true, message: '请选择一个表情' }]}
                                >
                                    <div className="grid grid-cols-8 gap-2 p-4 bg-gray-50 rounded-xl">
                                        {presetIcons.map((emoji) => (
                                            <button
                                                key={emoji}
                                                type="button"
                                                onClick={() => selectEmoji(emoji)}
                                                className={`w-10 h-10 flex items-center cursor-pointer justify-center text-xl rounded-lg transition-all hover:bg-gray-200 ${currentImoji === emoji
                                                    ? 'bg-gray-200 ring-2 ring-gray-600 scale-110'
                                                    : 'bg-white hover:bg-gray-100 hover:scale-105'
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
        </div>
    );
}


