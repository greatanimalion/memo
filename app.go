package main

import (
	"context"
	"fmt"
)

// App 结构体
type App struct {
	ctx context.Context
}

// NewApp 创建新的 App 应用结构体
func NewApp() *App {
	return &App{}
}

// startup 在应用启动时被调用，保存 context 以便调用运行时方法
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// Greet 返回针对给定名字的问候语
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}
