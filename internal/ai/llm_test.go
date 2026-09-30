package ai

import "testing"

func TestResolveRequest(t *testing.T) {
	// 自定义模型 + 自定义地址：模型名原样发出
	cfg := ResolveRequest("gpt-4o-mini", "https://api.openai.com/v1/")
	if cfg.Model != "gpt-4o-mini" || cfg.URL != "https://api.openai.com/v1/" {
		t.Fatalf("custom = %+v", cfg)
	}

	// 预设别名：保留预设的模型标识，只覆盖地址
	cfg = ResolveRequest("deepseek", "https://proxy.example.com")
	if cfg.Model != "deepseek-chat" || cfg.URL != "https://proxy.example.com" {
		t.Fatalf("preset override = %+v", cfg)
	}

	// 未提供地址时与旧行为一致
	cfg = ResolveRequest("deepseek", "")
	if cfg.Model != "deepseek-chat" || cfg.URL != "https://api.deepseek.com" {
		t.Fatalf("preset = %+v", cfg)
	}

	// 空模型名不被自定义地址覆盖成空串
	cfg = ResolveRequest("", "https://proxy.example.com")
	if cfg.Model != "qwen-plus" || cfg.URL != "https://proxy.example.com" {
		t.Fatalf("empty model = %+v", cfg)
	}
}
