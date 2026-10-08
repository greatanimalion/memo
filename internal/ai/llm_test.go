package ai

import "testing"

func TestResolveRequest(t *testing.T) {
	// 模型 id 与接口地址完全由前端传入，后端不再有预设表
	cfg := ResolveRequest("gpt-4o-mini", "https://api.openai.com/v1/")
	if cfg.Model != "gpt-4o-mini" || cfg.URL != "https://api.openai.com/v1/" {
		t.Fatalf("custom = %+v", cfg)
	}

	// 自定义模型名原样发给服务商，不做别名映射
	cfg = ResolveRequest("deepseek-chat", "https://proxy.example.com")
	if cfg.Model != "deepseek-chat" || cfg.URL != "https://proxy.example.com" {
		t.Fatalf("passthrough = %+v", cfg)
	}

	// 仅裁剪空白
	cfg = ResolveRequest("  qwen-plus  ", "  https://example.com/v1  ")
	if cfg.Model != "qwen-plus" || cfg.URL != "https://example.com/v1" {
		t.Fatalf("trim = %+v", cfg)
	}

	// 空值原样返回，由路由层校验
	cfg = ResolveRequest("", "")
	if cfg.Model != "" || cfg.URL != "" {
		t.Fatalf("empty = %+v", cfg)
	}
}
