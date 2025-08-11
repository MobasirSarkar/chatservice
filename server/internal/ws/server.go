package ws

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/coder/websocket"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: []string{"*"},
	})
	if err != nil {
		log.Println("accept err:", err)
		return
	}

	defer c.Close(websocket.StatusInternalError, "server error")

	ctx, cancel := context.WithTimeout(r.Context(), time.Minute*10)
	defer cancel()

	for {
		_, data, err := c.Read(ctx)
		if err != nil {
			log.Println("read err:", err)
			return
		}
		fmt.Println("Received:", string(data))

		c.Write(ctx, websocket.MessageText, data)
	}
}
