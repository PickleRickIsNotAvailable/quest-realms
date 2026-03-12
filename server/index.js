// ============================================================
// Quest Realms - Server
// Real-time multiplayer DnD game with MANUAL ChatGPT flow
// GM copies prompts to ChatGPT and pastes responses back
// ============================================================

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { DiceSystem } = require('./dice-system');
const { GameState } = require('./game-state');
const { PromptBuilder } = require('./prompt-builder');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Store active game rooms
const rooms = new Map();

// ============================================================
// Socket.IO Connection Handling
// ============================================================
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // ----------------------------------------------------------
  // CREATE ROOM
  // ----------------------------------------------------------
  socket.on('create-room', (data, callback) => {
    const roomCode = generateRoomCode();
    const room = new GameState(roomCode, socket.id, data.playerName);
    rooms.set(roomCode, room);
    socket.join(roomCode);
    
    callback({ 
      success: true, 
      roomCode, 
      playerId: socket.id,
      isGM: true
    });
    
    console.log(`Room ${roomCode} created by ${data.playerName}`);
  });

  // ----------------------------------------------------------
  // JOIN ROOM
  // ----------------------------------------------------------
  socket.on('join-room', (data, callback) => {
    const room = rooms.get(data.roomCode?.toUpperCase());
    
    if (!room) {
      return callback({ success: false, error: 'Room not found!' });
    }
    if (room.phase !== 'lobby' && room.phase !== 'character-creation') {
      return callback({ success: false, error: 'Game already in progress!' });
    }
    if (room.players.size >= 8) {
      return callback({ success: false, error: 'Room is full! (max 8 players)' });
    }

    room.addPlayer(socket.id, data.playerName);
    socket.join(data.roomCode.toUpperCase());
    
    callback({ 
      success: true, 
      roomCode: data.roomCode.toUpperCase(),
      playerId: socket.id,
      isGM: false
    });

    // Notify all players in the room
    io.to(data.roomCode.toUpperCase()).emit('player-joined', {
      players: room.getPlayerList(),
      playerName: data.playerName
    });
    
    console.log(`${data.playerName} joined room ${data.roomCode}`);
  });

  // ----------------------------------------------------------
  // SET STORY PREMISE (GM only)
  // ----------------------------------------------------------
  socket.on('set-premise', (data) => {
    const room = rooms.get(data.roomCode);
    if (!room || room.gmId !== socket.id) return;
    
    room.premise = data.premise;
    room.setting = data.setting || 'fantasy';
    room.phase = 'character-creation';
    
    io.to(data.roomCode).emit('phase-changed', {
      phase: 'character-creation',
      premise: data.premise,
      setting: data.setting
    });
  });

  // ----------------------------------------------------------
  // SUBMIT CHARACTER
  // ----------------------------------------------------------
  socket.on('submit-character', (data) => {
    const room = rooms.get(data.roomCode);
    if (!room) return;
    
    const player = room.players.get(socket.id);
    if (!player) return;

    player.character = {
      name: data.character.name,
      race: data.character.race,
      class: data.character.class,
      backstory: data.character.backstory,
      traits: data.character.traits || [],
      skills: data.character.skills || [],
      equipment: data.character.equipment || [],
      hp: 100,
      maxHp: 100,
      alive: true,
      perkPoints: 0,
      level: 1,
      xp: 0,
      negativeTrait: assignNegativeTrait()  // SECRET — never shown to players
    };
    player.characterReady = true;

    // Assign starting equipment stats
    assignEquipmentStats(player.character);

    // Strip secret negative trait before broadcasting
    const { negativeTrait, ...safeCharacter } = player.character;
    io.to(data.roomCode).emit('character-submitted', {
      playerId: socket.id,
      playerName: player.name,
      character: safeCharacter,
      allReady: room.allCharactersReady()
    });
  });

  // ----------------------------------------------------------
  // START GAME (GM only) — generates prompt for GM to copy
  // ----------------------------------------------------------
  socket.on('start-game', (data) => {
    const room = rooms.get(data.roomCode);
    if (!room || room.gmId !== socket.id) return;
    if (!room.allCharactersReady()) return;

    room.phase = 'playing';
    room.round = 1;

    io.to(data.roomCode).emit('phase-changed', { phase: 'playing' });

    // Build the opening prompt for the GM to copy to ChatGPT
    const prompt = PromptBuilder.buildOpeningPrompt(room);

    // Send prompt ONLY to the GM
    socket.emit('gm-prompt', {
      type: 'opening',
      prompt: prompt,
      instructions: [
        'Copy the prompt below (tap the Copy button)',
        'Open ChatGPT and paste it in',
        'Copy the ENTIRE response from ChatGPT',
        'Paste it in the response box below and hit Send'
      ]
    });

    // Tell players to wait
    io.to(data.roomCode).emit('loading-story', {
      message: 'The Game Master is consulting ChatGPT... \uD83D\uDD2E'
    });
  });

  // ----------------------------------------------------------
  // GM SUBMITS CHATGPT RESPONSE (pasted from ChatGPT)
  // ----------------------------------------------------------
  socket.on('gm-submit-response', (data) => {
    const room = rooms.get(data.roomCode);
    if (!room || room.gmId !== socket.id) return;

    let parsed;
    try {
      parsed = parseAIResponse(data.response);
    } catch (err) {
      socket.emit('gm-parse-error', {
        error: 'Could not read ChatGPT\'s response. Make sure you copied the entire response including the { } brackets.\n\nError: ' + err.message
      });
      return;
    }

    if (data.type === 'opening') {
      // Store narrative
      room.storyLog.push({
        type: 'narrative',
        text: parsed.narrative,
        round: room.round,
        timestamp: Date.now()
      });

      // Add NPCs
      if (parsed.npcs && parsed.npcs.length > 0) {
        parsed.npcs.forEach(npc => room.addNPC(npc));
      }

      io.to(data.roomCode).emit('story-update', {
        narrative: parsed.narrative,
        npcs: room.getNPCList(),
        round: room.round,
        waitingFor: room.getAlivePlayers().map(p => p.name),
        players: sanitizePlayerList(room.getPlayerList())
      });

    } else if (data.type === 'round') {
      // Apply HP changes
      if (parsed.hpChanges) {
        parsed.hpChanges.forEach(change => {
          const player = findPlayerByCharName(room, change.character);
          if (player) {
            player.character.hp = Math.max(0, Math.min(player.character.maxHp, player.character.hp + change.amount));
            if (player.character.hp <= 0) {
              player.character.alive = false;
              player.character.hp = 0;
            }
          }
          const npc = room.npcs.find(n => n.name === change.character);
          if (npc) {
            npc.hp = Math.max(0, Math.min(npc.maxHp, npc.hp + change.amount));
            if (npc.hp <= 0) npc.alive = false;
          }
        });
      }

      // Award XP
      if (parsed.xpAwards) {
        parsed.xpAwards.forEach(award => {
          const player = findPlayerByCharName(room, award.character);
          if (player) {
            player.character.xp += award.amount;
            const newLevel = Math.floor(player.character.xp / 100) + 1;
            if (newLevel > player.character.level) {
              player.character.perkPoints += (newLevel - player.character.level);
              player.character.level = newLevel;
            }
          }
        });
      }

      // Add new NPCs
      if (parsed.newNpcs) {
        parsed.newNpcs.forEach(npc => room.addNPC(npc));
      }

      // Log story
      room.storyLog.push({
        type: 'narrative',
        text: parsed.narrative,
        round: room.round,
        timestamp: Date.now()
      });

      // Advance round
      room.round++;
      const diceResults = room.lastDiceResults || [];
      room.roundActions.clear();
      room.lastDiceResults = null;

      // Check game over
      const alivePlayers = room.getAlivePlayers();
      if (alivePlayers.length === 0) {
        room.phase = 'game-over';
        io.to(data.roomCode).emit('game-over', {
          narrative: parsed.narrative + '\n\n☠️ All survivors have fallen...',
          players: sanitizePlayerList(room.getPlayerList())
        });
        return;
      }

      io.to(data.roomCode).emit('story-update', {
        narrative: parsed.narrative,
        npcs: room.getNPCList(),
        round: room.round,
        waitingFor: alivePlayers.map(p => p.name),
        players: sanitizePlayerList(room.getPlayerList()),
        diceResults: diceResults
      });
    }
  });

  // ----------------------------------------------------------
  // SUBMIT ACTION (player response each round)
  // ----------------------------------------------------------
  socket.on('submit-action', (data) => {
    const room = rooms.get(data.roomCode);
    if (!room || room.phase !== 'playing') return;
    
    const player = room.players.get(socket.id);
    if (!player || !player.character.alive) return;
    if (room.roundActions.has(socket.id)) return;

    const dice = new DiceSystem();
    const diceRoll = dice.rollD20();
    const weaponDamage = dice.rollWeaponDamage(player.character.equipment);

    const action = {
      playerId: socket.id,
      playerName: player.name,
      character: player.character,
      action: data.action,
      diceRoll: diceRoll,
      weaponDamage: weaponDamage,
      timestamp: Date.now()
    };

    room.roundActions.set(socket.id, action);

    io.to(data.roomCode).emit('action-submitted', {
      playerName: player.name,
      diceRoll: diceRoll,
      weaponDamage: weaponDamage,
      waitingFor: room.getWaitingPlayers().map(p => p.name),
      allSubmitted: room.allActionsSubmitted()
    });

    // If all submitted, generate prompt for GM
    if (room.allActionsSubmitted()) {
      const actions = Array.from(room.roundActions.values());

      // Store dice results for later broadcast
      room.lastDiceResults = actions.map(a => ({
        playerName: a.playerName,
        diceRoll: a.diceRoll,
        weaponDamage: a.weaponDamage
      }));

      const prompt = PromptBuilder.buildRoundPrompt(room, actions);

      // Send prompt only to GM
      const gmSocket = io.sockets.sockets.get(room.gmId);
      if (gmSocket) {
        gmSocket.emit('gm-prompt', {
          type: 'round',
          prompt: prompt,
          instructions: [
            'All players have submitted their actions!',
            'Copy the prompt below (tap the Copy button)',
            'Paste it into your SAME ChatGPT conversation',
            'Copy ChatGPT\'s ENTIRE response, paste below and hit Send'
          ]
        });
      }

      // Tell players to wait
      io.to(data.roomCode).emit('loading-story', {
        message: 'All actions in! The Game Master is consulting ChatGPT... \uD83C\uDFB2'
      });
    }
  });

  // ----------------------------------------------------------
  // SPEND PERK POINT
  // ----------------------------------------------------------
  socket.on('spend-perk', (data) => {
    const room = rooms.get(data.roomCode);
    if (!room) return;
    
    const player = room.players.get(socket.id);
    if (!player || player.character.perkPoints <= 0) return;

    const skill = getRandomSkill(player.character);
    player.character.skills.push(skill);
    player.character.perkPoints--;

    io.to(data.roomCode).emit('perk-gained', {
      playerName: player.name,
      skill: skill,
      character: player.character
    });
  });

  // ----------------------------------------------------------
  // DISCONNECT
  // ----------------------------------------------------------
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    // Find and update rooms this player was in
    rooms.forEach((room, roomCode) => {
      if (room.players.has(socket.id)) {
        const player = room.players.get(socket.id);
        player.connected = false;
        
        io.to(roomCode).emit('player-disconnected', {
          playerName: player.name,
          players: sanitizePlayerList(room.getPlayerList())
        });

        // If all players disconnected, clean up after 5 min
        if (room.allDisconnected()) {
          setTimeout(() => {
            if (rooms.has(roomCode) && rooms.get(roomCode).allDisconnected()) {
              rooms.delete(roomCode);
              console.log(`Room ${roomCode} cleaned up`);
            }
          }, 300000);
        }
      }
    });
  });

  // ----------------------------------------------------------
  // RECONNECT
  // ----------------------------------------------------------
  socket.on('reconnect-player', (data, callback) => {
    const room = rooms.get(data.roomCode);
    if (!room) return callback({ success: false });

    // Find player by name
    let foundId = null;
    room.players.forEach((player, id) => {
      if (player.name === data.playerName && !player.connected) {
        foundId = id;
      }
    });

    if (!foundId) return callback({ success: false });

    // Transfer player data to new socket
    const playerData = room.players.get(foundId);
    room.players.delete(foundId);
    playerData.connected = true;
    room.players.set(socket.id, playerData);
    
    if (room.gmId === foundId) room.gmId = socket.id;
    
    socket.join(data.roomCode);
    
    const { negativeTrait: _nt, ...safeChar } = playerData.character || {};
    callback({
      success: true,
      playerId: socket.id,
      isGM: room.gmId === socket.id,
      phase: room.phase,
      character: playerData.character ? safeChar : null,
      storyLog: room.storyLog.slice(-10),
      players: sanitizePlayerList(room.getPlayerList()),
      npcs: room.getNPCList(),
      round: room.round
    });
  });
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Strip secret data before sending to clients
function sanitizePlayerList(playerList) {
  return playerList.map(p => {
    if (!p.character) return p;
    const { negativeTrait, ...safeChar } = p.character;
    return { ...p, character: safeChar };
  });
}

