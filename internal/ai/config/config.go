package config

import "strings"

// ModelConfig 是 OpenAI 兼容接口配置。两个字段均来自前端：用户在
// APIKey 页面自行添加模型与 base URL，后端不保存预设列表。
type ModelConfig struct {
	Model string `json:"model"`
	URL   string `json:"url"`
}

// ResolveRequest 将前端传入的模型 id 与 base URL 转为接口配置，
// 除裁剪空白外不做其他改动。
func ResolveRequest(name, baseURL string) ModelConfig {
	return ModelConfig{
		Model: strings.TrimSpace(name),
		URL:   strings.TrimSpace(baseURL),
	}
}
