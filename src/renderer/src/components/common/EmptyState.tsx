import { Empty, Button } from "antd";
import { PlusOutlined } from "@ant-design/icons";

interface EmptyStateProps {
  description?: string;
  actionText?: string;
  onAction?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  description = "暂无数据",
  actionText,
  onAction,
}) => {
  return (
    <div className="flex justify-center items-center w-full py-10">
      <Empty description={<span className="text-gray-500">{description}</span>}>
        {actionText && onAction && (
          <Button type="primary" icon={<PlusOutlined />} onClick={onAction}>
            {actionText}
          </Button>
        )}
      </Empty>
    </div>
  );
};

export default EmptyState;