function findPlayerByCharName(room, charName) {
  for (const [, player] of room.players) {
    if (player.character && player.character.name.toLowerCase() === charName.toLowerCase()) {
      return player;
    }
  }
  return null;
}

function parseAIResponse(text) {
  let cleaned = text.trim();
  
  // Extract JSON from markdown code blocks
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }
  
  // Find JSON object in the text
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }

  const parsed = JSON.parse(cleaned);
  
  if (!parsed.narrative) {
    throw new Error('Response is missing the "narrative" field.');
  }
  
  return parsed;
}

function assignEquipmentStats(character) {
  const weaponStats = {
    'dagger': { minDmg: 1, maxDmg: 4, type: 'melee' },
    'knife': { minDmg: 1, maxDmg: 4, type: 'melee' },
    'baseball bat': { minDmg: 2, maxDmg: 8, type: 'melee' },
    'battle axe': { minDmg: 4, maxDmg: 10, type: 'melee' },
    'bow': { minDmg: 2, maxDmg: 8, type: 'ranged' },
    'crossbow': { minDmg: 3, maxDmg: 10, type: 'ranged' },
    'pistol': { minDmg: 5, maxDmg: 14, type: 'ranged' },
    'rifle': { minDmg: 6, maxDmg: 16, type: 'ranged' },
    'shotgun': { minDmg: 4, maxDmg: 20, type: 'ranged' },
    'fists': { minDmg: 1, maxDmg: 3, type: 'melee' }
  };

  character.equipmentStats = character.equipment.map(item => {
    const lower = item.toLowerCase();
    for (const [weapon, stats] of Object.entries(weaponStats)) {
      if (lower.includes(weapon)) {
        return { name: item, ...stats };
      }
    }
    return { name: item, minDmg: 0, maxDmg: 0, type: 'item' };
  });
}

