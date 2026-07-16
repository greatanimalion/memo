import React, { useState } from 'react';
import { Calendar, Badge, Modal, Form, Input, Button, Empty, Checkbox, Typography } from 'antd';
import type { CalendarProps } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useDiary } from '@renderer/hooks/useDiary';
import Select from 'antd/es/select';
import { updateDiary } from '@renderer/services/diary';

const { TextArea } = Input;
const { Title } = Typography;

const DiaryPage: React.FC = () => {
  const {
    selectedDate,
    setSelectedDate,
    diaryData,
    stats,
    getDateData,
    setDiaryData,
    handleDateSelect,
    handleMonthChange,
  } = useDiary();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();
  // 日历单元格渲染
  const dateCellRender: CalendarProps<Dayjs>['cellRender'] = (value) => {
    const dateKey = value.format('YYYY-MM-DD');
    const data = getDateData(dateKey);
    const incompleteTodos = data.todos.filter(todo => !todo.completed).length;
    return (
      <div className="flex gap-1 items-center justify-center">
        {data.todos.length > 0 && (
          <Badge
            count={incompleteTodos}
            color={'#ef4444'}
            style={{
              fontSize: '10px',
              height: '16px',
              lineHeight: '16px',
              minWidth: '16px',
            }}
          />
        )}
        {data.note && <Badge dot color="#3b82f6" />}
      </div>
    );
  };

  // 点击日期处理
  const handleDateSelectWithModal: CalendarProps<Dayjs>['onSelect'] = (value) => {
    handleDateSelect(value);
    const dateKey = value.format('YYYY-MM-DD');
    const data = getDateData(dateKey);
    form.setFieldsValue({
      todos: data.todos.map(todo => ({ text: todo.text, completed: todo.completed })),
      note: data.note || '',
    });
    //@ts-ignore
    if (window.___NOTPOPEN) return
    setIsModalOpen(true);
  };

  // 自定义头部
  const headerRender: CalendarProps<Dayjs>['headerRender'] = ({ value, onChange }) => {
    const year = value.year();
    const month = value.month();

    const monthOptions = Array.from({ length: 12 }, (_, i) => ({
      label: `${i + 1}月`,
      value: i,
    }));

    const yearOptions = Array.from({ length: 21 }, (_, i) => ({
      label: `${year - 10 + i}年`,
      value: year - 10 + i,
    }));

    return (
      <div style={{ padding: '8px 0' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Select
              value={year}
              onChange={(newYear: number) => {
                //@ts-ignore
                window.___NOTPOPEN = true;
                const _Y = value.clone().year(newYear);
                onChange(_Y);
                handleMonthChange(_Y);
                //@ts-ignore
                window.___NOTPOPEN = false;

              }}
              options={yearOptions}
              style={{ width: 100 }}
              size="middle"
            />
            <Select
              value={month}
              onChange={(newMonth: number) => {
                //@ts-ignore
                window.___NOTPOPEN = true;
                const _m = value.clone().month(newMonth);
                onChange(_m);
                handleMonthChange(_m);
                //@ts-ignore
                window.___NOTPOPEN = false; 
              }}
              options={monthOptions}
              style={{ width: 90 }}
              size="middle"
            />
          </div>
          <Button
            type="primary"
            onClick={() => onChange(value.clone())}
          >
            今天
          </Button>
        </div>
      </div>
    );
  };

  // 保存待办事项
  const handleSave = () => {
    form.validateFields().then(async (values) => {
      if (selectedDate) {
        const dateKey = selectedDate.format('YYYY-MM-DD');
        const todos = values.todos.map((todo: any, index: number) => ({
          id: index + 1,
          text: todo.text,
          completed: todo.completed,
        })).filter(todo => todo.text.trim() !== '');

        let newDiary;
        if (!values.note && todos.length === 0) {
          newDiary = { ...diaryData };
          delete newDiary[dateKey];
        } else {
          newDiary = {
            ...diaryData,
            [dateKey]: {
              todos,
              note: values.note.trim() || '',
            },
          };
        }
        const monthKey = dateKey.substring(0, 7);
        updateDiary({
          id: monthKey,
          monthDiarys: newDiary,
        });
        setDiaryData(newDiary);
        setIsModalOpen(false);
      }
    });
  };

  return (
    <div className="flex-1 bg-gray-50 overflow-y-auto p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 页面标题 */}
        <div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">日记</h1>
          <p className="text-gray-500">记录每一天的待办事项和笔记</p>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-4 max-sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl p-5 shadow-lg">
            <div className="text-sm text-gray-500 mb-1">当天待办</div>
            <div className="text-3xl font-bold text-blue-600">{stats.todayTodos}</div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-lg">
            <div className="text-sm text-gray-500 mb-1">当月总待办数</div>
            <div className="text-3xl font-bold text-purple-600">{stats.totalTodos}</div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-lg">
            <div className="text-sm text-gray-500 mb-1">已完成</div>
            <div className="text-3xl font-bold text-green-600">{stats.completedTodos}</div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-lg">
            <div className="text-sm text-gray-500 mb-1">当月记录天数</div>
            <div className="text-3xl font-bold text-orange-600">{stats.daysWithTodos}</div>
          </div>
        </div>

        {/* 日历 */}
        <div className="bg-white rounded-2xl p-6 shadow-lg">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-gray-800">日历视图</h2>
            <p className="text-sm text-gray-500">点击日期查看或编辑待办事项</p>
          </div>
          <div>
            <Calendar
              fullscreen={false}
              cellRender={dateCellRender}
              onSelect={handleDateSelectWithModal}
              headerRender={headerRender}
            />
          </div>
        </div>

        {/* 待办事项列表 */}
        <div className="bg-white rounded-2xl p-6 shadow-lg">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-gray-800">本月待办概览</h2>
          </div>
          {Object.keys(diaryData).length === 0 ? (
            <Empty description="暂无待办事项，点击日历添加" />
          ) : (
            <div className="space-y-3">
              {Object.entries(diaryData)
                .sort((a, b) => b[0].localeCompare(a[0]))
                .slice(0, 10)
                .map(([dateKey, data]) => {
                  const incompleteTodos = data.todos.filter(t => !t.completed).length;
                  return (
                    <div
                      key={dateKey}
                      onClick={() => {
                        setSelectedDate(dayjs(dateKey));
                        form.setFieldsValue({
                          todos: data.todos.map(todo => ({ text: todo.text, completed: todo.completed })),
                          note: data.note || '',
                        });
                        setIsModalOpen(true);
                      }}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-sm font-medium text-blue-600">{dateKey}</div>
                        {incompleteTodos > 0 && (
                          <Badge
                            count={`${incompleteTodos} 待完成`}
                            style={{ backgroundColor: '#ef4444' }}
                          />
                        )}
                        {data.note && (
                          <Badge count="有笔记" color="blue" />
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        {data.todos.length > 0 && `${data.todos.filter(t => t.completed).length}/${data.todos.length} 已完成`}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* 编辑模态框 */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <Title level={4} style={{ margin: 0 }}>
              {selectedDate?.format('YYYY年MM月DD日')}
            </Title>
          </div>
        }
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => setIsModalOpen(false)}
        width={600}
        okText="保存"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            todos: [],
            note: '',
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
                        name={[name, 'completed']}
                        valuePropName="checked"
                        style={{ margin: 0 }}
                      >
                        <Checkbox />
                      </Form.Item>
                      <Form.Item
                        {...restField}
                        name={[name, 'text']}
                        style={{ flex: 1, margin: 0 }}
                      >
                        <Input placeholder="输入待办事项" />
                      </Form.Item>
                      <Button type="text" danger onClick={() => remove(name)}>
                        删除
                      </Button>
                    </div>
                  ))}
                  <Button type="dashed" onClick={() => add({ text: '', completed: false })} block icon={<span>+</span>}>
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
    </div>
  );
};

export default DiaryPage;
