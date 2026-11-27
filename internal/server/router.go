package server

import (
	"crypto/subtle"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// NewRouter 构建用于替代之前 Express 应用的路由。
// token 非空时启用访问校验：请求需携带 Authorization: Bearer <token>，
// 或通过 ?token= 传入（用于无法自定义请求头的图片/静态资源）。
func NewRouter(token string) http.Handler {
	r := chi.NewRouter()

	r.Use(corsMiddleware)
	r.Use(middleware.Recoverer)
	r.Use(requestLogger)
	if token != "" {
		r.Use(authMiddleware(token))
	}

	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Body != nil {
				r.Body = http.MaxBytesReader(w, r.Body, 100<<20)
			}
			next.ServeHTTP(w, r)
		})
	})

	r.Get("/uploads/*", serveUploads)
	r.Post("/upload", uploadFile)
	r.Delete("/deleteFile", deleteFile)

	r.Route("/api", func(api chi.Router) {
		api.Get("/memorySize", memorySize)
		registerEntityRoutes(api)
		registerChatRoutes(api)
		registerBookAgentRoutes(api)
	})

	return r
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
		w.Header().Set("Access-Control-Expose-Headers", "Content-Length")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// authMiddleware 校验访问令牌：优先读取 Authorization: Bearer，
// 图片等无法设置请求头的资源允许通过 ?token= 传入。
func authMiddleware(token string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// CORS 预检请求不带业务头，直接放行
			if r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}
			provided := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
			if provided == "" {
				provided = r.URL.Query().Get("token")
			}
			// 常量时间比较，避免时序侧信道
			if subtle.ConstantTimeCompare([]byte(provided), []byte(token)) != 1 {
				w.Header().Set("Content-Type", "application/json; charset=utf-8")
				w.WriteHeader(http.StatusUnauthorized)
				_, _ = w.Write([]byte(`{"code":401,"error":"unauthorized"}`))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		if strings.HasPrefix(r.URL.Path, "/api") {
			log.Printf("%s %s (%s)", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
		}
	})
}
