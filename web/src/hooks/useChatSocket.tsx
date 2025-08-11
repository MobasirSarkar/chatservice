import { useEffect, useRef, useState, useCallback } from "react";

// Hook for connecting multiple users to different servers
export function useMultiChatSocket(userNames: string[]) {
  const [allMessages, setAllMessages] = useState<any[]>([]);
  const [connections, setConnections] = useState<{ [key: string]: { status: string, socket: WebSocket | null } }>({});
  const socketsRef = useRef<{ [key: string]: WebSocket }>({});
  const seenMessagesRef = useRef<Set<string>>(new Set()); // Track seen messages
  const reconnectTimeoutsRef = useRef<{ [key: string]: NodeJS.Timeout }>({});
  const roomId = "general";

  // Server ports for different users
  const getPortForUser = (index: number) => {
    const ports = ["8080", "8081", "8082"];
    return ports[index % ports.length];
  };

  // Auto-reconnect function
  const reconnectUser = useCallback((userName: string, index: number, delay: number = 1000) => {
    if (reconnectTimeoutsRef.current[userName]) {
      clearTimeout(reconnectTimeoutsRef.current[userName]);
    }

    reconnectTimeoutsRef.current[userName] = setTimeout(() => {
      const port = getPortForUser(index);
      console.log(`🔄 Attempting to reconnect ${userName} to server :${port} in ${delay}ms`);

      setConnections(prev => ({
        ...prev,
        [userName]: { ...prev[userName], status: 'reconnecting' }
      }));

      connectUser(userName, index);
    }, delay);
  }, []);

  // Connect individual user
  const connectUser = useCallback((userName: string, index: number) => {
    const port = getPortForUser(index);
    console.log(`🔌 Connecting ${userName} to server :${port}`);

    try {
      // Clean up existing connection
      if (socketsRef.current[userName]) {
        socketsRef.current[userName].close();
        delete socketsRef.current[userName];
      }

      const ws = new WebSocket(`ws://localhost:${port}/ws?token=user:${userName}`);
      socketsRef.current[userName] = ws;

      // Update connection status immediately
      setConnections(prev => ({
        ...prev,
        [userName]: { status: 'connecting', socket: ws }
      }));

      ws.onopen = () => {
        console.log(`✅ ${userName} connected to server :${port}`);
        setConnections(prev => ({
          ...prev,
          [userName]: { ...prev[userName], status: 'connected' }
        }));

        // Clear any pending reconnect
        if (reconnectTimeoutsRef.current[userName]) {
          clearTimeout(reconnectTimeoutsRef.current[userName]);
          delete reconnectTimeoutsRef.current[userName];
        }

        // Join room
        const joinMessage = {
          action: "join",
          room: roomId
        };
        ws.send(JSON.stringify(joinMessage));
        console.log(`📩 ${userName} sent join message for room: ${roomId}`);

        // Add system message (only once)
        const connectId = `${userName}-connect-${port}-${Date.now()}`;
        if (!seenMessagesRef.current.has(connectId)) {
          seenMessagesRef.current.add(connectId);
          setAllMessages(prev => [...prev, {
            type: "system",
            text: `${userName} connected to server :${port}`,
            timestamp: Date.now(),
            server: port,
            id: connectId
          }]);
        }
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          console.log(`📨 ${userName} received message:`, parsed);

          if (parsed.type === "chat") {
            // Create unique message ID to prevent duplicates
            const messageId = parsed.message_id ||
              `${parsed.payload?.user}-${parsed.payload?.text}-${parsed.created_at}` ||
              `msg-${Date.now()}-${Math.random()}`;

            // Only add if we haven't seen this message
            if (!seenMessagesRef.current.has(messageId)) {
              seenMessagesRef.current.add(messageId);

              setAllMessages(prev => [...prev, {
                type: "user",
                user: parsed.payload?.user || "Unknown",
                text: parsed.payload?.text || "Empty message",
                timestamp: parsed.created_at || Date.now(),
                server: port,
                receivedBy: userName,
                id: messageId
              }]);
            } else {
              console.log(`🔄 Duplicate message filtered: ${messageId}`);
            }
          }
        } catch (error) {
          console.error(`❌ ${userName} parse error:`, error, "Raw data:", event.data);
        }
      };

      ws.onclose = (event) => {
        console.log(`🔴 ${userName} disconnected from server :${port} (Code: ${event.code}, Reason: ${event.reason})`);
        setConnections(prev => ({
          ...prev,
          [userName]: { ...prev[userName], status: 'disconnected' }
        }));

        // Add disconnect message
        const disconnectId = `${userName}-disconnect-${port}-${Date.now()}`;
        setAllMessages(prev => [...prev, {
          type: "system",
          text: `${userName} disconnected from server :${port} (${event.code})`,
          timestamp: Date.now(),
          server: port,
          id: disconnectId
        }]);

        // Auto-reconnect if not a normal closure
        if (event.code !== 1000 && event.code !== 1001) {
          console.log(`🔄 Scheduling reconnect for ${userName}...`);
          reconnectUser(userName, index, 2000); // Reconnect after 2 seconds
        }
      };

      ws.onerror = (err) => {
        console.error(`💥 ${userName} socket error on port :${port}:`, err);
        setConnections(prev => ({
          ...prev,
          [userName]: { ...prev[userName], status: 'error' }
        }));

        // Schedule reconnect on error
        reconnectUser(userName, index, 3000); // Reconnect after 3 seconds
      };

    } catch (error) {
      console.error(`💥 Failed to create WebSocket for ${userName}:`, error);
      setConnections(prev => ({
        ...prev,
        [userName]: { status: 'error', socket: null }
      }));

      // Schedule reconnect
      reconnectUser(userName, index, 5000);
    }
  }, [reconnectUser]);

  useEffect(() => {
    console.log("🚀 Initializing connections for users:", userNames);

    // Clear seen messages when users change
    seenMessagesRef.current.clear();
    setAllMessages([]);

    // Clear all reconnect timeouts
    Object.values(reconnectTimeoutsRef.current).forEach(timeout => {
      clearTimeout(timeout);
    });
    reconnectTimeoutsRef.current = {};

    // Connect all users
    userNames.forEach((userName, index) => {
      connectUser(userName, index);
    });

    // Cleanup function
    return () => {
      console.log("🧹 Cleaning up connections...");

      // Clear all reconnect timeouts
      Object.values(reconnectTimeoutsRef.current).forEach(timeout => {
        clearTimeout(timeout);
      });
      reconnectTimeoutsRef.current = {};

      // Close all connections
      Object.entries(socketsRef.current).forEach(([userName, ws]) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            const leaveMessage = {
              action: "leave",
              room: roomId
            };
            ws.send(JSON.stringify(leaveMessage));
            ws.close(1000, "Component unmounting"); // Normal closure
          } catch (error) {
            console.error(`Error cleaning up ${userName}:`, error);
          }
        }
      });
      socketsRef.current = {};
    };
  }, [userNames.join(','), connectUser]);

  // Manual reconnect function
  const manualReconnect = useCallback((userName: string) => {
    const index = userNames.indexOf(userName);
    if (index !== -1) {
      connectUser(userName, index);
    }
  }, [userNames, connectUser]);

  const sendMessage = (fromUser: string, text: string) => {
    const ws = socketsRef.current[fromUser];
    if (!ws) {
      console.error(`❌ No WebSocket found for ${fromUser}`);
      return;
    }

    if (ws.readyState !== WebSocket.OPEN) {
      console.error(`❌ ${fromUser} WebSocket not open. State: ${ws.readyState}`);
      return;
    }

    const messagePayload = {
      action: "message",
      room: roomId,
      type: "chat",
      payload: {
        text: text,
        user: fromUser
      },
      client_id: `client-${fromUser}-${Date.now()}`
    };

    console.log(`📤 ${fromUser} sending message:`, messagePayload);
    try {
      ws.send(JSON.stringify(messagePayload));
    } catch (error) {
      console.error(`❌ Failed to send message from ${fromUser}:`, error);
    }
  };

  return {
    messages: allMessages,
    sendMessage,
    connections,
    userNames,
    manualReconnect // Expose manual reconnect function
  };
}

