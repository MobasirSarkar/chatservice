import { useMultiChatSocket } from "@/hooks/useChatSocket";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute('/chat')({
  component: MultiUserChatTest,
});

function MultiUserChatTest() {
  // Test with 3 users connecting to different servers
  const testUsers = ["Alice", "Bob", "Charlie"];
  const { messages, sendMessage, connections, userNames } = useMultiChatSocket(testUsers);
  const [inputs, setInputs] = useState<{ [key: string]: string }>({});

  const handleSend = (userName: string) => {
    const text = inputs[userName];
    if (!text?.trim()) return;

    sendMessage(userName, text);
    setInputs(prev => ({ ...prev, [userName]: "" }));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'text-green-600 bg-green-50';
      case 'connecting': return 'text-yellow-600 bg-yellow-50';
      case 'disconnected': return 'text-red-600 bg-red-50';
      case 'error': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getPortForUser = (index: number) => {
    const ports = ["8080", "8081", "8082"];
    return ports[index % ports.length];
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-center">
        🚀 Multi-Server Chat Test
      </h1>

      <div className="mb-6 text-center text-sm text-gray-600">
        <p>Testing distributed chat: Alice→Server1(8080), Bob→Server2(8081), Charlie→Server3(8082)</p>
        <p className="mt-2 font-semibold">Send messages from any user - they should appear everywhere! 🎉</p>
      </div>

      {/* User Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {userNames.map((userName, index) => {
          const port = getPortForUser(index);
          const status = connections[userName]?.status || 'disconnected';
          const isConnected = status === 'connected';

          return (
            <div key={userName} className="border rounded-lg p-4 bg-white shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-lg">{userName}</h3>
                <div className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(status)}`}>
                  Server :{port} - {status}
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  value={inputs[userName] || ""}
                  onChange={(e) => setInputs(prev => ({
                    ...prev,
                    [userName]: e.target.value
                  }))}
                  placeholder={isConnected ? `${userName}, type message...` : "Connecting..."}
                  className={`flex-1 border rounded px-2 py-1 text-sm ${isConnected ? 'border-gray-300' : 'border-red-300 bg-red-50'
                    }`}
                  onKeyDown={(e) => e.key === "Enter" && handleSend(userName)}
                  disabled={!isConnected}
                />
                <button
                  onClick={() => handleSend(userName)}
                  disabled={!isConnected || !inputs[userName]?.trim()}
                  className={`px-3 py-1 rounded text-sm font-semibold ${isConnected && inputs[userName]?.trim()
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                >
                  Send
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Message History */}
      <div className="bg-white border rounded-lg p-4 shadow-sm">
        <h3 className="font-bold mb-3">📨 Message History (All Servers)</h3>
        <div className="h-96 overflow-y-auto border p-3 rounded bg-gray-50">
          {messages.length === 0 && (
            <div className="text-gray-400 italic text-center">
              No messages yet. Send a message from any user to test cross-server communication!
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className="mb-2">
              {msg.type === "system" ? (
                <div className="text-sm text-gray-500 italic bg-blue-50 p-2 rounded border-l-4 border-blue-200">
                  🔧 {msg.text}
                  <span className="text-xs text-gray-400 ml-2">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ) : (
                <div className="bg-white p-3 rounded shadow-sm border-l-4 border-green-400">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-semibold text-blue-600">{msg.user}</span>: {msg.text}
                    </div>
                    <div className="text-xs text-gray-400 text-right">
                      <div>Server :{msg.server}</div>
                      <div>{new Date(msg.timestamp).toLocaleTimeString()}</div>
                      {msg.receivedBy && <div>→ {msg.receivedBy}</div>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Testing Instructions */}
      <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="font-bold text-yellow-800 mb-2">🧪 Testing Instructions:</h3>
        <div className="text-sm text-yellow-700 space-y-1">
          <p>1. <strong>Make sure all 3 servers are running:</strong> server1(:8080), server2(:8081), server3(:8082)</p>
          <p>2. <strong>Wait for all users to show "connected"</strong></p>
          <p>3. <strong>Send message from Alice</strong> → Should appear in all message history</p>
          <p>4. <strong>Send message from Bob</strong> → Should also appear everywhere</p>
          <p>5. <strong>Kill server1 (Ctrl+C)</strong> → Alice disconnects, but Bob & Charlie still work!</p>
          <p>6. <strong>Send message from Bob/Charlie</strong> → Should still work between remaining servers</p>
          <p>7. <strong>Restart server1</strong> → Alice can reconnect and rejoin the conversation!</p>
        </div>
      </div>
    </div>
  );
}
