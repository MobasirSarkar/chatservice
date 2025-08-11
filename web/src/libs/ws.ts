export function connectWs() {
	const ws = new WebSocket("ws://localhost:8080/ws?token=user:mobasir");
	ws.onopen = () => console.log("Connected to WS");
	ws.onmessage = (e) => console.log("msg:", JSON.parse(e.data));
	ws.onclose = () => console.log("WS closed");
	return ws;
}
