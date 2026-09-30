import React, { useState } from "react";
import { PathNavigation, FileList } from "@renderer/components/common";
import { Button, Input, message, Select, Modal } from "antd";
import {
  FolderOutlined,
  AppstoreOutlined,
  BarsOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { SearchProps } from "antd/es/input";
import { useMemory } from "@renderer/hooks/useMemory";
import { getMemoryChildById } from "@renderer/services/memeoy";
import useFileStore from "@renderer/store/useFileStore";

const FileManager: React.FC = () => {
  const {
    viewMode,
    setViewMode,
    sortBy,
    changeSortType,
    handleFolderClick,
    handleBackClick,
    createFileOrFolder,
    searchFiles,
    handlePathClick
  } = useMemory();
  const [fileName, setFileName] = useState("");
  const { Search } = Input;
  const [messageApi, contextHolder] = message.useMessage();
  const [open, setOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [isFolder, setIsFolder] = useState(0);
  const currentFileIdsArr = useFileStore((s) => s.currentFileIdsArr);

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
    const parentId = currentFileIdsArr[currentFileIdsArr.length - 1];
    const siblings = await getMemoryChildById(parentId);
    const duplicated = (siblings || []).some((item) => item.title === name);
    if (duplicated) {
      messageApi.open({
        type: "error",
        content:
          isFolder === 1
            ? "当前文件夹下已存在同名文件夹"
            : "当前文件夹下已存在同名文件",
      });
      setConfirmLoading(false);
      return;
    }
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
      <div className="flex-1 flex flex-row" style={{ backgroundColor: "var(--bg-secondary)" }}>
        {/* 顶部操作栏 */}
        <div className="p-4 w-full overflow-auto" style={{ backgroundColor: "var(--bg-primary)", borderBottom: "1px solid var(--border-color)" }}>
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
            <PathNavigation onBackClick={handleBackClick} onPathClick={handlePathClick} />
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
              <div className="flex items-center rounded-lg p-1" style={{ backgroundColor: "var(--bg-tertiary)" }}>
                <button
                  onClick={() => setViewMode("grid")}
                  className="p-1.5 rounded transition-colors"
                  style={{
                    backgroundColor: viewMode === "grid" ? "var(--bg-primary)" : "transparent",
                    color: "var(--text-secondary)",
                    boxShadow: viewMode === "grid" ? "var(--shadow-sm)" : "none",
                  }}
                >
                  <AppstoreOutlined />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className="p-1.5 rounded transition-colors"
                  style={{
                    backgroundColor: viewMode === "list" ? "var(--bg-primary)" : "transparent",
                    color: "var(--text-secondary)",
                    boxShadow: viewMode === "list" ? "var(--shadow-sm)" : "none",
                  }}
                >
                  <BarsOutlined />
                </button>
              </div>
            </div>
          </div>
          <div className="flex overflow-y-auto p-4 height-full shrink-0">
            <FileList onFolderClick={handleFolderClick} />
          </div>
        </div>
      </div>
    </>
  );
};

export default FileManager;