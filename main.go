package main

import (
	"context"
	"embed"
	"time"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"

	"memo/internal/db"
	"memo/internal/server"
)

//go:embed all:frontend/dist
var assets embed.FS

var apiServer = server.New()

func main() {
	app := NewApp()

	if _, err := db.Open(); err != nil {
		println("database error:", err.Error())
	}
	apiServer.StartAsync()
	apiServer.WaitReady(3 * time.Second)

	err := wails.Run(&options.App{
		Title:     "多功能记事本",
		Width:     900,
		Height:    720,
		MinWidth:  688,
		MinHeight: 488,
		Frameless: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}

func (a *App) shutdown(ctx context.Context) {
	stopCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	apiServer.Stop(stopCtx)
	db.Close()
}
