package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log"
	"net"
	"net/http"
	"sync"
	"time"

	"memo/internal/config"
)

// Server 承载本地 API 服务，用于替代之前的 Express 应用。
type Server struct {
	mu     sync.Mutex
	server *http.Server
	// port 是系统实际分配的监听端口（每次启动随机）
	port int
	// token 是本次启动随机生成的访问令牌，前端通过 Wails 绑定获取，
	// 用于阻止本机其他进程/网页随意调用本地 API。
	token string
	wg    sync.WaitGroup
	done  chan struct{}
}

func New() *Server {
	return &Server{done: make(chan struct{}), token: generateToken()}
}

// generateToken 生成 32 字节随机令牌（十六进制字符串）。
func generateToken() string {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		// crypto/rand 失败属于系统级异常，直接 panic 比放行未鉴权请求更安全
		panic("generate api token: " + err.Error())
	}
	return hex.EncodeToString(buf)
}

// Token 返回本次启动的 API 访问令牌。
func (s *Server) Token() string {
	return s.token
}

// StartAsync 在后台运行 HTTP 服务。套接字真正开始监听后会关闭 done 通道。
func (s *Server) StartAsync() {
	s.mu.Lock()
	if s.server != nil {
		s.mu.Unlock()
		return
	}
	srv := &http.Server{
		// 原固定端口实现（已改为系统动态分配，见下方 net.Listen）
		// Addr:              fmt.Sprintf(":%d", config.Port),
		Handler:           NewRouter(s.token),
		ReadHeaderTimeout: 10 * time.Second,
	}
	s.server = srv
	s.mu.Unlock()

	// 固定监听本地回环地址的随机端口（:0 由操作系统分配绝对空闲的端口）：
	// 既不会被其他软件/多实例占用，也不会把接口暴露到局域网。
	// 原实现：ln, err := net.Listen("tcp", srv.Addr)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Printf("api server: %v", err)
		close(s.done)
		return
	}

	// 记录实际端口，供前端通过 Wails 绑定获取并拼接请求地址
	port := ln.Addr().(*net.TCPAddr).Port
	s.mu.Lock()
	s.port = port
	s.mu.Unlock()

	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Printf("api server: %v", err)
		}
	}()
	close(s.done)
	// 原固定端口（config.Port）不再占用，仅作为纯浏览器调试时的回退值
	log.Printf("api server listening on http://127.0.0.1:%d（默认端口 %d 不再占用）", port, config.Port)
}

// Port 返回实际监听端口（StartAsync 执行完成后有效）。
func (s *Server) Port() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.port
}

// WaitReady 阻塞直到服务开始监听（或超时）。
func (s *Server) WaitReady(timeout time.Duration) bool {
	select {
	case <-s.done:
		return true
	case <-time.After(timeout):
		return false
	}
}

// Stop 优雅地关闭服务。
func (s *Server) Stop(ctx context.Context) {
	s.mu.Lock()
	srv := s.server
	s.server = nil
	s.mu.Unlock()
	if srv == nil {
		return
	}
	if err := srv.Shutdown(ctx); err != nil {
		_ = srv.Close()
	}
	s.wg.Wait()
}
