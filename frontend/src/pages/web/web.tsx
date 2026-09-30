import { useEffect, useState } from "react";
import { Button, Modal, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { getLocalStore, setLocalStore } from "@renderer/utils/localStore";
import { webListcontent } from "@renderer/constants";
import WebsiteGrid from "./components/WebsiteGrid";
import WebsiteForm from "./components/WebsiteForm";

// 图标类型定义
interface webType {
  name: string;
  url: string;
  iconType: "emoji" | "image";
  emoji?: string;
  imageUrl?: string;
  imageType?: "url" | "base64";
}

export default function WebPage() {
  const [url, setUrl] = useState("");
  const [web, setWeb] = useState<webType[]>(() => {
    let _web = getLocalStore<webType[]>("web")?.value;
    if (!_web) {
      _web = webListcontent as webType[];
      setLocalStore("web", { value: _web });
    }
    return _web || [];
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWeb, setEditingWeb] = useState<webType | null>(null);

  useEffect(() => {
    const webview = document.querySelector("webview");
    if (!webview) return;
    function handlePageLoad(event) {
      console.log("页内跳转:", event.url);
    }
    webview.addEventListener("did-navigate-in-page", handlePageLoad);
    return () => {
      webview.removeEventListener("did-navigate-in-page", handlePageLoad);
    };
  }, []);

  const handleAdd = () => {
    setEditingWeb(null);
    setIsModalOpen(true);
  };

  const handleEdit = (icon: webType) => {
    setEditingWeb(icon);
    setIsModalOpen(true);
  };

  const handleDelete = (name: string) => {
    Modal.confirm({
      title: "确认删除",
      content: "确定要删除这个图标吗？",
      okText: "确认",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: () => {
        const _web = web.filter((item) => item.name !== name);
        setWeb(_web);
        setLocalStore("web", { value: _web });
        message.success("删除成功");
      },
    });
  };

  const handleSubmit = async (newWeb: webType) => {
    if (editingWeb) {
      // 编辑模式
      const _newWeb = web.map((item) =>
        item.name === editingWeb.name ? newWeb : item,
      );
      setWeb(_newWeb);
      setLocalStore("web", { value: _newWeb });
      message.success("修改成功");
    } else {
      // 添加模式
      const i = web.findIndex((item) => item.name === newWeb.name);
      if (i >= 0) {
        message.error("图标名称重复，请重新输入");
        return;
      }
      const _newWeb = [...web, newWeb];
      setWeb(_newWeb);
      setLocalStore("web", { value: _newWeb });
      message.success("添加成功");
    }
    setIsModalOpen(false);
  };

  return (
    <>
      <>
        {!url && (
          <div className="flex-1 p-4 md:p-8">
            {/* 顶部工具栏 */}
            <div className="max-w-5xl mx-auto mb-6">
              <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>我的网站</h1>
                </div>
                <Button
                  icon={<PlusOutlined />}
                  onClick={handleAdd}
                  size="large"
                  className="bg-linear-to-br from-gray-800 to-gray-95 border-0 rounded-xl"
                >
                  添加图标
                </Button>
              </div>
            </div>

            <WebsiteGrid
              websites={web}
              onAdd={handleAdd}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onVisit={setUrl}
            />

            <WebsiteForm
              isOpen={isModalOpen}
              editingWebsite={editingWeb}
              onSubmit={handleSubmit}
              onCancel={() => setIsModalOpen(false)}
            />
          </div>
        )}
        {!!url && (
          <webview
            src={url}
            style={{ width: "100%", height: "100%" }}
          ></webview>
        )}
      </>
    </>
  );
}