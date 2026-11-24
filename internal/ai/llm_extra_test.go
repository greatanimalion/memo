package ai

import (
	"context"
	"net/http"
	"strings"
	"testing"
)

func TestAPIErrorClassification(t *testing.T) {
	ctxErr := &APIError{StatusCode: http.StatusBadRequest, Body: `{"error":{"message":"maximum context length is 8192 tokens"}}`}
	if !IsContextLengthExceeded(ctxErr) {
		t.Fatal("context length error not detected")
	}

	toolErr := &APIError{StatusCode: http.StatusBadRequest, Body: `{"error":{"message":"model does not support tools"}}`}
	if !IsToolsUnsupported(toolErr) {
		t.Fatal("unsupported tools error not detected")
	}

	authErr := &APIError{StatusCode: http.StatusUnauthorized, Body: `{"error":{"message":"invalid api key"}}`}
	if IsToolsUnsupported(authErr) || IsContextLengthExceeded(authErr) {
		t.Fatal("auth errors must not be classified as retryable tool/context errors")
	}

	if got := (&APIError{StatusCode: 400, Body: "bad"}).Error(); got != "llm http 400: bad" {
		t.Fatalf("error string = %q", got)
	}
}

func TestReadStreamFallbackToBufferedJSON(t *testing.T) {
	body := `{"choices":[{"message":{"role":"assistant","content":"你好"},"finish_reason":"stop"}],"error":null}`
	var deltas []string
	msg, err := readStream(context.Background(), strings.NewReader(body), func(s string) { deltas = append(deltas, s) })
	if err != nil {
		t.Fatal(err)
	}
	if msg.Content != "你好" || msg.FinishReason != FinishStop {
		t.Fatalf("msg = %+v", msg)
	}
	if len(deltas) != 1 || deltas[0] != "你好" {
		t.Fatalf("deltas = %v", deltas)
	}
}

func TestProviderMessageError(t *testing.T) {
	err := providerMessageError("prompt is too long for the context window")
	if !IsContextLengthExceeded(err) {
		t.Fatal("message-level context error not detected")
	}
	plain := providerMessageError("boom")
	if IsContextLengthExceeded(plain) || plain.Error() != "boom" {
		t.Fatal("plain error misclassified")
	}
}
