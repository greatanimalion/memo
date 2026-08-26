import React from "react";
import { Modal, Form, Input, Button, Checkbox, Typography } from "antd";
import type { Dayjs } from "dayjs";

const { TextArea } = Input;
const { Title } = Typography;

interface DiaryModalProps {
  isOpen: boolean;
  selectedDate: Dayjs | null;
  form: any;
  onSave: () => void;
  onCancel: () => void;
}

const DiaryModal: React.FC<DiaryModalProps> = ({
  isOpen,
  selectedDate,
  form,
  onSave,
  onCancel,
}) => {
  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <Title level={4} style={{ margin: 0 }}>
            {selectedDate?.format("YYYY年MM月DD日")}
          </Title>
        </div>
      }
      open={isOpen}
      onOk={onSave}
      onCancel={onCancel}
      width={600}
      okText="保存"
      cancelText="取消"
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          todos: [],
          note: "",
        }}
      >
        <Form.Item label="待办事项">
          <Form.List name="todos">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <div key={key} className="flex items-center gap-2 mb-2">
                    <Form.Item
                      {...restField}
                      name={[name, "completed"]}
                      valuePropName="checked"
                      style={{ margin: 0 }}
                    >
                      <Checkbox />
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, "text"]}
                      style={{ flex: 1, margin: 0 }}
                    >
                      <Input placeholder="输入待办事项" />
                    </Form.Item>
                    <Button type="text" danger onClick={() => remove(name)}>
                      删除
                    </Button>
                  </div>
                ))}
                <Button
                  type="dashed"
                  onClick={() => add({ text: "", completed: false })}
                  block
                  icon={<span>+</span>}
                >
                  添加待办事项
                </Button>
              </>
            )}
          </Form.List>
        </Form.Item>
        <Form.Item label="日记笔记" name="note">
          <TextArea rows={6} placeholder="记录今天的想法和感受..." />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default DiaryModal;