// Secret negative traits — assigned randomly, hidden from players
const NEGATIVE_TRAITS = [
  'Coward — Freezes under pressure, more likely to fumble in danger',
  'Selfish — Instinctively prioritizes self over others, may hoard supplies',
  'Paranoid Wreck — Hears things that aren\'t there, trusts no one fully',
  'Short Fuse — Explosive temper, may lash out at allies under stress',
  'Addict — Craves substances, distracted and shaky without a fix',
  'Liar — Compulsive liar, NPCs are less likely to trust the group',
  'Kleptomaniac — Can\'t resist stealing, even from allies',
  'Reckless — Acts before thinking, puts the group in unnecessary danger',
  'Weak Stomach — Vomits/freezes at gore, useless in brutal situations',
  'Night Terrors — Screams in sleep, attracts unwanted attention at night',
  'Clumsy — Drops things, trips over debris, makes noise at the worst times',
  'Guilt-Ridden — Haunted by past actions, hesitates at critical moments',
  'Arrogant — Overestimates own ability, underestimates threats',
  'Bleeding Heart — Can\'t bring themselves to kill, even when necessary',
  'Superstitious — Refuses certain actions based on omens and bad luck signs',
  'Loud Mouth — Can\'t stay quiet, gives away position easily',
  'Injured Old Wound — A past injury flares up randomly, reducing mobility',
  'Distrustful — Refuses to cooperate fully, weakens group tactics',
  'Delusional — Occasionally hallucinates, sees threats that aren\'t real',
  'Claustrophobic — Panics in tight spaces, tunnels, or enclosed buildings'
];

function assignNegativeTrait() {
  return NEGATIVE_TRAITS[Math.floor(Math.random() * NEGATIVE_TRAITS.length)];
}

const RANDOM_SKILLS = [
  'Headshot', 'First Aid', 'Sprint', 'Barricade',
  'Silent Kill', 'Scavenger', 'Dual Wield', 'Iron Skin',
  'Adrenaline Rush', 'Trap Maker', 'Lockpicking', 'Intimidation',
  'Stealth', 'Acrobatics', 'Quick Draw', 'Sniper Shot',
  'Melee Mastery', 'Explosives', 'Field Medic', 'Night Vision',
  'Heavy Hitter', 'Dodge Roll', 'Armor Up', 'Berserker Rage',
  'Eagle Eye', 'Steady Hands', 'Last Stand', 'Survival Instinct',
  'Molotov Craft', 'Distraction', 'Counter Attack', 'Second Wind'
];

function getRandomSkill(character) {
  const available = RANDOM_SKILLS.filter(s => !character.skills.includes(s));
  if (available.length === 0) return 'Mastery (+5 all stats)';
  return available[Math.floor(Math.random() * available.length)];
}

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n⚔️  Quest Realms server running on http://localhost:${PORT}\n`);
});
