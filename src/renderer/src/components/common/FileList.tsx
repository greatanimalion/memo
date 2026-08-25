import React, { useState } from "react";
import {
  FolderOutlined,
  FileOutlined,
  StarOutlined,
  StarFilled,
  UndoOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { Memory } from "@type/memory";
import { Dropdown, Empty, Input, Modal } from "antd";
import {
  deleteMemory,
  getMemoryChildById,
  updateMemory,
} from "@renderer/services/memeoy";
import { formatDateByTimestamp, formatRelativeTime } from "@renderer/utils";
import useFileStore from "@renderer/store/useFileStore";
import { regularNumberSize } from "@renderer/utils/number";
interface FileListProps {
  onFolderClick: (folderName: string, fileId: string) => void;
}
const FileList: React.FC<FileListProps> = ({ onFolderClick }) => {
  const reName = (file: Memory) => {
    setOpen(true);
    setModifyFile(file);
    setFileName(file.title);
  };
  const files = useFileStore((state) => state.currentFolderItemsArr);
  const viewMode = useFileStore((state) => state.viewMode);
  const [open, setOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [modifyFile, setModifyFile] = useState<Memory | null>(null);
  const [fileName, setFileName] = useState("");
  const [modal, contextHolder] = Modal.useModal();
  const onToggleStar = useFileStore((state) => state.toggleStar);
  const setCurrentFolderItemsArr = useFileStore(
    (state) => state.setCurrentFolderItemsArr,
  );
  const onFileClick = useFileStore((state) => state.setSelectedFile);
  const handleOk = async () => {
    if (!modifyFile) return console.log("modifyFile is null");
    setConfirmLoading(true);
    await updateMemory(modifyFile.id, { ...modifyFile, title: fileName });
    const memorys = await getMemoryChildById(modifyFile.parentId);
    setCurrentFolderItemsArr(memorys);
    setConfirmLoading(false);
    setOpen(false);
    setModifyFile(null);
    setFileName("");
  };
  const deleteFile = (file: Memory) => () => {
    if (!file) return console.log("file is null");
    modal.confirm({ title: "确认删除:" + file.title }).then(
      async () => {
        await deleteMemory(file.id);
        const memorys = await getMemoryChildById(file.parentId);
        setCurrentFolderItemsArr(memorys);
      },
      () => {},
    );
  };
  if (viewMode === "list") {
    return (
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden flex-1">
        {contextHolder}
        <Modal
          title={modifyFile?.isFolder ? "请填写文件夹名" : "请填写文件名"}
          open={open}
          onOk={handleOk}
          confirmLoading={confirmLoading}
          cancelText={"取消"}
          okText={"修改"}
          onCancel={() => {
            setOpen(false);
            setModifyFile(null);
            setFileName("");
          }}
        >
          <Input
            placeholder={
              modifyFile?.isFolder ? "请输入文件夹名" : "请输入文件名"
            }
            onChange={(e) => setFileName(e.target.value)}
            value={fileName}
          />
        </Modal>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">
                名称
              </th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">
                大小
              </th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">
                修改日期
              </th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {files.length > 0 ? (
              files.map((file) => (
                <tr
                  key={file.id}
                  className="hover:bg-gray-50 border-b border-gray-100 transition-colors"
                >
                  <td
                    className="py-3 px-4"
                    onClick={() =>
                      file.isFolder
                        ? onFolderClick(file.title, file.id)
                        : onFileClick(file)
                    }
                  >
                    <div className="flex items-center gap-3 cursor-pointer ">
                      {file.isFolder ? (
                        <FolderOutlined
                          className=" text-xl"
                          style={{ color: "oklch(79.5% 0.184 86.047)" }}
                        />
                      ) : (
                        <FileOutlined
                          className=" text-xl"
                          style={{ color: "oklch(62.3% 0.214 259.815)" }}
                        />
                      )}
                      <span
                        className={`font-medium text-gray-800 ${file.isFolder ? "hover:underline" : ""}`}
                      >
                        {file.title}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {file.isFolder ? null : regularNumberSize(file.size || 0)}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {formatRelativeTime(+file.updated)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!file.isFolder && (
                        <button
                          onClick={() => onToggleStar(file.id)}
                          className="p-1.5 hover:bg-gray-100 rounded transition-colors cursor-pointer"
                        >
                          {file.starred ? (
                            <>
                              <StarFilled
                                className="text-yellow-500"
                                style={{ color: "oklch(79.5% 0.184 86.047)" }}
                              />
                            </>
                          ) : (
                            <StarOutlined className="text-gray-400 hover:text-yellow-500" />
                          )}
                        </button>
                      )}
                      <Dropdown
                        menu={{
                          items: [
                            {
                              key: "1",
                              label: (
                                <div
                                  className=" flex gap-1 items-center"
                                  onClick={() => reName(file)}
                                >
                                  <UndoOutlined />
                                  重命名
                                </div>
                              ),
                            },
                            {
                              key: "2",
                              label: (
                                <div
                                  className="text-red-500 flex gap-1 items-center"
                                  onClick={deleteFile(file)}
                                >
                                  <DeleteOutlined />
                                  删除
                                </div>
                              ),
                            },
                          ],
                        }}
                        placement="bottomRight"
                      >
                        <button className="p-1.5 hover:bg-gray-100 rounded transition-colors cursor-pointer">
                          <span className="text-gray-400 ">•••</span>
                        </button>
                      </Dropdown>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4}>
                  <div className="p-5">
                    <Empty />
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <>
      {files.length > 0 ? (
        <GridView
          files={files}
          onFolderClick={onFolderClick}
          onFileClick={onFileClick}
          onToggleStar={onToggleStar}
        />
      ) : (
        <div className="flex justify-center items-center w-full h-20 mt-10">
          <Empty />
        </div>
      )}
    </>
  );
};
export default FileList;

const GridView = ({ files, onFolderClick, onFileClick, onToggleStar }) => {
  return (
    <div className="flex flex-wrap gap-4">
      {files.map((file) => (
        <div
          key={file.id}
          onClick={() =>
            file.isFolder
              ? onFolderClick(file.title, file.id)
              : onFileClick(file)
          }
          className={`bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer `}
        >
          <div className="flex items-start justify-between mb-2">
            {file.isFolder ? (
              <FolderOutlined
                className=" text-xl"
                style={{ color: "oklch(79.5% 0.184 86.047)" }}
              />
            ) : (
              <FileOutlined
                className=" text-xl"
                style={{ color: "oklch(62.3% 0.214 259.815)" }}
              />
            )}
            {!file.isFolder && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStar(file.id);
                }}
                className="p-1 hover:bg-gray-100 rounded cursor-pointer"
              >
                {file.starred ? (
                  <StarFilled
                    className="text-yellow-500"
                    style={{ color: "oklch(79.5% 0.184 86.047)" }}
                  />
                ) : (
                  <StarOutlined className="text-gray-400 hover:text-yellow-500" />
                )}
              </button>
            )}
          </div>
          <h3 className="font-medium text-gray-800 truncate mb-1">
            {file.title}
          </h3>
          <p className="text-xs text-gray-500">
            {file.isFolder ? null : file.size} ·{" "}
            {formatDateByTimestamp(+file.updated)}
          </p>
        </div>
      ))}
    </div>
  );
};
