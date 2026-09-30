import React from "react";
import { Button, Modal } from "antd";
import { AliwangwangOutlined } from "@ant-design/icons";
import { XMarkdown } from "@ant-design/x-markdown";

interface ResumeModalProps {
  isOpen: boolean;
  pendingResponse: {
    content: string;
    timestamp: number;
  } | null;
  onDiscard: () => void;
  onResume: () => void;
}

const ResumeModal: React.FC<ResumeModalProps> = ({
  isOpen,
  pendingResponse,
  onDiscard,
  onResume,
}) => {
  return (
    <Modal
      title="恢复未完成的回复"
      open={isOpen}
      footer={[
        <Button key="discard" onClick={onDiscard}>
          放弃
        </Button>,
        <Button key="resume" type="primary" onClick={onResume}>
          <AliwangwangOutlined /> 继续回复
        </Button>,
      ]}
    >
      <p>检测到您上次有未完成的AI回复，是否继续？</p>
      <div className="mt-3 p-3 bg-gray-50 rounded-lg max-h-40 overflow-auto">
        <p className="text-sm text-gray-600">上次已收到的内容：</p>
        <XMarkdown content={pendingResponse?.content || ""} />
      </div>
    </Modal>
  );
};

export default ResumeModal;