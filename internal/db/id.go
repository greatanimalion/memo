package db

import (
	"crypto/rand"
	"encoding/hex"
	"strconv"
	"time"
)

// NewID 返回一个随机的 16 字节十六进制标识符，用于原服务端生成
// crypto.randomUUID() 的场景（例如书籍的默认章节）。
func NewID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 16)
	}
	return hex.EncodeToString(b)
}
