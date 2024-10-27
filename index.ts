import type { ServerWebSocket } from "bun";

interface Lobby {
  lobbyId: string;
  usersConnected: number;
  user1: ServerWebSocket<{
    socketId: string;
  }> | null;
  user2: ServerWebSocket<{
    socketId: string;
  }> | null;
  user1ID: string | null;
  user2ID: string | null;
  ended: boolean;
}

let lobbies: Lobby[] = [];

const server = Bun.serve<{ socketId: string }>({
  port: 5000,
  async fetch(req, server) {
    const socketIdGEN = crypto.randomUUID().split("-")[0];

    const upgraded = server.upgrade(req, {
      data: {
        socketId: socketIdGEN,
      },
    });
    if (upgraded) return undefined;
  },
  websocket: {
    open(ws) {
      console.log("Socket opened");
    },
    message(ws, message) {
      const parsedMessage = JSON.parse(message as string);
      switch (parsedMessage.ev) {
        case "choseName":
          const lobby = lobbies.find(
            (lobby) => lobby.lobbyId == parsedMessage.lobbyId
          );

          const registerTeam1 = {
            ev: "registerTeam1",
            data: parsedMessage.name,
          };

          if (!lobby) {
            ws.subscribe(parsedMessage.lobbyId);
            lobbies.push({
              lobbyId: parsedMessage.lobbyId,
              usersConnected: 1,
              user1: ws,
              user2: null,
              user1ID: parsedMessage.name,
              user2ID: null,
              ended: false,
            });
            ws.send(JSON.stringify(registerTeam1));
            return;
          }

          if (lobby.usersConnected >= 2) return;

          ws.subscribe(parsedMessage.lobbyId);
          lobby.usersConnected++;
          lobby.user2 = ws;
          lobby.user2ID = parsedMessage.name;

          const registerTeam2 = {
            ev: "registerTeam2",
            data: parsedMessage.name,
          };

          lobby.user1?.send(JSON.stringify(registerTeam2));
          lobby.user2.send(
            JSON.stringify({ ev: "registerTeam1", data: lobby.user1ID })
          );
          ws.send(JSON.stringify(registerTeam2));

          const data = { ev: "startGame" };
          lobby.user1?.send(JSON.stringify(data));
          lobby.user2?.send(JSON.stringify(data));
          break;

        case "mapAction": {
          const lobby = lobbies.find(
            (lobby) => lobby.lobbyId == parsedMessage.lobbyId
          );
          if (!lobby) return;

          const message = { ev: "mapAction", mapId: parsedMessage.mapId };

          if (parsedMessage.teamAction == lobby.user1ID) {
            lobby.user2?.send(JSON.stringify(message));
          } else if (parsedMessage.teamAction == lobby.user2ID) {
            lobby.user1?.send(JSON.stringify(message));
          } else {
            lobby.user1?.send(JSON.stringify(message));
            lobby.user2?.send(JSON.stringify(message));
          }
          break;
        }
        case "resetGame": {
          const foundLobby = lobbies.find(
            (lobby) => lobby.lobbyId == parsedMessage.lobbyId
          );
          if (!foundLobby) return;

          lobbies = lobbies.filter((lobby) => {
            lobby.lobbyId != foundLobby?.lobbyId;
          });
          break;
        }
        case "checkVetoUpload": {
          const foundLobby = lobbies.find(
            (lobby) => lobby.lobbyId == parsedMessage.lobbyId
          );
          if (!foundLobby) return;
          if (foundLobby.ended) return;
          foundLobby.ended = true;
          ws.send(JSON.stringify({ ev: "checkedVetoUpload" }));
        }
      }
    },
    close(ws) {
      console.log("Socket closed");
    },
  },
});

console.log(`Listening on ${server.hostname}:${server.port}`);
