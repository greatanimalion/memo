import React, { useEffect, useState } from 'react';
import { Button, Empty, Spin, Popconfirm, Modal, Input, message } from 'antd';
import {
  PlusOutlined,
  BookOutlined,
  EditOutlined,
  DeleteOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getBooks, createBook, deleteBook } from '@renderer/services/book';
import { Book } from '@type/book';
import { generateUUID } from '@renderer/utils/helper';

const Bookshelf: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [bookTitle, setBookTitle] = useState('未命名作品');
  const navigate = useNavigate();

  const loadBooks = async () => {
    try {
      setLoading(true);
      const data = await getBooks();
      setBooks(data);
    } catch {
      message.error('加载书架失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBooks();
  }, []);

  const handleOpenCreateModal = () => {
    setBookTitle('');
    setModalOpen(true);
  };

  const handleConfirmCreate = async () => {
    const title = bookTitle.trim();
    if(!title)return message.error('请输入作品名称')
    try {
      const newBook: Book = {
        id: generateUUID(),
        title,
        author: '佚名',
        cover: '',
        tags: [],
        settings: { maxChapterWords: 20000, wordCountMode: 'chinese' },
      };
      const created = await createBook(newBook);
      message.success('创建成功');
      setModalOpen(false);
      navigate(`/book?id=${created.id}`);
    } catch {
      message.error('创建失败');
    }
  };

  const handleOpenBook = (id: string) => {
    navigate(`/book?id=${id}`);
  };

  const handleDeleteBook = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await deleteBook(id);
      message.success('已删除');
      loadBooks();
    } catch {
      message.error('删除失败');
    }
  };

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-theme-primary">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-theme-primary">
      {/* 顶部标题栏 */}
      <div className="px-6 py-4 border-b border-theme-light flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOutlined className="text-accent text-lg" />
          <span className="text-lg font-bold text-theme-primary">我的书架</span>
          <span className="text-sm text-theme-muted">({books.length} 本)</span>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleOpenCreateModal}
          className="rounded-lg"
        >
          新建作品
        </Button>
      </div>

      {/* 书籍列表 */}
      <div className="flex-1 overflow-y-auto p-6">
        {books.length === 0 ? (
          <Empty
            description={<span className="text-theme-muted">还没有作品，开始创作吧</span>}
            className="mt-20"
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreateModal}>
              创建第一本作品
            </Button>
          </Empty>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
            {books.map((book) => (
              <div
                key={book.id}
                onClick={() => handleOpenBook(book.id)}
                className="group  cursor-pointer rounded-xl border border-theme-light bg-theme-secondary/50 hover:bg-theme-hover hover:border-accent transition-all duration-200 overflow-hidden"
              >
                {/* 封面区域 */}
                <div className="h-40 bg-linear-to-br from-accent/20 to-accent/5 flex items-center justify-center relative overflow-hidden">
                  {book.cover ? (
                    <img src={book.cover} alt={book.title} className="w-full h-full object-cover" />
                  ) : (
                    <BookOutlined className="text-4xl text-accent/40" />
                  )}
                  {/* 操作按钮 */}
                  <div className="absolute inset-0 bg-theme-primary/80 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
                    <Button
                      type="primary"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={(e) => { e.stopPropagation(); handleOpenBook(book.id); }}
                      className="rounded-lg"
                    >
                      编辑
                    </Button>
                    <Popconfirm
                      title="确认删除这部作品？"
                      onConfirm={(e) => handleDeleteBook(book.id, e as any)}
                      onCancel={(e) => e?.stopPropagation()}
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                    >
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-lg"
                      >
                        删除
                      </Button>
                    </Popconfirm>
                  </div>
                </div>

                {/* 信息区域 */}
                <div className="p-3">
                  <div className="text-sm font-semibold text-theme-primary truncate mb-1">
                    {book.title}
                  </div>
                  <div className="text-xs text-theme-muted truncate mb-2">
                    {book.author}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-theme-muted">
                    <ClockCircleOutlined />
                    <span>点击查看</span>
                  </div>
                </div>
              </div>
            ))}

            {/* 新建卡片 */}
            <div
              onClick={handleOpenCreateModal}
              className="h-62 cursor-pointer rounded-xl border-2 border-dashed border-theme-light hover:border-accent bg-theme-secondary/30 hover:bg-theme-hover transition-all duration-200 flex flex-col items-center justify-center   min-h-0"
            >
              <PlusOutlined className="text-3xl text-theme-muted mb-2" />
              <span className="text-sm text-theme-muted">新建作品</span>
            </div>
          </div>
        )}
      </div>

      <Modal
        title="新建作品"
        open={modalOpen}
        onOk={handleConfirmCreate}
        onCancel={() => setModalOpen(false)}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <p className="mb-2">请输入作品名称：</p>
        <Input
          placeholder="请输入书名"
          value={bookTitle}
          onChange={(e) => setBookTitle(e.target.value)}
          onPressEnter={handleConfirmCreate}
          autoFocus
        />
      </Modal>
    </div>
  );
};

export default Bookshelf;