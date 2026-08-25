import { useState } from "react";
import { PathNavigation, FileList } from "@renderer/components/common";
import { Button, Input, message, Modal, Select } from "antd";
import {
  FolderOutlined,
  AppstoreOutlined,
  BarsOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import CommandPanel from "@renderer/components/CommandPanel";
import BlockNoteEditor from "@renderer/components/BlockNoteEditor";
import { SearchProps } from "antd/es/input";
import { useMemory } from "@renderer/hooks/useMemory";
import useFileStore from "@renderer/store/useFileStore";
function MemoPage() {
  const {
    viewMode,
    setViewMode,
    sortBy,
    changeSortType,
    handleFolderClick,
    handleBackClick,
    createFileOrFolder,
    searchFiles,
  } = useMemory();
  const [fileName, setFileName] = useState("");
  const { Search } = Input;
  const [messageApi, contextHolder] = message.useMessage();
  const selectedFile = useFileStore((state) => state.selectedFile);
  const [open, setOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [isFolder, setIsFolder] = useState(0);
  const showFileCreateModal = () => {
    setOpen(true);
    setIsFolder(0);
  };
  const showFolderCreateModal = () => {
    setOpen(true);
    setIsFolder(1);
  };
  const handleOk = async () => {
    const name = fileName.trim();
    if (!name) {
      messageApi.open({
        type: "error",
        content: "请输入文件名",
      });
      return;
    }
    setConfirmLoading(true);
    const success = await createFileOrFolder(name, isFolder);
    if (!success) {
      messageApi.open({
        type: "error",
        content: "创建失败",
      });
    } else {
      messageApi.open({
        type: "success",
        content: "创建成功",
      });
      setFileName("");
    }
    setOpen(false);
    setConfirmLoading(false);
  };
  const handleCancel = () => {
    setOpen(false);
  };
  const onSearch: SearchProps["onSearch"] = (value) => {
    searchFiles(value || "");
  };
  return (
    <>
      {contextHolder}
      <Modal
        title={isFolder === 1 ? "请填写文件夹名" : "请填写文件名"}
        open={open}
        onOk={handleOk}
        confirmLoading={confirmLoading}
        onCancel={handleCancel}
        cancelText="取消"
        okText={"创建"}
      >
        <Input
          placeholder={isFolder === 1 ? "请输入文件夹名" : "请输入文件名"}
          onChange={(e) => setFileName(e.target.value)}
          value={fileName}
        />
      </Modal>
      {!selectedFile ? (
        <>
          <div className="flex-1 bg-gray-50 flex flex-row">
            {/* 顶部操作栏 */}
            <div className="bg-white border-b border-gray-200 p-4 w-full overflow-auto">
              {/* 搜索框和新建按钮 */}
              <div className="flex items-center justify-between mb-4">
                <div className="relative flex-1 max-w-2xl">
                  <Search
                    placeholder="请输入名称"
                    size="large"
                    onSearch={onSearch}
                    style={{ width: "100%" }}
                  />
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <Button size="large" onClick={showFolderCreateModal}>
                    <FolderOutlined />
                    <span>新建文件夹</span>
                  </Button>
                  <Button
                    size="large"
                    type="primary"
                    onClick={showFileCreateModal}
                  >
                    <PlusOutlined />
                    <span>新建文件</span>
                  </Button>
                </div>
              </div>
              {/* 路径导航和排序选项 */}
              <div className="flex items-center justify-between">
                <PathNavigation onBackClick={handleBackClick} />
                <div className="flex items-center gap-2">
                  <Select
                    value={sortBy}
                    onChange={changeSortType}
                    className="w-32"
                    options={[
                      { label: "按日期排序", value: "date" },
                      { label: "按名称排序", value: "name" },
                    ]}
                  />
                  <div className="flex items-center bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setViewMode("grid")}
                      className={`p-1.5 rounded transition-colors ${viewMode === "grid" ? "bg-white shadow-sm" : "hover:bg-[#e5e7eb]"}`}
                    >
                      <AppstoreOutlined className="text-gray-600" />
                    </button>
                    <button
                      onClick={() => setViewMode("list")}
                      className={`p-1.5 rounded transition-colors ${viewMode === "list" ? "bg-white shadow-sm" : "hover:bg-[#e5e7eb]"}`}
                    >
                      <BarsOutlined className="text-gray-600" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex overflow-y-auto p-4 height-full shrink-0">
                <FileList onFolderClick={handleFolderClick} />
              </div>
            </div>
            <CommandPanel></CommandPanel>
          </div>
        </>
      ) : (
        <BlockNoteEditor selectedFile={selectedFile}></BlockNoteEditor>
      )}
    </>
  );
}

export default MemoPage;
