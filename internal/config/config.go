package config

import (
	"os"
	"path/filepath"
	"runtime"
)

// Port is the HTTP port used by the local API server (same port the original
// Express server listened on, so the frontend services layer keeps working).
const Port = 32068

// IsDev reports whether the app is running from the project directory
// (`wails dev`) instead of an installed build.
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
		// During `wails dev` the binary lives in <project>/build/bin/.
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

// DataDir mirrors the previous layout:
//   - development: <project>/data
//   - production:  <system root>/.MemoryData
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
