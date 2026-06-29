import { Modal } from "antd";

interface ConfirmDeleteModalProps {
  title: string;
  description?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

const ConfirmDeleteModal = {
  confirm: ({
    title,
    description,
    onConfirm,
    onCancel,
  }: ConfirmDeleteModalProps) => {
    Modal.confirm({
      title: `确认删除: ${title}`,
      content: description || "确定要删除吗？此操作不可恢复。",
      okText: "确认",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: onConfirm,
      onCancel,
    });
  },
};

export default ConfirmDeleteModal;
