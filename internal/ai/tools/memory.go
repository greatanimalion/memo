package tools

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"memo/internal/config"
	"memo/internal/db"
)

// 记忆（memory）管理工具：写入正文、读取正文、重命名、收藏/取消收藏。
// 与 search.go 的 get_memory（搜索/列出）配合使用：先列出拿到 id，
// 再用这里的工具读写具体记忆。

// maxMemoryContentChars 限制单次读取返回的正文长度（按字符计），
// 避免超长正文挤占模型上下文。
const maxMemoryContentChars = 8000

type writeMemoryArgs struct {
	ID      string `json:"id,omitempty" jsonschema:"description=要写入的记忆 ID；省略时按 title 新建一条记忆"`
	Title   string `json:"title,omitempty" jsonschema:"description=记忆标题，新建时必填，写入已有记忆时忽略"`
	Content string `json:"content" jsonschema:"description=要写入的正文内容"`
}

type readMemoryArgs struct {
	ID string `json:"id" jsonschema:"description=要读取的记忆 ID"`
}

type renameMemoryArgs struct {
	ID    string `json:"id" jsonschema:"description=要重命名的记忆 ID"`
	Title string `json:"title" jsonschema:"description=新的记忆标题"`
}

type starMemoryArgs struct {
	ID      string `json:"id" jsonschema:"description=要操作的记忆 ID"`
	Starred bool   `json:"starred" jsonschema:"description=true 表示收藏，false 表示取消收藏"`
}

func writeMemoryTool() (*Tool, error) {
	return NewTool[writeMemoryArgs]("write_memory", "写入记忆正文：指定 id 时覆盖该记忆的正文，省略 id 时按 title 新建一条记忆",
		func(_ context.Context, args writeMemoryArgs) (string, error) {
			return writeMemory(args)
		})
}

func readMemoryTool() (*Tool, error) {
	return NewTool[readMemoryArgs]("read_memory", "读取指定记忆的标题与正文内容",
		func(_ context.Context, args readMemoryArgs) (string, error) {
			return readMemory(args)
		})
}

func renameMemoryTool() (*Tool, error) {
	return NewTool[renameMemoryArgs]("rename_memory", "修改指定记忆的标题",
		func(_ context.Context, args renameMemoryArgs) (string, error) {
			return renameMemory(args)
		})
}

func starMemoryTool() (*Tool, error) {
	return NewTool[starMemoryArgs]("star_memory", "收藏或取消收藏指定记忆",
		func(_ context.Context, args starMemoryArgs) (string, error) {
			return starMemory(args)
		})
}

// writeMemory 写入正文：有 id 时写入已有记忆，否则新建记忆。
func writeMemory(args writeMemoryArgs) (string, error) {
	content := args.Content
	if strings.TrimSpace(content) == "" {
		return "", errors.New("content: required")
	}
	id := strings.TrimSpace(args.ID)
	if id == "" {
		return createMemoryWithContent(args.Title, content)
	}
	return writeMemoryContent(id, content)
}

// createMemoryWithContent 按标题新建记忆并写入正文。
func createMemoryWithContent(title, content string) (string, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return "", errors.New("title: required when creating a new memory")
	}

	fileURL, size, err := createMemoFile(content)
	if err != nil {
		return "", err
	}
	now := time.Now().UnixMilli()
	memory := &db.Memory{
		ID:      db.NewID(),
		Title:   title,
		FileURL: &fileURL,
		Created: now,
		Updated: now,
		Size:    &size,
	}
	if err := db.CreateMemory(memory); err != nil {
		return "", err
	}
	return fmt.Sprintf("已创建记忆「%s」（id: %s，共 %d 字节）", memory.Title, memory.ID, size), nil
}

// writeMemoryContent 把正文写入已有记忆；记忆缺少正文文件时补建一个。
func writeMemoryContent(id, content string) (string, error) {
	memory, err := db.GetMemory(id)
	if err != nil {
		return "", err
	}
	if memory == nil {
		return fmt.Sprintf("未找到 id 为 %s 的记忆，未做任何修改", id), nil
	}
	if memory.IsFolder.Bool() {
		return fmt.Sprintf("记忆 %s 是文件夹，不能写入正文", id), nil
	}

	if memory.FileURL == nil || strings.TrimSpace(*memory.FileURL) == "" {
		fileURL, size, err := createMemoFile(content)
		if err != nil {
			return "", err
		}
		if _, err := db.UpdateMemory(id, map[string]any{
			"fileUrl": fileURL,
			"size":    size,
			"updated": time.Now().UnixMilli(),
		}); err != nil {
			return "", err
		}
		return fmt.Sprintf("已为记忆「%s」创建正文文件并写入内容（共 %d 字节）", memory.Title, size), nil
	}

	size, err := writeMemoFile(*memory.FileURL, content)
	if err != nil {
		return "", err
	}
	if _, err := db.UpdateMemory(id, map[string]any{
		"size":    size,
		"updated": time.Now().UnixMilli(),
	}); err != nil {
		return "", err
	}
	return fmt.Sprintf("已写入记忆「%s」（共 %d 字节）", memory.Title, size), nil
}

