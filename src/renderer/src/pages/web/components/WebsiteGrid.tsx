import React from "react";
import { Button, Dropdown, Empty } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, GlobalOutlined } from "@ant-design/icons";

// 图标类型定义
interface webType {
  name: string;
  url: string;
  iconType: "emoji" | "image";
  emoji?: string;
  imageUrl?: string;
  imageType?: "url" | "base64";
}

interface WebsiteGridProps {
  websites: webType[];
  onAdd: () => void;
  onEdit: (website: webType) => void;
  onDelete: (name: string) => void;
  onVisit: (url: string) => void;
}

const WebsiteGrid: React.FC<WebsiteGridProps> = ({
  websites,
  onAdd,
  onEdit,
  onDelete,
  onVisit,
}) => {
  const renderIcon = (icon: webType) => {
    if (icon.iconType === "emoji" && icon.emoji) {
      return (
        <div className="w-12 h-12 flex items-center justify-center text-3xl rounded-xl">
          {icon.emoji}
        </div>
      );
    }

    if (icon.imageUrl) {
      return (
        <img
          src={icon.imageUrl}
          alt={icon.name}
          className="w-12 h-12 rounded-xl bg-white"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='80'>🌐</text></svg>`;
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
    <div className="rounded-2xl p-6 shadow-lg" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="">
        {websites.length > 0 ? (
          <div className="flex flex-wrap gap-4">
            {websites.map((w, i) => (
              <div
                key={i}
                className="hover:-translate-y-2 duration-200 flex flex-col items-center gap-2 p-4 rounded-2xl cursor-pointer relative"
              >
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: "1",
                        label: (
                          <div
                            className="flex gap-1 items-center"
                            onClick={() => onEdit(w)}
                          >
                            <EditOutlined />
                            编辑
                          </div>
                        ),
                      },
                      {
                        key: "2",
                        label: (
                          <div
                            className="text-red-500 flex gap-1 items-center"
                            onClick={() => onDelete(w.name)}
                          >
                            <DeleteOutlined />
                            删除
                          </div>
                        ),
                      },
                    ],
                  }}
                  placement="top"
                >
                  <span
                    rel="noopener noreferrer"
                    className="flex flex-col items-center gap-2 no-underline"
                    onClick={() => onVisit(w.url)}
                  >
                    {renderIcon(w)}
                    <span className="text-sm text-center max-w-full truncate" style={{ color: "var(--text-secondary)" }}>
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
              <span className="text-gray-500">
                还没有添加任何图标，点击右上角添加
              </span>
            }
            className="py-12"
          >
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={onAdd}
            >
              添加图标
            </Button>
          </Empty>
        )}
      </div>
    </div>
  );
};

export default WebsiteGrid;