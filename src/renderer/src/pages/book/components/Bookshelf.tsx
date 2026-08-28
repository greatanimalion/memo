import React, { useEffect, useState, useRef } from 'react';
import { Button, Empty, Spin, Popconfirm, Modal, Input, message, Tag } from 'antd';
import {
  PlusOutlined,
  BookOutlined,
  EditOutlined,
  DeleteOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getBooks, getBookDetail, createBook, deleteBook, updateBook } from '@renderer/services/book';
import { uploadImage, deleteFile } from '@renderer/services/memeoy';
import { Book, BookDetail } from '@type/book';
import { generateUUID } from '@renderer/utils/helper';
import { getLocalUrl } from '@renderer/utils';
import {formatRelativeTime as relativeTime} from '@renderer/utils/dateUtils'


const Bookshelf: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [bookTitle, setBookTitle] = useState('');
  const [bookAuthor, setBookAuthor] = useState('');

  // 编辑弹窗状态
  const [editOpen, setEditOpen] = useState(false);
  const [editBook, setEditBook] = useState<BookDetail | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCover, setEditCover] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editDescription, setEditDescription] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [editTotalWords, setEditTotalWords] = useState(0);
  const [editSaving, setEditSaving] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
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
    setBookAuthor('');
    setModalOpen(true);
  };

  const handleConfirmCreate = async () => {
    const title = bookTitle.trim();
    if (!title) {
      message.error('请输入作品名称');
      return;
    }

    try {
      const newBook: Book = {
        id: generateUUID(),
        title,
        author: bookAuthor.trim() || '佚名',
        cover: '',
        tags: [],
        settings: { maxChapterWords: 20000, wordCountMode: 'all' },
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
      const book = books.find((b) => b.id === id);
      if (book?.cover) {
        deleteFile(book.cover);
      }
      await deleteBook(id);
      message.success('已删除');
      loadBooks();
    } catch {
      message.error('删除失败');
    }
  };

  const handleOpenEdit = async (book: Book, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const detail = await getBookDetail(book.id);
      setEditBook(detail);
      setEditTitle(detail.title);
      setEditCover(detail.cover || '');
      setEditTags([...(detail.tags || [])]);
      setEditDescription(detail.description || '');
      setEditTotalWords(detail.chapters?.reduce((sum, c) => sum + (c.wordCount || 0), 0) || 0);
      setEditOpen(true);
    } catch {
      message.error('加载书籍信息失败');
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const oldCover = editCover;
      const { url } = await uploadImage(file);
      setEditCover(url);
      if (oldCover) {
        deleteFile(oldCover);
      }
    } catch {
      message.error('封面上传失败');
    }
    e.target.value = '';
  };

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (!tag) return;
    if (editTags.includes(tag)) {
      message.warning('标签已存在');
      return;
    }
    setEditTags([...editTags, tag]);
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    setEditTags(editTags.filter((t) => t !== tag));
  };

  const handleSaveEdit = async () => {
    if (!editBook) return;
    const title = editTitle.trim();
    if (!title) {
      message.error('书名不能为空');
      return;
    }
    setEditSaving(true);
    try {
      await updateBook(editBook.id, {
        title,
        cover: editCover,
        tags: editTags,
        description: editDescription,
      });
      message.success('保存成功');
      setEditOpen(false);
      loadBooks();
    } catch {
      message.error('保存失败');
    } finally {
      setEditSaving(false);
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
                className="group cursor-pointer rounded-xl border border-theme-light transition-all duration-200 overflow-hidden"
                style={{
                  boxShadow: "var(--shadow-lg)",
                }}
              >
                {/* 封面区域 */}
                <div className="h-40 bg-linear-to-br from-accent/20 to-accent/5 flex items-center justify-center relative overflow-hidden">
                  {book.cover ? (
                    <img src={getLocalUrl(book.cover)} alt={book.title} className="w-full h-full object-cover" />
                  ) : (
                    <BookOutlined className="text-4xl text-accent/40" />
                  )}
                  {/* 操作按钮 */}
                  <div className="absolute inset-0 bg-theme-primary/80 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
                    <Button
                      type="primary"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={(e) => handleOpenEdit(book, e)}
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
                    <span>{relativeTime(book.updatedAt! || book.createdAt!)}</span>
                  </div>
                </div>
              </div>
            ))}

            {/* 新建卡片 */}
            <div
              onClick={handleOpenCreateModal}
              className="h-62 cursor-pointer rounded-xl border-2 border-dashed border-theme-light hover:border-accent bg-theme-secondary/30 hover:bg-theme-hover transition-all duration-200 flex flex-col items-center justify-center min-h-0"
            >
              <PlusOutlined className="text-3xl text-theme-muted mb-2" />
              <span className="text-sm text-theme-muted">新建作品</span>
            </div>
          </div>
        )}
      </div>

      {/* 新建作品弹窗 */}
      <Modal
        title="新建作品"
        open={modalOpen}
        onOk={handleConfirmCreate}
        onCancel={() => setModalOpen(false)}
        okText="创建"
        cancelText="取消"
        destroyOnHidden
      >
        <div className="flex flex-col gap-3">
          <div>
            <div className="text-xs text-theme-muted mb-1">作品名称</div>
            <Input
              placeholder="请输入书名"
              value={bookTitle}
              onChange={(e) => setBookTitle(e.target.value)}
              onPressEnter={handleConfirmCreate}
              autoFocus
            />
          </div>
          <div>
            <div className="text-xs text-theme-muted mb-1">作者</div>
            <Input
              placeholder="请输入作者名（选填，默认佚名）"
              value={bookAuthor}
              onChange={(e) => setBookAuthor(e.target.value)}
              onPressEnter={handleConfirmCreate}
            />
          </div>
        </div>
      </Modal>

      {/* 编辑书籍详情弹窗 */}
      <Modal
        title="书籍详情"
        open={editOpen}
        onOk={handleSaveEdit}
        onCancel={() => setEditOpen(false)}
        okText="保存"
        cancelText="取消"
        confirmLoading={editSaving}
        width={520}
      >
        {editBook && (
          <div className="flex flex-col gap-4">
            {/* 封面 + 基本信息 */}
            <div className="flex items-start gap-4">
              <div
                className="w-24 h-32 rounded-lg overflow-hidden border border-theme-light bg-theme-secondary/50 flex items-center justify-center cursor-pointer hover:border-accent transition-colors shrink-0"
                onClick={() => coverInputRef.current?.click()}
              >
                {editCover ? (
                  <img src={getLocalUrl(editCover)} alt="封面" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-theme-muted">
                    <PlusOutlined className="text-xl" />
                    <span className="text-[10px]">上传封面</span>
                  </div>
                )}
              </div>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCoverUpload}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-theme-muted mb-1">书名</div>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="请输入书名"
                />
                <div className="text-xs text-theme-muted mt-3 mb-1">总字数</div>
                <div className="text-sm font-semibold text-accent">{editTotalWords.toLocaleString()} 字</div>
                <div className="text-xs text-theme-muted mt-3 mb-1">章节数</div>
                <div className="text-sm text-theme-primary">{editBook.chapters?.length || 0} 章 / {editBook.volumes?.length || 0} 卷</div>
              </div>
            </div>

            {/* 简介 */}
            <div>
              <div className="text-xs text-theme-muted mb-1">简介</div>
              <Input.TextArea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="请输入书籍简介"
                rows={3}
                className="resize-none"
              />
            </div>

            {/* 标签 */}
            <div>
              <div className="text-xs text-theme-muted mb-2">标签</div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {editTags.map((tag) => (
                  <Tag
                    key={tag}
                    closable
                    onClose={() => handleRemoveTag(tag)}
                    className="rounded-md"
                  >
                    {tag}
                  </Tag>
                ))}
                {editTags.length === 0 && (
                  <span className="text-xs text-theme-muted">暂无标签</span>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  size="small"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onPressEnter={handleAddTag}
                  placeholder="输入标签后回车"
                  className="flex-1"
                />
                <Button size="small" icon={<PlusOutlined />} onClick={handleAddTag}>
                  添加
                </Button>
              </div>
            </div>

            {/* 时间信息 */}
            <div className="flex gap-6 text-xs text-theme-muted pt-2 border-t border-theme-light">
              {editBook.createdAt && (
                <span>创建于 {relativeTime(editBook.createdAt)}</span>
              )}
              {editBook.updatedAt && (
                <span>更新于 {relativeTime(editBook.updatedAt)}</span>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Bookshelf;