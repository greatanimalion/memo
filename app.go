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

// GetApiPort 返回本地 API 服务实际监听的端口。
// 默认端口（config.Port）被占用时后端会自动切换为空闲端口，
// 前端启动时通过该绑定获取端口，避免继续请求已被占用的地址。
func (a *App) GetApiPort() int {
	return apiServer.Port()
}

// GetApiToken 返回本次启动随机生成的访问令牌。
// 前端所有请求需携带 Authorization: Bearer <token>，
// 图片等静态资源通过 ?token= 传入。
func (a *App) GetApiToken() string {
	return apiServer.Token()
}
