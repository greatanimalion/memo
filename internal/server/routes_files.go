package server

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"memo/internal/config"
	"memo/internal/response"
)

var allowedUploadTypes = map[string]bool{
	"image/jpeg":    true,
	"image/jpg":     true,
	"image/png":     true,
	"image/gif":     true,
	"image/svg+xml": true,
	"image/webp":    true,
	"audio/mpeg":    true,
	"audio/wav":     true,
	"audio/ogg":     true,
	"audio/aac":     true,
	"audio/midi":    true,
	"video/mp4":     true,
}

func serveUploads(w http.ResponseWriter, r *http.Request) {
	http.StripPrefix("/uploads/", http.FileServer(http.Dir(config.UploadDir()))).ServeHTTP(w, r)
}

func uploadFile(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(50 << 20); err != nil {
		response.Raw(w, http.StatusBadRequest, map[string]any{"error": "No file uploaded"})
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		response.Raw(w, http.StatusBadRequest, map[string]any{"error": "No file uploaded"})
		return
	}
	defer file.Close()

	if header.Size > 50*1024*1024 {
		response.Raw(w, http.StatusBadRequest, map[string]any{"error": "只允许上传图片、音频、视频格式文件"})
		return
	}
	if !allowedUploadTypes[header.Header.Get("Content-Type")] {
		response.Raw(w, http.StatusBadRequest, map[string]any{"error": "只允许上传图片、音频、视频格式文件"})
		return
	}

	now := time.Now()
	dateDir := filepath.Join(config.ImagesDir(),
		strconv.Itoa(now.Year()), fmt.Sprintf("%02d", int(now.Month())), fmt.Sprintf("%02d", now.Day()))
	if err := os.MkdirAll(dateDir, 0o755); err != nil {
		response.Raw(w, http.StatusInternalServerError, map[string]any{"error": "Failed to save file"})
		return
	}

	suffix := fmt.Sprintf("%d-%d", now.UnixMilli(), randomInt(1e9))
	filename := "file-" + suffix + filepath.Ext(header.Filename)
	fullPath := filepath.Join(dateDir, filename)

	dst, err := os.Create(fullPath)
	if err != nil {
		response.Raw(w, http.StatusInternalServerError, map[string]any{"error": "Failed to save file"})
		return
	}
	defer dst.Close()
	if _, err := io.Copy(dst, file); err != nil {
		response.Raw(w, http.StatusInternalServerError, map[string]any{"error": "Failed to save file"})
		return
	}

	rel, err := filepath.Rel(config.UploadDir(), fullPath)
	if err != nil {
		response.Raw(w, http.StatusInternalServerError, map[string]any{"error": "Failed to save file"})
		return
	}
	response.Success(w, map[string]any{
		"url":          "/uploads/" + filepath.ToSlash(rel),
		"filename":     filename,
		"originalname": header.Filename,
	}, "File uploaded successfully")
}

func deleteFile(w http.ResponseWriter, r *http.Request) {
	var body struct {
		FilePath string `json:"filePath"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.FilePath == "" {
		response.Raw(w, http.StatusBadRequest, map[string]any{"code": 400, "error": "File path is required"})
		return
	}

	fullPath := filepath.Join(config.UploadDir(), filepath.FromSlash(body.FilePath))
	if _, err := os.Stat(fullPath); err != nil {
		response.Raw(w, http.StatusNotFound, map[string]any{"code": 404, "error": "File not found"})
		return
	}
	if err := os.Remove(fullPath); err != nil {
		response.Raw(w, http.StatusInternalServerError, map[string]any{"code": 500, "error": "Failed to delete file"})
		return
	}

	files, err := walkUploads(config.UploadDir())
	if err != nil {
		response.Raw(w, http.StatusInternalServerError, map[string]any{"code": 500, "error": "Failed to delete file"})
		return
	}
	response.Success(w, files, "File deleted successfully")
}

func memorySize(w http.ResponseWriter, r *http.Request) {
	size := int64(0)
	if info, err := os.Stat(config.DBPath()); err == nil {
		size = info.Size()
	}
	response.Success(w, size, "success")
}

type uploadedFile struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

func walkUploads(dir string) ([]uploadedFile, error) {
	files := []uploadedFile{}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return files, err
	}
	for _, entry := range entries {
		full := filepath.Join(dir, entry.Name())
		if entry.IsDir() {
			sub, subErr := walkUploads(full)
			if subErr != nil {
				return files, subErr
			}
			files = append(files, sub...)
			continue
		}
		rel, relErr := filepath.Rel(dir, full)
		if relErr != nil {
			continue
		}
		files = append(files, uploadedFile{Name: entry.Name(), Path: filepath.ToSlash(rel)})
	}
	return files, nil
}

func randomInt(max int64) int64 {
	if max <= 0 {
		return 0
	}
	n, err := rand.Int(rand.Reader, big.NewInt(max))
	if err != nil {
		return time.Now().UnixNano() % max
	}
	return n.Int64()
}
