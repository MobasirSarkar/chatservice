package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/MobasirSarkar/chatservice/server/internal/ws"
	"github.com/coder/websocket"
	"github.com/google/uuid"
)

func (s *Server) HandleWs(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "missing token", http.StatusUnauthorized)
		return
	}
	userId, err := verifyToken(token)
	if err != nil {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: []string{"*"},
	})
	if err != nil {
		log.Printf("ws accept: %v", err)
		return
	}

	c := &ws.Client{Conn: conn, UserId: userId}
	s.ClientsMu.Lock()
	s.Clients[c] = struct{}{}
	s.ClientsMu.Unlock()

	// Signal channel to stop ping loop when read loop ends
	stopPing := make(chan struct{})

	defer func() {
		close(stopPing) // tell ping loop to stop
		s.removeClient(c)
		_ = conn.Close(websocket.StatusNormalClosure, "bye")
	}()

	// Start ping loop
	go s.pingLoop(c, stopPing)

	ctx := r.Context()
	for {
		typ, data, err := conn.Read(ctx)
		if err != nil {
			if websocket.CloseStatus(err) != -1 {
				log.Printf("client %s closed: %v", c.UserId, websocket.CloseStatus(err))
			} else {
				log.Printf("read error: %v", err)
			}
			return
		}

		if typ != websocket.MessageText && typ != websocket.MessageBinary {
			continue
		}

		var incoming map[string]any
		if err := json.Unmarshal(data, &incoming); err != nil {
			log.Printf("invalid json: %v", err)
			continue
		}

		action, _ := incoming["action"].(string)
		switch action {
		case "join":
			roomID, _ := incoming["room"].(string)
			if roomID != "" {
				s.addClientToRoom(c, roomID)
			}
		case "leave":
			roomID, _ := incoming["room"].(string)
			if roomID != "" {
				s.removeClientFromRoom(c, roomID)
			}
		case "message":
			roomID, _ := incoming["room"].(string)
			if roomID == "" {
				continue
			}
			msgType, _ := incoming["type"].(string)
			pl, _ := incoming["payload"].(map[string]any)
			clientID, _ := incoming["client_id"].(string)

			msg := ws.Message{
				MessageId:    uuid.NewString(),
				ClientId:     clientID,
				RoomId:       roomID,
				SenderId:     c.UserId,
				OriginServer: s.ServerId,
				Type:         msgType,
				Payload:      pl,
				CreatedAt:    time.Now().UTC(),
			}

			s.deliverToLocalRoom(roomID, &msg)

			raw, _ := json.Marshal(msg)
			go func() {
				if err := s.Nc.Publish(fmt.Sprintf("room.%s", roomID), raw); err != nil {
					log.Printf("[NATS] publish err: %v", err)
				}
			}()
		}
	}
}

func (s *Server) pingLoop(c *ws.Client, stop <-chan struct{}) {
	ticker := time.NewTicker(PingInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.Shutdown:
			return
		case <-stop:
			return
		case <-ticker.C:
			c.SendMu.Lock()
			ctx, cancel := context.WithTimeout(context.Background(), WriteTimeout)
			err := c.Conn.Ping(ctx)
			cancel()
			c.SendMu.Unlock()

			if err != nil {
				log.Printf("ping failed for client %s: %v", c.UserId, err)
				return
			}
		}
	}
}

func (s *Server) addClientToRoom(c *ws.Client, roomId string) {
	// ensuring subscription exists
	if err := s.ensureRoomSubscription(roomId); err != nil {
		log.Printf("ensure sub failed for %s: %v", roomId, err)
	}

	s.RoomsMu.Lock()
	defer s.RoomsMu.Unlock()
	if s.Rooms[roomId] == nil {
		s.Rooms[roomId] = make(map[*ws.Client]struct{})
	}
	s.Rooms[roomId][c] = struct{}{}
}

func (s *Server) removeClientFromRoom(c *ws.Client, roomId string) {
	s.RoomsMu.Lock()
	defer s.RoomsMu.Unlock()

	if s.Rooms[roomId] != nil {
		delete(s.Rooms[roomId], c)
		if len(s.Rooms[roomId]) == 0 {
			delete(s.Rooms, roomId)

			if err := s.releaseRoomSubscription(roomId); err != nil {
				log.Printf("release sub err: %v", err)
			}
		}
	}
}

func (s *Server) removeClient(c *ws.Client) {
	s.ClientsMu.Lock()
	delete(s.Clients, c)
	s.ClientsMu.Unlock()

	s.RoomsMu.Lock()
	for roomID, set := range s.Rooms {
		if _, ok := set[c]; ok {
			delete(set, c)
			if len(set) == 0 {
				delete(s.Rooms, roomID)
				if err := s.releaseRoomSubscription(roomID); err != nil {
					log.Printf("release sub err: %v", err)
				}
			}
		}
	}
	s.RoomsMu.Unlock()
}

func verifyToken(token string) (string, error) {
	if after, ok := strings.CutPrefix(token, "user:"); ok {
		return after, nil
	}
	return "", errors.New("invalid token")
}

func (s *Server) Start(addr string) error {
	mux := http.NewServeMux()
	mux.HandleFunc(WebSocketEndPoint, s.HandleWs)

	s.HttpServer = &http.Server{
		Addr:    addr,
		Handler: mux,
	}

	go func() {
		if err := s.HttpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("http listen failed: %v", err)
		}
	}()
	log.Printf("HTTP serve listening on %s", addr)
	return nil
}

func (s *Server) ShutdownGracefully(ctx context.Context) error {
	if s.HttpServer != nil {
		_ = s.HttpServer.Shutdown(ctx)
	}
	close(s.Shutdown)

	s.ClientsMu.Lock()
	for c := range s.Clients {
		c.Conn.Close(websocket.StatusGoingAway, "Server shutting down")
	}
	s.ClientsMu.Unlock()

	if s.Nc != nil && !s.Nc.IsClosed() {
		s.Nc.Drain()
		s.Nc.Close()
	}

	return nil
}
