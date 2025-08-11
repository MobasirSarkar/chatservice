package nats

import (
	"log"
	"time"

	"github.com/nats-io/nats.go"
)

func Connect(url string) *nats.Conn {
	nc, err := nats.Connect(url,
		nats.MaxReconnects(-1),
		nats.ReconnectWait(1*time.Second),
		nats.Name("chat-node"),
	)
	if err != nil {
		log.Fatalf("NATS connection failed: %v", err)
	}
	return nc
}
