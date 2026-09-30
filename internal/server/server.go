package server

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"sync"
	"time"

	"memo/internal/config"
)

// Server hosts the local API server that replaces the previous Express app.
type Server struct {
	mu     sync.Mutex
	server *http.Server
	wg     sync.WaitGroup
	done   chan struct{}
}

func New() *Server {
	return &Server{done: make(chan struct{})}
}

// StartAsync runs the HTTP server in the background. `done` is closed once the
// socket is actually listening.
func (s *Server) StartAsync() {
	s.mu.Lock()
	if s.server != nil {
		s.mu.Unlock()
		return
	}
	srv := &http.Server{
		Addr:              fmt.Sprintf(":%d", config.Port),
		Handler:           NewRouter(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	s.server = srv
	s.mu.Unlock()

	ln, err := net.Listen("tcp", srv.Addr)
	if err != nil {
		log.Printf("api server: %v", err)
		close(s.done)
		return
	}

	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Printf("api server: %v", err)
		}
	}()
	close(s.done)
	log.Printf("api server listening on http://localhost:%d", config.Port)
}

// WaitReady blocks until the server started listening (or the timeout).
func (s *Server) WaitReady(timeout time.Duration) bool {
	select {
	case <-s.done:
		return true
	case <-time.After(timeout):
		return false
	}
}

// Stop gracefully shuts the server down.
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
