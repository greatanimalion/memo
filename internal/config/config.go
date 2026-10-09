package config

import (
	"os"
	"path/filepath"
	"runtime"
)

// Port 是本地 API 服务器使用的 HTTP 端口（与原 Express 服务器监听的端口
// 相同，以保证前端 services 层继续正常工作）。
const Port = 32068

// IsDev 判断应用是否从项目目录内运行（`wails dev`），
// 而不是以安装后的构建形式运行。
func IsDev() bool {
	if os.Getenv("MEMORY_ENV") == "production" {
		return false
	}
	if v := os.Getenv("MEMORY_ENV"); v == "development" {
		return true
	}
	if _, err := os.Stat("wails.json"); err == nil {
		return true
	}
	if exe, err := os.Executable(); err == nil {
		// 在 `wails dev` 期间，二进制文件位于 <project>/build/bin/ 下。
		if _, statErr := os.Stat(filepath.Join(filepath.Dir(exe), "..", "..", "wails.json")); statErr == nil {
			return true
		}
	}
	return false
}

func systemRoot() string {
	if runtime.GOOS == "windows" {
		if exe, err := os.Executable(); err == nil {
			if vol := filepath.VolumeName(exe); vol != "" {
				return vol + string(os.PathSeparator)
			}
		}
		if cwd, err := os.Getwd(); err == nil {
			if vol := filepath.VolumeName(cwd); vol != "" {
				return vol + string(os.PathSeparator)
			}
		}
		return "C:" + string(os.PathSeparator)
	}
	return "/"
}

// DataDir 沿用之前的目录布局：
//   - 开发环境：<project>/data
//   - 生产环境：<系统根目录>/.MemoryData
func DataDir() string {
	if v := os.Getenv("MEMORY_DATA_DIR"); v != "" {
		return v
	}
	if IsDev() {
		cwd, err := os.Getwd()
		if err == nil {
			return filepath.Join(cwd, "data")
		}
		return "data"
	}
	return filepath.Join(systemRoot(), ".MemoryData")
}

func DBPath() string    { return filepath.Join(DataDir(), "storage.db") }
func UploadDir() string { return filepath.Join(DataDir(), "uploads") }
func FilesDir() string  { return filepath.Join(UploadDir(), "files") }
func ImagesDir() string { return filepath.Join(UploadDir(), "images") }
