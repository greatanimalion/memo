package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"memo/internal/config"

	_ "modernc.org/sqlite"
)

var (
	once sync.Once
	db   *sql.DB
	err  error
)

// Open 打开（并初始化）SQLite 数据库。可安全地多次调用：
// 将复用同一个句柄。
func Open() (*sql.DB, error) {
	once.Do(func() {
		path := config.DBPath()
		if mkErr := os.MkdirAll(filepath.Dir(path), 0o755); mkErr != nil {
			err = mkErr
			return
		}
		dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)", filepath.ToSlash(path))
		db, err = sql.Open("sqlite", dsn)
		if err != nil {
			return
		}
		db.SetMaxOpenConns(1)
		if err = migrate(db); err != nil {
			return
		}
	})
	return db, err
}

// DB 返回已打开的数据库句柄。
func DB() *sql.DB {
	h, openErr := Open()
	if openErr != nil {
		panic(openErr)
	}
	return h
}

func migrate(h *sql.DB) error {
	for _, stmt := range schemaStatements {
		if _, e := h.Exec(stmt); e != nil {
			return fmt.Errorf("schema: %w", e)
		}
	}
	for _, stmt := range migrations {
		_, _ = h.Exec(stmt)
	}
	return nil
}

func Close() {
	if db != nil {
		_ = db.Close()
	}
}
