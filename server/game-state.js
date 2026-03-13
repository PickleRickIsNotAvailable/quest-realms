// ============================================================
// Game State Management
// ============================================================

class GameState {
  constructor(roomCode, gmSocketId, gmName) {
    this.roomCode = roomCode;
    this.gmId = gmSocketId;
    this.phase = 'lobby'; // lobby -> character-creation -> playing -> game-over
    this.premise = '';
    this.setting = 'zombie-survival';
    this.round = 0;
    this.storyLog = [];
    this.roundActions = new Map();
    this.npcs = [];
    
    // Players map: socketId -> player data
    this.players = new Map();
    this.players.set(gmSocketId, {
      name: gmName,
      isGM: true,
      connected: true,
      characterReady: false,
      character: null
    });
  }

  addPlayer(socketId, name) {
    this.players.set(socketId, {
      name: name,
      isGM: false,
      connected: true,
      characterReady: false,
      character: null
    });
  }

  addNPC(npcData) {
    this.npcs.push({
      id: `npc_${this.npcs.length + 1}`,
      name: npcData.name,
      description: npcData.description || '',
      role: npcData.role || 'neutral', // friendly, hostile, neutral
      hp: npcData.hp || 50,
      maxHp: npcData.maxHp || 50,
      alive: true,
      equipment: npcData.equipment || [],
      traits: npcData.traits || []
    });
  }

  getPlayerList() {
    const list = [];
    this.players.forEach((player, id) => {
      list.push({
        id: id,
        name: player.name,
        isGM: player.isGM,
        connected: player.connected,
        characterReady: player.characterReady,
        character: player.character
      });
    });
    return list;
  }

  getNPCList() {
    return this.npcs.filter(n => n.alive);
  }

  getAlivePlayers() {
    const alive = [];
    this.players.forEach((player, id) => {
      if (!player.isGM && player.character && player.character.alive && player.connected) {
        alive.push({ ...player, id });
      }
    });
    return alive;
  }

  getWaitingPlayers() {
    const waiting = [];
    this.players.forEach((player, id) => {
      if (!player.isGM && player.character && player.character.alive && player.connected && !this.roundActions.has(id)) {
        waiting.push(player);
      }
    });
    return waiting;
  }

  allCharactersReady() {
    let count = 0;
    for (const [, player] of this.players) {
      if (player.isGM) continue;
      if (!player.characterReady) return false;
      count++;
    }
    return count > 0;
  }

  allActionsSubmitted() {
    for (const [id, player] of this.players) {
      if (!player.isGM && player.character && player.character.alive && player.connected) {
        if (!this.roundActions.has(id)) return false;
      }
    }
    return true;
  }

  allDisconnected() {
    for (const [, player] of this.players) {
      if (player.connected) return false;
    }
    return true;
  }
}

module.exports = { GameState };
