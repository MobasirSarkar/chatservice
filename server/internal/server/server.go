package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/MobasirSarkar/chatservice/server/internal/ws"
	"github.com/coder/websocket"
	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
)

const (
	NatsUrl           = "nats://127.0.0.1:4222"
	WebSocketEndPoint = "/ws"
	WriteTimeout      = 10 * time.Second
	ReadTimeout       = 10 * time.Second
	PingInterval      = 20 * time.Second
)

type RoomSub struct {
	Sub      *nats.Subscription
	RefCount int
}

type Server struct {
	Nc         *nats.Conn
	ServerId   string
	ClientsMu  sync.RWMutex
	Clients    map[*ws.Client]struct{}
	RoomsMu    sync.RWMutex
	Rooms      map[string]map[*ws.Client]struct{}
	SubMu      sync.RWMutex
	Subs       map[string]*RoomSub
	Shutdown   chan struct{}
	HttpServer *http.Server
}

func New(nc *nats.Conn) *Server {
	return &Server{
		Nc:       nc,
		ServerId: uuid.NewString(),
		Clients:  make(map[*ws.Client]struct{}),
		Rooms:    make(map[string]map[*ws.Client]struct{}),
		Subs:     make(map[string]*RoomSub),
		Shutdown: make(chan struct{}),
	}
}

func (s *Server) ensureRoomSubscription(roomID string) error {
	s.SubMu.Lock()
	defer s.SubMu.Unlock()

	if rs, ok := s.Subs[roomID]; ok {
		rs.RefCount++
		return nil
	}

	subject := fmt.Sprintf("room.%s", roomID)
	sub, err := s.Nc.Subscribe(subject, func(m *nats.Msg) {
		var msg ws.Message
		if err := json.Unmarshal(m.Data, &msg); err != nil {
			log.Printf("[Nats] failed to unmarshal message for %s: %v", subject, err)
			return
		}
		if msg.OriginServer == s.ServerId {
			return
		}
		s.deliverToLocalRoom(msg.RoomId, &msg)
	})
	if err != nil {
		return err
	}
	s.Subs[roomID] = &RoomSub{Sub: sub, RefCount: 1}
	return nil
}

func (s *Server) releaseRoomSubscription(roomId string) error {
	s.SubMu.Lock()
	defer s.SubMu.Unlock()

	rs, ok := s.Subs[roomId]
	if !ok {
		return nil
	}
	rs.RefCount--
	if rs.RefCount <= 0 {
		if err := rs.Sub.Unsubscribe(); err != nil {
			log.Printf("[NATS] Unsubscribe error for %s: %v", roomId, err)
		}
		delete(s.Subs, roomId)
	}
	return nil
}

func (s *Server) deliverToLocalRoom(roomID string, msg *ws.Message) {
	s.RoomsMu.RLock()
	clients := s.Rooms[roomID]
	s.RoomsMu.RUnlock()

	if clients == nil {
		return
	}
	data, _ := json.Marshal(msg)
	for c := range clients {
		go func(c *ws.Client, raw []byte) {
			c.SendMu.Lock()
			defer c.SendMu.Unlock()
			ctx, cancel := context.WithTimeout(context.Background(), WriteTimeout)
			defer cancel()
			_ = c.Conn.Write(ctx, websocket.MessageText, raw)
		}(c, data)
	}
}
