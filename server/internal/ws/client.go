package ws

import (
	"sync"

	"github.com/coder/websocket"
)

type Client struct {
	Conn   *websocket.Conn
	SendMu sync.Mutex
	UserId string
}
