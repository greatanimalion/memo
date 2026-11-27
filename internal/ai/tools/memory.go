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
	"memo/internal/jsonx"
)

// 记忆（memory）管理工具：写入正文、读取正文、重命名、收藏/取消收藏。
// 与 search.go 的 get_memory（搜索/列出）配合使用：先列出拿到 id，

// maxMemoryContentChars 限制单次读取返回的正文长度（按字符计），
// 避免超长正文挤占模型上下文。
const maxMemoryContentChars = 8000

type writeMemoryArgs struct {
	ID       string     `json:"id,omitempty" jsonschema:"description=要写入的记忆 ID；省略时按 title 新建一条记忆"`
	Title    string     `json:"title,omitempty" jsonschema:"description=记忆标题，新建时必填，写入已有记忆时忽略"`
	ParentID string     `json:"parentId,omitempty" jsonschema:"description=父节点 ID；省略时默认写入根目录 root"`
	IsFolder jsonx.Flag `json:"isFolder,omitempty" jsonschema:"description=新建时是否创建文件夹：0（默认）表示文件，1 表示文件夹"`
	Content  string     `json:"content,omitempty" jsonschema:"description=要写入的正文内容；新建文件时必填，新建文件夹时可省略"`
}

type readMemoryArgs struct {
	ID string `json:"id" jsonschema:"description=要读取的记忆 ID"`
}

type findMemoryArgs struct {
	Title string `json:"title" jsonschema:"description=记忆标题关键词，支持模糊匹配（例如用户说“财报”可匹配标题包含“财报”的记忆）"`
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
	return NewTool[writeMemoryArgs]("write_memory", "写入记忆正文：指定 id 时覆盖该记忆的正文；省略 id 时按 title 新建，isFolder=1 创建文件夹，否则创建文件并写入正文",
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

func findMemoryByTitleTool() (*Tool, error) {
	return NewTool[findMemoryArgs]("find_memory_by_title", "按标题模糊查找记忆并返回其 id；拿到 id 后可再用 write_memory/read_memory 按 id 操作",
		func(_ context.Context, args findMemoryArgs) (string, error) {
			return findMemoryByTitle(args)
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

// writeMemory 写入正文：有 id 时写入已有记忆，否则按 isFolder 新建文件或文件夹。
func writeMemory(args writeMemoryArgs) (string, error) {
	id := strings.TrimSpace(args.ID)
	if id == "" {
		// 新建走 createMemoryWithContent：文件夹不要求正文，文件必须有正文
		return createMemoryWithContent(args.Title, args.ParentID, args.IsFolder, args.Content)
	}

	// 写入已有记忆仅针对文件，正文必填
	content := args.Content
	if strings.TrimSpace(content) == "" {
		return "", errors.New("content: required")
	}
	return writeMemoryContent(id, content)
}

// createMemoryWithContent 按标题新建记忆：isFolder 为 0 创建文件并写入正文，
// 为 1 创建文件夹（不创建正文文件）。
func createMemoryWithContent(title, parentID string, isFolder jsonx.Flag, content string) (string, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return "", errors.New("title: required when creating a new memory")
	}

	// 创建记忆必须带 parentId：未指定时默认挂到根目录 root，
	// 否则写进空 parentId 后在文件树中不可见
	parentID = strings.TrimSpace(parentID)
	if parentID == "" {
		parentID = "root"
	}
	now := time.Now().UnixMilli()

	// 文件夹没有正文文件，直接创建记录
	if isFolder.Bool() {
		memory := &db.Memory{
			Title:    title,
			IsFolder: isFolder,
			ParentID: &parentID,
			Created:  now,
			Updated:  now,
		}
		if err := db.CreateMemory(memory); err != nil {
			return "", err
		}
		return fmt.Sprintf("已创建文件夹「%s」（id: %s）", memory.Title, memory.ID), nil
	}

	// 文件必须有正文
	if strings.TrimSpace(content) == "" {
		return "", errors.New("content: required when creating a file")
	}

	fileURL, size, err := createMemoFile(content)
	if err != nil {
		return "", err
	}
	memory := &db.Memory{
		Title:    title,
		IsFolder: isFolder,
		FileURL:  &fileURL,
		ParentID: &parentID,
		Created:  now,
		Updated:  now,
		Size:     &size,
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

// findMemoryByTitle 按标题做不区分大小写的模糊匹配，返回匹配记忆的 id。
// 完全匹配优先；文件夹不能写入正文，直接跳过。
func findMemoryByTitle(args findMemoryArgs) (string, error) {
	title := strings.TrimSpace(args.Title)
	if title == "" {
		return "", errors.New("title: required")
	}

	// 模糊查询走数据库 LIKE（完全匹配优先、其余按更新时间倒序），
	// 多取一些后再剔除文件夹，保证可用结果足够
	found, err := db.SearchMemoriesByTitle(title, 20)
	if err != nil {
		return "", err
	}
	matches := make([]db.Memory, 0, len(found))
	exact := make([]db.Memory, 0, 2)
	for _, m := range found {
		// 文件夹不能写入正文，跳过
		if m.IsFolder.Bool() {
			continue
		}
		matches = append(matches, m)
		if strings.EqualFold(strings.TrimSpace(m.Title), title) {
			exact = append(exact, m)
		}
	}

	if len(exact) > 0 {
		return "找到标题完全匹配的记忆，可直接使用其 id 调用 write_memory/read_memory：\n" +
			formatMemories(exact), nil
	}
	if len(matches) == 0 {
		return fmt.Sprintf("未找到标题包含「%s」的记忆；如需新建，可省略 id 调用 write_memory 并按 title 新建", title), nil
	}

	total := len(matches)
	if len(matches) > 10 {
		matches = matches[:10]
	}
	return fmt.Sprintf("找到 %d 条标题包含「%s」的记忆，请确认目标后用其 id 调用 write_memory：\n%s",
		total, title, formatMemories(matches)), nil
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
