package ws

import "time"

type Message struct {
	MessageId    string         `json:"message_id"`
	ClientId     string         `json:"client_id,omitempty"`
	RoomId       string         `json:"room_id"`
	SenderId     string         `json:"sender_id"`
	OriginServer string         `json:"origin_server,omitempty"`
	Type         string         `json:"type"`
	Payload      map[string]any `json:"payload,omitempty"`
	CreatedAt    time.Time      `json:"created_at"`
}
