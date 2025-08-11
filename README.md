# 🚀 Multi-Server Chat Application (Go + React + WebSocket + NATS)

A real-time chat system built with **Go** (backend) and **React** (frontend), powered by **WebSockets** for instant communication and **NATS** for multi-server message broadcasting.

This project demonstrates:
- Multi-server WebSocket chat with NATS as the message bus
- Custom React hooks for managing chat connections
- Graceful server shutdown handling in Go
- Modular, production-ready architecture

---

## 📺 Demo Video
[![Watch the demo]https://raw.githubusercontent.com/MobasirSarkar/chatservice/blob/main/video/demo.mkv
---

## 🛠 Tech Stack

### Backend
- **Go** – High performance server
- **NATS** – Lightweight messaging system for multi-server pub/sub
- **WebSockets** – Real-time bidirectional communication
- Graceful shutdown handling

### Frontend
- **React + TypeScript**
- **@tanstack/react-router**
- **Custom Hooks** (`useChatSocket`)
- Tailwind CSS styling

---

## 📂 Project Structure
```
server/
  ├── main.go                # Server entrypoint
  ├── internal/
  │    ├── server/           # HTTP + WebSocket handling
  │    └── nats/              # NATS connection wrapper
frontend/
  ├── src/
  │    ├── hooks/            # useChatSocket.ts
  │    ├── routes/           # /chat route
  │    └── components/       
```

---

## 🚦 Getting Started

### 1️⃣ Run NATS
```bash
docker run -p 4222:4222 nats
```

### 2️⃣ Start Multiple Servers
```bash
cd server
go run main.go server1   # :8080
go run main.go server2   # :8081
go run main.go server3   # :8082
```

### 3️⃣ Start the Frontend
```bash
cd frontend
npm install
npm run dev
```

### 4️⃣ Connect Clients
Example WebSocket URLs:
```
ws://localhost:8080/ws?token=user:alice
ws://localhost:8081/ws?token=user:bob
ws://localhost:8082/ws?token=user:charlie
```

---

## ✨ Features
- **Multi-server chat**: Join from any server and message broadcasts to all.
- **Room support**: Currently defaults to `general`, but can be extended.
- **Persistent messages**: Uses `localStorage` to keep messages across reloads.
- **Automatic reconnect**: Gracefully handles page refresh or network hiccups.
- **Custom React hook**: Encapsulates WebSocket logic (`useChatSocket`).

---

## 📌 Example
### Sending a message:
```json
{
  "action": "message",
  "room": "general",
  "type": "chat",
  "payload": {
    "text": "Hello from Alice!",
    "user": "alice"
  },
  "client_id": "client-123456789"
}
```

---

## 💡 Notes
- For a production-grade system, use **server-side message history** (database) and replay on reconnect.
- Authentication here is **demo-only** via `token=user:name` — not secure for production.

