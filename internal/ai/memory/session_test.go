package memory

import (
	"context"
	"testing"
)

func TestAbortRequestCancelsAndForgets(t *testing.T) {
	inner, innerCancel := context.WithCancel(context.Background())
	defer innerCancel()
	RegisterAbort("abort-target", innerCancel)
	if !AbortRequest("abort-target") {
		t.Fatal("expected the registered request to be aborted")
	}
	if inner.Err() == nil {
		t.Fatal("context was not cancelled")
	}
	if AbortRequest("abort-target") {
		t.Fatal("second abort should miss (404 branch)")
	}
}
