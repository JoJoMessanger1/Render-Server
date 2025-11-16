const WebSocket = require('ws');
const http = require('http');

// WICHTIG: Render verwendet die Umgebungsvariable PORT
const PORT = process.env.PORT || 8080;

// Erstelle einen einfachen HTTP-Server
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WebRTC Signaling Server is running.\n');
});

// Erstelle den WebSocket-Server über dem HTTP-Server
const wss = new WebSocket.Server({ server });

// Speichert alle verbundenen Clients (Peers) in einem Raum
// Struktur: { roomId: { peerId: { ws: WebSocket, name: string } } }
const rooms = {};

// Funktion zum Senden der aktuellen Peer-Liste an alle im Raum
function broadcastPeerList(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    // Erstelle eine Liste der Peers (nur ID und Name)
    const peers = Object.keys(room).map(peerId => ({
        id: peerId,
        name: room[peerId].name
    }));

    const message = JSON.stringify({
        type: 'peer_list',
        peers: peers
    });

    // Sende die Liste an alle verbundenen Clients im Raum
    Object.values(room).forEach(peer => {
        if (peer.ws.readyState === WebSocket.OPEN) {
            peer.ws.send(message);
        }
    });
    console.log(`[ROOM ${roomId}] Peer list broadcasted. Count: ${peers.length}`);
}

wss.on('connection', (ws) => {
    let currentRoomId = null;
    let currentPeerId = null;

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        // 1. BEITRETEN (JOIN)
        if (data.type === 'join') {
            currentRoomId = data.room;
            currentPeerId = data.id;

            if (!rooms[currentRoomId]) {
                rooms[currentRoomId] = {};
            }

            // Füge den neuen Peer dem Raum hinzu
            rooms[currentRoomId][currentPeerId] = { ws: ws, name: data.name };
            console.log(`[JOIN] ${data.name} (${currentPeerId}) joined room: ${currentRoomId}`);

            // Informiere alle über den neuen Peer
            broadcastPeerList(currentRoomId);
            return;
        }

        // 2. NACHRICHTEN WEITERLEITEN (OFFER, ANSWER, CANDIDATE)
        if (data.targetId && rooms[currentRoomId]) {
            const targetPeer = rooms[currentRoomId][data.targetId];

            if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
                // Füge die Absender-ID hinzu und leite die Nachricht weiter
                data.id = currentPeerId;
                targetPeer.ws.send(JSON.stringify(data));
                // console.log(`[RELAY] ${data.type} from ${currentPeerId} to ${data.targetId}`);
            } else {
                console.warn(`Target peer ${data.targetId} not found or not open.`);
            }
        }
    });

    ws.on('close', () => {
        if (currentRoomId && currentPeerId && rooms[currentRoomId]) {
            const peerName = rooms[currentRoomId][currentPeerId]?.name || 'Unknown';
            delete rooms[currentRoomId][currentPeerId];
            console.log(`[CLOSE] ${peerName} (${currentPeerId}) left room: ${currentRoomId}`);

            // Sende die aktualisierte Liste an alle verbleibenden Peers
            broadcastPeerList(currentRoomId);

            // Optional: Raum aufräumen, wenn leer
            if (Object.keys(rooms[currentRoomId]).length === 0) {
                delete rooms[currentRoomId];
                console.log(`[CLEANUP] Room ${currentRoomId} deleted.`);
            }
        }
    });

    ws.on('error', (error) => {
        console.error(`WebSocket Error for ${currentPeerId}:`, error.message);
    });
});

// Starte den HTTP-Server
server.listen(PORT, () => {
    console.log(`Signaling Server gestartet auf Port ${PORT}`);
});