// Original single-user hook (for backwards compatibility)
export function useChatSocket(userName: string, port: string = "8080") {
  const [messages, setMessages] = useState<any[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const socketRef = useRef<WebSocket | null>(null);
  const roomId = "general";

  useEffect(() => {
    setConnectionStatus('connecting');
    const ws = new WebSocket(`ws://localhost:${port}/ws?token=user:${userName}`);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setConnectionStatus('connected');
      const joinMessage = {
        action: "join",
        room: roomId
      };
      ws.send(JSON.stringify(joinMessage));
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        console.log("Received message:", parsed);
        if (parsed.type === "chat" || parsed.type === "user") {
          setMessages((prev) => [...prev, {
            type: "user",
            user: parsed.payload?.user || "Unknown",
            text: parsed.payload?.text || parsed.text || "Empty message",
            timestamp: parsed.created_at || parsed.timestamp || Date.now()
          }]);
        } else {
          setMessages((prev) => [...prev, {
            type: "system",
            text: JSON.stringify(parsed),
            timestamp: Date.now()
          }]);
        }
      } catch (error) {
        console.error("Failed to parse message:", error);
        setMessages((prev) => [...prev, {
          type: "system",
          text: event.data,
          timestamp: Date.now()
        }]);
      }
    };

    ws.onclose = (event) => {
      console.log("Socket closed:", event.code, event.reason);
      setConnectionStatus('disconnected');
    };

    ws.onerror = (err) => {
      console.error("Socket error:", err);
      setConnectionStatus('disconnected');
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        const leaveMessage = {
          action: "leave",
          room: roomId
        };
        ws.send(JSON.stringify(leaveMessage));
      }
      ws.close();
    };
  }, [userName, port]);

  const sendMessage = (text: string) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.error("WebSocket not connected");
      return;
    }

    const messagePayload = {
      action: "message",
      room: roomId,
      type: "chat",
      payload: {
        text: text,
        user: userName
      },
      client_id: `client-${Date.now()}-${Math.random()}`
    };

    console.log("Sending message:", messagePayload);
    socketRef.current.send(JSON.stringify(messagePayload));
  };

  return {
    messages,
    sendMessage,
    connectionStatus,
    isConnected: connectionStatus === 'connected'
  };
}
