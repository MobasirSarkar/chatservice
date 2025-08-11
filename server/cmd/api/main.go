package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/MobasirSarkar/chatservice/server/internal/nats"
	"github.com/MobasirSarkar/chatservice/server/internal/server"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("🚀 Multi-Server Chat Demo")
		fmt.Println("Usage:")
		fmt.Println("  go run main.go server1    # Starts server on :8080")
		fmt.Println("  go run main.go server2    # Starts server on :8081")
		fmt.Println("  go run main.go server3    # Starts server on :8082")
		os.Exit(1)
	}

	serverName := os.Args[1]

	// Different ports for different servers
	portMap := map[string]string{
		"server1": ":8080",
		"server2": ":8081",
		"server3": ":8082",
	}

	port, exists := portMap[serverName]
	if !exists {
		log.Fatalf("❌ Unknown server name: %s. Use server1, server2, or server3", serverName)
	}

	// Connect to NATS (same NATS for all servers)
	nc := nats.Connect("nats://127.0.0.1:4222")
	defer nc.Close()

	// Create server with a custom name for demonstration
	server := server.New(nc)

	// Add some colorful logging to show which server is doing what
	logColor := getServerColor(serverName)

	fmt.Printf("%s🚀 Starting %s on port %s%s\n", logColor, serverName, port, resetColor())
	fmt.Printf("%s📡 Connected to NATS at nats://127.0.0.1:4222%s\n", logColor, resetColor())
	fmt.Printf("%s🆔 Server ID: %s%s\n", logColor, server.ServerId, resetColor())

	if err := server.Start(port); err != nil {
		log.Fatalf("❌ Server start failed: %v", err)
	}

	// Print helpful connection info
	fmt.Printf("\n%s✨ %s is ready!%s\n", logColor, serverName, resetColor())
	fmt.Printf("%s🔗 WebSocket URL: ws://localhost%s/ws?token=user:yourname%s\n", logColor, port, resetColor())
	fmt.Printf("%s💬 Test by connecting clients to different servers and sending messages!%s\n", logColor, resetColor())
	fmt.Printf("%s🔥 Kill this server with Ctrl+C to see others continue working!%s\n", logColor, resetColor())

	// Wait for shutdown signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	fmt.Printf("\n%s🛑 Shutting down %s...%s\n", logColor, serverName, resetColor())

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.ShutdownGracefully(ctx); err != nil {
		log.Printf("❌ [%s] shutdown error: %v", serverName, err)
	}

	fmt.Printf("%s✅ %s stopped gracefully.%s\n", logColor, serverName, resetColor())
}

func getServerColor(serverName string) string {
	colors := map[string]string{
		"server1": "\033[32m", // Green
		"server2": "\033[34m", // Blue
		"server3": "\033[35m", // Magenta
	}
	if color, exists := colors[serverName]; exists {
		return color
	}
	return "\033[37m" // White
}

func resetColor() string {
	return "\033[0m"
}