// readMemory 读取记忆的标题与正文。
func readMemory(args readMemoryArgs) (string, error) {
	id := strings.TrimSpace(args.ID)
	if id == "" {
		return "", errors.New("id: required")
	}

	memory, err := db.GetMemory(id)
	if err != nil {
		return "", err
	}
	if memory == nil {
		return fmt.Sprintf("未找到 id 为 %s 的记忆", id), nil
	}

	header := fmt.Sprintf("标题：%s（id: %s）", memory.Title, memory.ID)
	if memory.FileURL == nil || strings.TrimSpace(*memory.FileURL) == "" {
		return header + "\n该记忆没有正文文件", nil
	}

	raw, err := os.ReadFile(memoFilePath(*memory.FileURL))
	if err != nil {
		if os.IsNotExist(err) {
			return header + "\n正文文件不存在", nil
		}
		return "", err
	}

	content := string(raw)
	if runes := []rune(content); len(runes) > maxMemoryContentChars {
		content = string(runes[:maxMemoryContentChars]) + "\n……（内容过长已截断）"
	}
	if content == "" {
		content = "（正文为空）"
	}
	return header + "\n\n" + content, nil
}

// renameMemory 修改记忆标题。
func renameMemory(args renameMemoryArgs) (string, error) {
	id := strings.TrimSpace(args.ID)
	title := strings.TrimSpace(args.Title)
	if id == "" {
		return "", errors.New("id: required")
	}
	if title == "" {
		return "", errors.New("title: required")
	}

	ok, err := db.UpdateMemory(id, map[string]any{
		"title":   title,
		"updated": time.Now().UnixMilli(),
	})
	if err != nil {
		return "", err
	}
	if !ok {
		return fmt.Sprintf("未找到 id 为 %s 的记忆，未做任何修改", id), nil
	}
	return fmt.Sprintf("已将记忆 %s 重命名为「%s」", id, title), nil
}

// starMemory 收藏或取消收藏记忆。
func starMemory(args starMemoryArgs) (string, error) {
	id := strings.TrimSpace(args.ID)
	if id == "" {
		return "", errors.New("id: required")
	}

	starred := 0
	if args.Starred {
		starred = 1
	}
	ok, err := db.UpdateMemory(id, map[string]any{"starred": starred})
	if err != nil {
		return "", err
	}
	if !ok {
		return fmt.Sprintf("未找到 id 为 %s 的记忆，未做任何修改", id), nil
	}
	if args.Starred {
		return fmt.Sprintf("已收藏记忆 %s", id), nil
	}
	return fmt.Sprintf("已取消收藏记忆 %s", id), nil
}

// ──────────────────── 正文文件读写（与 server 的 memo 文件布局保持一致） ────────────────────

// createMemoFile 新建正文文件并返回其对外 URL 与大小。
func createMemoFile(content string) (string, int64, error) {
	now := time.Now()
	dir := filepath.Join(config.FilesDir(),
		strconv.Itoa(now.Year()), fmt.Sprintf("%02d", int(now.Month())), fmt.Sprintf("%02d", now.Day()))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", 0, err
	}
	full := filepath.Join(dir, fmt.Sprintf("memo-%d.html", now.UnixMilli()))
	if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
		return "", 0, err
	}
	rel, err := filepath.Rel(config.FilesDir(), full)
	if err != nil {
		return "", 0, err
	}
	return "/uploads/files/" + filepath.ToSlash(rel), int64(len(content)), nil
}

// writeMemoFile 覆盖写入已有正文文件，返回写入后的大小。
func writeMemoFile(fileURL, content string) (int64, error) {
	full := memoFilePath(fileURL)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return 0, err
	}
	if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
		return 0, err
	}
	info, err := os.Stat(full)
	if err != nil {
		return 0, err
	}
	return info.Size(), nil
}

// memoFilePath 把正文文件 URL 还原为磁盘路径。
func memoFilePath(fileURL string) string {
	rel := strings.TrimPrefix(fileURL, "/uploads/files/")
	return filepath.Join(config.FilesDir(), filepath.FromSlash(rel))
}
