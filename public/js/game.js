// ============================================================
// Quest Realms - Client Game Logic
// ============================================================

const socket = io();

// ---- Global State ----
const state = {
  playerId: null,
  playerName: '',
  roomCode: '',
  isGM: false,
  phase: 'title',
  character: null,
  selectedSetting: 'zombie-survival',
  myPerkPoints: 0,
  currentPromptType: null,  // 'opening' or 'round' — tracks what GM is working on
  narratorEnabled: false
};

// ---- Session persistence ----
function saveSession() {
  try {
    localStorage.setItem('qr_session', JSON.stringify({
      roomCode: state.roomCode,
      playerName: state.playerName,
      isGM: state.isGM
    }));
  } catch (_) { /* localStorage unavailable */ }
}

function getSavedSession() {
  try {
    const raw = localStorage.getItem('qr_session');
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function clearSession() {
  try { localStorage.removeItem('qr_session'); } catch (_) {}
}

// ---- DOM Elements ----
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Screens
const screens = {
  title: $('#screen-title'),
  lobby: $('#screen-lobby'),
  character: $('#screen-character'),
  game: $('#screen-game'),
  gameover: $('#screen-gameover')
};

// ============================================================
// SCREEN MANAGEMENT
// ============================================================
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
  state.phase = name;
}

// ============================================================
// TITLE SCREEN
// ============================================================
const playerNameInput = $('#player-name');
const roomCodeInput = $('#room-code-input');
const btnCreate = $('#btn-create-room');
const btnJoin = $('#btn-join-room');
const titleError = $('#title-error');

// Enable/disable buttons based on input
playerNameInput.addEventListener('input', () => {
  const hasName = playerNameInput.value.trim().length >= 2;
  btnCreate.disabled = !hasName;
  btnJoin.disabled = !hasName || roomCodeInput.value.trim().length < 5;
});

roomCodeInput.addEventListener('input', () => {
  roomCodeInput.value = roomCodeInput.value.toUpperCase();
  const hasName = playerNameInput.value.trim().length >= 2;
  btnJoin.disabled = !hasName || roomCodeInput.value.trim().length < 5;
});

// Create Room
btnCreate.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  if (!name) return;
  
  btnCreate.disabled = true;
  titleError.textContent = '';
  
  socket.emit('create-room', { playerName: name }, (res) => {
    if (res.success) {
      state.playerId = res.playerId;
      state.playerName = name;
      state.roomCode = res.roomCode;
      state.isGM = true;
      saveSession();
      enterLobby();
    } else {
      titleError.textContent = res.error || 'Failed to create room';
      btnCreate.disabled = false;
    }
  });
});

// Join Room
btnJoin.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  const code = roomCodeInput.value.trim().toUpperCase();
  if (!name || !code) return;
  
  btnJoin.disabled = true;
  titleError.textContent = '';
  
  socket.emit('join-room', { playerName: name, roomCode: code }, (res) => {
    if (res.success) {
      state.playerId = res.playerId;
      state.playerName = name;
      state.roomCode = res.roomCode;
      state.isGM = res.isGM || false;
      saveSession();

      if (res.rejoin) {
        handleRejoin(res);
      } else {
        enterLobby();
      }
    } else {
      titleError.textContent = res.error || 'Failed to join room';
      btnJoin.disabled = false;
    }
  });
});

// ============================================================
// LOBBY
// ============================================================
function enterLobby() {
  showScreen('lobby');
  $('#display-room-code').textContent = state.roomCode;
  
  if (state.isGM) {
    $('#gm-setup').classList.remove('hidden');
    $('#waiting-for-gm').classList.add('hidden');
  } else {
    $('#gm-setup').classList.add('hidden');
    $('#waiting-for-gm').classList.remove('hidden');
  }
  
  updateLobbyPlayers([{ name: state.playerName, isGM: state.isGM, connected: true }]);
}

function updateLobbyPlayers(players) {
  const container = $('#lobby-players');
  container.innerHTML = players.map(p => `
    <div class="player-card">
      <div class="player-avatar">${getPlayerEmoji(p.name)}</div>
      <span class="player-name">${escapeHtml(p.name)}</span>
      ${p.isGM ? '<span class="gm-badge">GM</span>' : ''}
      ${!p.connected ? '<span style="color: var(--danger); font-size:0.8rem;">disconnected</span>' : ''}
    </div>
  `).join('');
}

// Setting is hardcoded to zombie-survival

// Premise input
const premiseInput = $('#premise-input');
const btnSetPremise = $('#btn-set-premise');

premiseInput.addEventListener('input', () => {
  btnSetPremise.disabled = premiseInput.value.trim().length < 10;
});

btnSetPremise.addEventListener('click', () => {
  const premise = premiseInput.value.trim();
  if (!premise) return;
  
  socket.emit('set-premise', {
    roomCode: state.roomCode,
    premise: premise,
    setting: state.selectedSetting
  });
});

// ============================================================
// CHARACTER CREATION
// ============================================================
const charNameInput = $('#char-name');
const charBackstoryInput = $('#char-backstory');
const btnSubmitChar = $('#btn-submit-character');

let selectedRace = '';
let selectedClass = '';
let selectedTraits = [];
let selectedEquipment = [];
let selectedLocation = '';

// ---- Setting-specific options ----
const SETTING_OPTIONS = {
  'zombie-survival': {
    races: [
      { value: 'Human', label: '🧑 Human' }
    ],
    classes: [
      { value: 'Ex-Soldier', label: '🎖️ Ex-Soldier' },
      { value: 'Medic', label: '💉 Medic' },
      { value: 'Scout', label: '🏃 Scout' },
      { value: 'Mechanic', label: '🔧 Mechanic' },
      { value: 'Sharpshooter', label: '🎯 Sharpshooter' },
      { value: 'Brawler', label: '👊 Brawler' },
      { value: 'Survivalist', label: '🏕️ Survivalist' },
      { value: 'Leader', label: '📣 Leader' },
      { value: 'Hunter', label: '🦌 Hunter' },
      { value: 'Scavenger', label: '🔍 Scavenger' }
    ],
    traits: [
      { value: 'Brave', label: '💪 Brave' },
      { value: 'Cunning', label: '🧠 Cunning' },
      { value: 'Stealthy', label: '🌙 Stealthy' },
      { value: 'Lucky', label: '🍀 Lucky' },
      { value: 'Ruthless', label: '🔥 Ruthless' },
      { value: 'Paranoid', label: '👁️ Paranoid' },
      { value: 'Cold-blooded', label: '🧊 Cold-blooded' },
      { value: 'Resourceful', label: '🛠️ Resourceful' },
      { value: 'Fast', label: '⚡ Fast' },
      { value: 'Tough', label: '🦴 Tough' },
      { value: 'Calm Under Pressure', label: '🧘 Calm Under Pressure' },
      { value: 'Protective', label: '🛡️ Protective' }
    ],
    equipment: [
      { value: 'Knife', label: '🗡️ Knife' },
      { value: 'Axe', label: '🪓 Axe' },
      { value: 'Baseball Bat', label: '🏏 Baseball Bat' },
      { value: 'Machete', label: '⚔️ Machete' },
      { value: 'Pistol', label: '🔫 Pistol' },
      { value: 'Shotgun', label: '💥 Shotgun' },
      { value: 'Rifle', label: '🎯 Rifle' },
      { value: 'Crossbow', label: '🏹 Crossbow' },
      { value: 'Med Kit', label: '🧪 Med Kit' },
      { value: 'Flashlight', label: '🔦 Flashlight' },
      { value: 'Molotov Cocktail', label: '🔥 Molotov Cocktail' },
      { value: 'Backpack', label: '🎒 Backpack' }
    ],
    locations: [
      { value: 'Johannesburg CBD', label: '🏙️ Johannesburg CBD' },
      { value: 'Soweto', label: '🏘️ Soweto' },
      { value: 'Cape Town Waterfront', label: '⛵ Cape Town Waterfront' },
      { value: 'Durban Beachfront', label: '🏖️ Durban Beachfront' },
      { value: 'Pretoria', label: '🏛️ Pretoria' },
      { value: 'Kruger National Park', label: '🦁 Kruger National Park' },
      { value: 'Table Mountain', label: '⛰️ Table Mountain' },
      { value: 'Sandton', label: '💼 Sandton' },
      { value: 'Khayelitsha', label: '🏚️ Khayelitsha' },
      { value: 'Bloemfontein', label: '🌻 Bloemfontein' }
    ]
  }
};

// Populate pill selectors based on setting
function populateCharacterOptions(setting) {
  const options = SETTING_OPTIONS['zombie-survival'];

  // Reset selections
  selectedRace = '';
  selectedClass = '';
  selectedTraits = [];
  selectedEquipment = [];
  selectedLocation = '';

  function renderPills(containerId, items) {
    const container = $(`#${containerId}`);
    container.innerHTML = items.map(item =>
      `<button type="button" class="pill" data-value="${item.value}">${item.label}</button>`
    ).join('');
  }

  renderPills('race-selector', options.races);
  renderPills('class-selector', options.classes);
  renderPills('trait-selector', options.traits);
  renderPills('equipment-selector', options.equipment);
  renderPills('location-selector', options.locations);

  // Auto-select first race if only one option
  if (options.races.length === 1) {
    const firstPill = $('#race-selector .pill');
    firstPill.classList.add('selected');
    selectedRace = options.races[0].value;
  }

  checkCharacterReady();
}

// Single-select pill handlers (using event delegation)
function setupSingleSelect(containerId, callback) {
  $(`#${containerId}`).addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    
    $$(`#${containerId} .pill`).forEach(p => p.classList.remove('selected'));
    pill.classList.add('selected');
    callback(pill.dataset.value);
    checkCharacterReady();
  });
}

// Multi-select pill handlers (max 3, using event delegation)
function setupMultiSelect(containerId, getArray, max = 3) {
  const container = $(`#${containerId}`);
  if (!container) return;
  container.addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    
    const val = pill.dataset.value;
    const array = getArray();
    
    if (pill.classList.contains('selected')) {
      pill.classList.remove('selected');
      const idx = array.indexOf(val);
      if (idx > -1) array.splice(idx, 1);
    } else if (array.length < max) {
      pill.classList.add('selected');
      array.push(val);
    } else {
      showToast(`Max ${max} selections!`, 'info');
    }
    checkCharacterReady();
  });
}

setupSingleSelect('race-selector', (val) => { selectedRace = val; });
setupSingleSelect('class-selector', (val) => { selectedClass = val; });
setupSingleSelect('location-selector', (val) => { selectedLocation = val; });
setupMultiSelect('trait-selector', () => selectedTraits, 3);
setupMultiSelect('equipment-selector', () => selectedEquipment, 3);

charNameInput.addEventListener('input', checkCharacterReady);
charBackstoryInput.addEventListener('input', checkCharacterReady);

function checkCharacterReady() {
  const ready = charNameInput.value.trim().length >= 2
    && selectedRace
    && selectedClass
    && selectedLocation
    && charBackstoryInput.value.trim().length >= 10
    && selectedTraits.length > 0
    && selectedEquipment.length > 0;
  btnSubmitChar.disabled = !ready;
}

btnSubmitChar.addEventListener('click', () => {
  const character = {
    name: charNameInput.value.trim(),
    race: selectedRace,
    class: selectedClass,
    backstory: charBackstoryInput.value.trim(),
    traits: [...selectedTraits],
    equipment: [...selectedEquipment],
    location: selectedLocation
  };
  
  socket.emit('submit-character', {
    roomCode: state.roomCode,
    character: character
  });
  
  state.character = character;
  btnSubmitChar.disabled = true;
  btnSubmitChar.textContent = '✅ Character Locked!';
  btnSubmitChar.style.opacity = '0.6';
  $('#character-waiting').classList.remove('hidden');
  
  // Disable all inputs
  charNameInput.disabled = true;
  charBackstoryInput.disabled = true;
  $$('.pill').forEach(p => p.style.pointerEvents = 'none');
});

// Start Game button (GM only)
$('#btn-start-game').addEventListener('click', () => {
  socket.emit('start-game', { roomCode: state.roomCode });
  $('#btn-start-game').disabled = true;
  $('#btn-start-game').textContent = '⏳ Starting...';
});

// ============================================================
// GAME SCREEN
// ============================================================
const storyContent = $('#story-content');
const actionInput = $('#action-input');
const btnAction = $('#btn-submit-action');
const actionArea = $('#action-area');

actionInput.addEventListener('input', () => {
  btnAction.disabled = actionInput.value.trim().length === 0;
  // Auto-resize
  actionInput.style.height = 'auto';
  actionInput.style.height = Math.min(actionInput.scrollHeight, 100) + 'px';
});

btnAction.addEventListener('click', submitAction);

// Allow Enter to submit (Shift+Enter for newline)
actionInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!btnAction.disabled) submitAction();
  }
});

function submitAction() {
  const action = actionInput.value.trim();
  if (!action) return;
  
  socket.emit('submit-action', {
    roomCode: state.roomCode,
    action: action
  });
  
  actionInput.value = '';
  actionInput.style.height = 'auto';
  btnAction.disabled = true;
  $('#action-input-wrapper').classList.add('hidden');
  $('#action-options').classList.add('hidden');
  $('#action-submitted-msg').classList.remove('hidden');
}

// NPC panel toggle
$('#npc-toggle').addEventListener('click', () => {
  const list = $('#npc-list');
  list.classList.toggle('open');
});

// ============================================================
// NARRATOR (Text-to-Speech)
// ============================================================
const narratorBtn = $('#btn-narrator');

narratorBtn.addEventListener('click', () => {
  state.narratorEnabled = !state.narratorEnabled;
  narratorBtn.textContent = state.narratorEnabled ? '🔊' : '🔇';
  narratorBtn.classList.toggle('active', state.narratorEnabled);
  if (!state.narratorEnabled) {
    window.speechSynthesis.cancel();
  }
  showToast(state.narratorEnabled ? 'Narrator enabled' : 'Narrator disabled', 'info');
});

// Cache the best narrator voice once found
let _narratorVoice = null;
let _voicesLoaded = false;

function pickNarratorVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  // Prefer premium/enhanced voices for natural sound
  const preferNames = ['Samantha', 'Daniel', 'Karen', 'Moira', 'Tessa', 'Fiona',
    'Google UK English Male', 'Google UK English Female', 'Aaron',
    'Microsoft Mark', 'Microsoft David', 'Microsoft Zira'];
  for (const name of preferNames) {
    const v = voices.find(v => v.name.includes(name) && v.lang.startsWith('en'));
    if (v) return v;
  }
  // Fallback: any English voice
  return voices.find(v => v.lang.startsWith('en')) || voices[0];
}

// Load voices early
if (window.speechSynthesis) {
  const initVoices = () => {
    _narratorVoice = pickNarratorVoice();
    _voicesLoaded = true;
  };
  if (window.speechSynthesis.getVoices().length > 0) initVoices();
  else window.speechSynthesis.addEventListener('voiceschanged', initVoices, { once: true });
}

function narrateText(text) {
  if (!state.narratorEnabled || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  // Clean markdown into natural prose
  let clean = text
    .replace(/\\n/g, '\n')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,4}\s*/g, '')
    .replace(/---+/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Split by paragraphs first for natural pacing
  const paragraphs = clean.split(/\n\n+/).filter(p => p.trim());
  const segments = [];
  for (const para of paragraphs) {
    // Split into sentence groups (~150 chars) for chunked speech
    const sentences = para.match(/[^.!?]*[.!?]+["'\)\]]?\s*/g) || [para];
    let current = '';
    for (const s of sentences) {
      if ((current + s).length > 150 && current) {
        segments.push({ text: current.trim(), pause: 300 });
        current = s;
      } else {
        current += s;
      }
    }
    if (current.trim()) {
      // Longer pause after paragraphs for dramatic effect
      segments.push({ text: current.trim(), pause: 700 });
    }
  }

  let idx = 0;
  function speakSegment() {
    if (idx >= segments.length || !state.narratorEnabled) return;
    const seg = segments[idx];
    const utt = new SpeechSynthesisUtterance(seg.text);
    utt.rate = 0.88;
    utt.pitch = 0.85;
    utt.volume = 1;
    if (_narratorVoice) utt.voice = _narratorVoice;
    utt.onend = () => {
      idx++;
      // Pause between segments for natural pacing
      if (idx < segments.length && state.narratorEnabled) {
        setTimeout(speakSegment, seg.pause);
      }
    };
    utt.onerror = () => { idx++; speakSegment(); };
    window.speechSynthesis.speak(utt);
  }

  if (_voicesLoaded) {
    speakSegment();
  } else {
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      _narratorVoice = pickNarratorVoice();
      _voicesLoaded = true;
      speakSegment();
    }, { once: true });
  }
}

// Spend perk
$('#btn-spend-perk').addEventListener('click', () => {
  socket.emit('spend-perk', { roomCode: state.roomCode });
  $('#perk-notification').classList.add('hidden');
});

// Bio panel
$('#bio-close').addEventListener('click', () => {
  $('#bio-panel').classList.remove('visible');
  setTimeout(() => $('#bio-panel').classList.add('hidden'), 300);
});

// New game
$('#btn-new-game').addEventListener('click', () => {
  window.location.reload();
});

// ============================================================
// GM CHATGPT PANEL
// ============================================================
const gmPanel = $('#gm-panel');
const gmResponseInput = $('#gm-response-input');
const btnCopyPrompt = $('#btn-copy-prompt');
const btnSendResponse = $('#btn-send-response');
const gmPanelMinimize = $('#gm-panel-minimize');

// Copy prompt to clipboard
btnCopyPrompt.addEventListener('click', () => {
  const promptText = $('#gm-prompt-box').textContent;
  navigator.clipboard.writeText(promptText).then(() => {
    btnCopyPrompt.textContent = '✅ Copied!';
    btnCopyPrompt.classList.add('copied');
    setTimeout(() => {
      btnCopyPrompt.textContent = '📋 Copy Prompt';
      btnCopyPrompt.classList.remove('copied');
    }, 2000);
  }).catch(() => {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = promptText;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btnCopyPrompt.textContent = '✅ Copied!';
    setTimeout(() => { btnCopyPrompt.textContent = '📋 Copy Prompt'; }, 2000);
  });
});

// Enable send button when response is pasted
gmResponseInput.addEventListener('input', () => {
  btnSendResponse.disabled = gmResponseInput.value.trim().length < 10;
});

// Send ChatGPT response to server
btnSendResponse.addEventListener('click', () => {
  const response = gmResponseInput.value.trim();
  if (!response) return;
  
  btnSendResponse.disabled = true;
  btnSendResponse.textContent = '⏳ Processing...';
  $('#gm-error').classList.add('hidden');
  
  socket.emit('gm-submit-response', {
    roomCode: state.roomCode,
    type: state.currentPromptType,
    response: response
  });
});

// Minimize/expand GM panel
gmPanelMinimize.addEventListener('click', () => {
  const body = $('#gm-panel-body');
  body.classList.toggle('collapsed');
  gmPanelMinimize.textContent = body.classList.contains('collapsed') ? '▲' : '▼';
});

function showGMPanel(data) {
  state.currentPromptType = data.type;
  
  // Show steps
  const stepsEl = $('#gm-steps');
  stepsEl.innerHTML = data.instructions.map((step, i) => 
    `<div class="gm-step"><span class="gm-step-num">${i + 1}</span>${escapeHtml(step)}</div>`
  ).join('');
  
  // Show prompt
  $('#gm-prompt-box').textContent = data.prompt;
  
  // Reset response area
  gmResponseInput.value = '';
  btnSendResponse.disabled = true;
  btnSendResponse.textContent = '🚀 Send to Players';
  $('#gm-error').classList.add('hidden');
  
  // Show the panel
  gmPanel.classList.remove('hidden');
  $('#gm-panel-body').classList.remove('collapsed');
  gmPanelMinimize.textContent = '▼';
  
  // Scroll the response textarea into view
  setTimeout(() => gmResponseInput.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
}

function hideGMPanel() {
  gmPanel.classList.add('hidden');
  state.currentPromptType = null;
}

// ============================================================
// SOCKET EVENT HANDLERS
// ============================================================

// Player joined lobby
socket.on('player-joined', (data) => {
  updateLobbyPlayers(data.players);
  showToast(`${data.playerName} joined the room!`, 'info');
});

// Phase changed
socket.on('phase-changed', (data) => {
  if (data.phase === 'character-creation') {
    showScreen('character');
    if (data.premise) {
      $('#premise-preview').textContent = `"${data.premise}"`;
    }
    if (state.isGM) {
      // GM doesn't create a character — show waiting/management UI
      document.querySelector('.character-form').innerHTML = `
        <div style="text-align:center; padding: 20px;">
          <h3>🎮 Game Master Mode</h3>
          <p style="color: var(--text-dim); margin: 16px 0;">Waiting for players to create their survivors...</p>
          <div class="char-ready-list" id="char-ready-list"></div>
          <button id="btn-start-game" class="btn btn-accent hidden" style="margin-top: 16px;">
            🎮 Start Adventure!
          </button>
        </div>
      `;
      $('#btn-start-game').addEventListener('click', () => {
        socket.emit('start-game', { roomCode: state.roomCode });
        $('#btn-start-game').disabled = true;
        $('#btn-start-game').textContent = '⏳ Starting...';
      });
    } else {
      populateCharacterOptions('zombie-survival');
    }
  } else if (data.phase === 'playing') {
    showScreen('game');
  }
});

// Character submitted by another player
socket.on('character-submitted', (data) => {
  const readyList = $('#char-ready-list');
  
  showToast(`${data.playerName} locked in ${data.character.name}!`, 'success');
  
  const item = document.createElement('div');
  item.className = 'char-ready-item';
  item.innerHTML = `
    <span class="status-icon">✅</span>
    <span><strong>${escapeHtml(data.character.name)}</strong> — ${data.character.race} ${data.character.class}</span>
  `;
  readyList.appendChild(item);
  
  // Show start button for GM when all ready
  if (data.allReady && state.isGM) {
    $('#btn-start-game').classList.remove('hidden');
  }
});

// Loading story
socket.on('loading-story', (data) => {
  const loading = $('#loading-indicator');
  loading.classList.remove('hidden');
  $('#loading-message').textContent = data.message;
  scrollStoryToBottom();
});

// Story update (main game event)
socket.on('story-update', (data) => {
  hideGMPanel();
  $('#loading-indicator').classList.add('hidden');
  
  // Clear GM action log for new round
  $('#gm-action-log').classList.add('hidden');
  $('#gm-action-list').innerHTML = '';
  
  // Update round and chapter
  $('#game-round').textContent = data.round;
  if (data.chapter) {
    const chapterEl = $('#game-chapter');
    const prevChapter = parseInt(chapterEl.textContent.replace('Ch.', '')) || 1;
    chapterEl.textContent = `Ch.${data.chapter}`;
    // Show chapter header when chapter changes
    if (data.chapter > prevChapter) {
      const chapterHeader = document.createElement('div');
      chapterHeader.className = 'chapter-header';
      chapterHeader.innerHTML = `<span>Chapter ${data.chapter}</span>`;
      storyContent.appendChild(chapterHeader);
    }
  }
  
  // Add story entry
  const entry = document.createElement('div');
  entry.className = 'story-entry';
  entry.innerHTML = formatMarkdown(data.narrative);
  storyContent.appendChild(entry);
  
  // Show dice results if available
  if (data.diceResults && data.diceResults.length > 0) {
    showDiceResults(data.diceResults);
  }
  
  // Update player health bars
  if (data.players) {
    updatePlayerHealthBars(data.players);
  }
  
  // Update NPCs
  if (data.npcs) {
    updateNPCs(data.npcs);
  }
  
  // Update waiting players
  if (data.waitingFor) {
    updateWaitingPlayers(data.waitingFor);
  }
  
  // Check if my character is alive
  const me = data.players?.find(p => p.id === state.playerId);
  if (me && me.character) {
    state.character = me.character;
    state.myPerkPoints = me.character.perkPoints;
    
    if (!me.character.alive) {
      showDeadOverlay();
    } else {
      // Show action input for next round
      $('#action-input-wrapper').classList.remove('hidden');
      $('#action-submitted-msg').classList.add('hidden');
      btnAction.disabled = true;
      actionInput.value = '';
      
      // Show action options if available
      const optionsContainer = $('#action-options');
      optionsContainer.innerHTML = '';
      if (data.options && data.options.length > 0) {
        data.options.forEach(opt => {
          const btn = document.createElement('button');
          btn.className = 'option-btn';
          btn.textContent = opt;
          btn.addEventListener('click', () => {
            actionInput.value = opt;
            actionInput.style.height = 'auto';
            actionInput.style.height = Math.min(actionInput.scrollHeight, 100) + 'px';
            btnAction.disabled = false;
            actionInput.focus();
          });
          optionsContainer.appendChild(btn);
        });
        optionsContainer.classList.remove('hidden');
      } else {
        optionsContainer.classList.add('hidden');
      }
      
      // Show perk notification if available
      if (me.character.perkPoints > 0) {
        $('#perk-notification').classList.remove('hidden');
      }
    }
  }
  
  // Show equipment changes
  if (data.equipmentChanges && data.equipmentChanges.length > 0) {
    data.equipmentChanges.forEach(change => {
      const adds = (change.add || []).map(i => `+${i}`).join(', ');
      const removes = (change.remove || []).map(i => `-${i}`).join(', ');
      const parts = [adds, removes].filter(Boolean).join(' | ');
      if (parts) {
        showToast(`🎒 ${change.character}: ${parts}`, 'info');
      }
    });
  }
  
  // Narrate the story
  narrateText(data.narrative);
  
  scrollStoryToBottom();
});
socket.on('action-submitted', (data) => {
  const critClass = data.diceRoll.critical ? 'crit' : data.diceRoll.critFail ? 'critfail' : '';
  const critText = data.diceRoll.critical ? ' — CRITICAL HIT!' : data.diceRoll.critFail ? ' — CRITICAL FAIL!' : '';

  // Show dice roll to the submitting player
  if (data.playerName === state.playerName) {
    $('#my-dice-roll').innerHTML = `
      <div class="dice-result-item" style="justify-content:center; margin-bottom:8px;">
        <span class="dice-value ${critClass} dice-roll-anim" style="font-size:1.5rem;">🎲 ${data.diceRoll.total}</span>
        ${data.weaponDamage ? `<span style="color:var(--danger); margin-left:8px;">⚔️ ${data.weaponDamage.weapon} = ${data.weaponDamage.damage} dmg</span>` : ''}
        <span style="font-size:0.85rem; color:var(--text-dim); margin-left:8px;">${critText}</span>
      </div>
    `;
  } else {
    showToast(`${data.playerName} rolled 🎲 ${data.diceRoll.total}${data.diceRoll.critical ? ' CRIT!' : data.diceRoll.critFail ? ' CRIT FAIL!' : ''}`, 'info');
  }

  // GM sees full action details in the action log
  if (state.isGM) {
    const logContainer = $('#gm-action-log');
    const logList = $('#gm-action-list');
    logContainer.classList.remove('hidden');
    const entry = document.createElement('div');
    entry.className = 'gm-action-entry';
    entry.innerHTML = `
      <div class="gm-action-player">
        <strong>${escapeHtml(data.characterName || data.playerName)}</strong>
        <span class="dice-value ${critClass}" style="font-size:0.9rem;">🎲 ${data.diceRoll.total}${critText}</span>
        ${data.weaponDamage ? `<span style="color:var(--danger);font-size:0.8rem;">⚔️ ${data.weaponDamage.weapon} ${data.weaponDamage.damage}dmg</span>` : ''}
      </div>
      <div class="gm-action-text">"${escapeHtml(data.action)}"</div>
    `;
    logList.appendChild(entry);
    logList.scrollTop = logList.scrollHeight;
  }
  
  updateWaitingPlayers(data.waitingFor);
  
  if (data.allSubmitted) {
    showToast('All actions in! Waiting for GM...', 'success');
  }
});

// Perk gained
socket.on('perk-gained', (data) => {
  if (data.playerName === state.playerName) {
    state.character = data.character;
    showToast(`🌟 You gained: ${data.skill}!`, 'perk');
  } else {
    showToast(`${data.playerName} gained: ${data.skill}!`, 'info');
  }
});

// Player disconnected
socket.on('player-disconnected', (data) => {
  showToast(`${data.playerName} disconnected`, 'error');
  if (data.players) updatePlayerHealthBars(data.players);
});

// Player reconnected
socket.on('player-reconnected', (data) => {
  showToast(`${data.playerName} reconnected!`, 'success');
  if (data.players) {
    updatePlayerHealthBars(data.players);
    updateLobbyPlayers(data.players);
  }
});

// Game over
socket.on('game-over', (data) => {
  clearSession();
  showScreen('gameover');
  hideGMPanel();
  $('#gameover-narrative').innerHTML = formatMarkdown(data.narrative);
  
  if (data.players) {
    const statsHtml = data.players.map(p => {
      if (!p.character) return '';
      return `
        <div class="player-card">
          <div class="player-avatar">${p.character.alive ? '👑' : '💀'}</div>
          <span class="player-name">${escapeHtml(p.character.name)}</span>
          <span style="color: var(--text-dim)">Lv.${p.character.level} | ${p.character.xp}XP</span>
        </div>
      `;
    }).join('');
    $('#gameover-stats').innerHTML = statsHtml;
  }
});

// GM receives prompt to copy to ChatGPT
socket.on('gm-prompt', (data) => {
  showGMPanel(data);
  showToast('New prompt ready! Copy it to ChatGPT.', 'success');
});

// GM paste parse error
socket.on('gm-parse-error', (data) => {
  const errEl = $('#gm-error');
  errEl.textContent = data.error;
  errEl.classList.remove('hidden');
  btnSendResponse.disabled = false;
  btnSendResponse.textContent = '🚀 Send to Players';
  showToast('Error reading response — check the format!', 'error');
});

// ============================================================
// UI UPDATE FUNCTIONS
// ============================================================
function updatePlayerHealthBars(players) {
  const container = $('#players-health-bar');
  container.innerHTML = players.map(p => {
    if (!p.character) return '';
    const pct = Math.round((p.character.hp / p.character.maxHp) * 100);
    const hpClass = pct > 60 ? 'hp-high' : pct > 25 ? 'hp-mid' : 'hp-low';
    const dead = !p.character.alive;
    // GM sees secret flaw if present
    const flawLine = (state.isGM && p.character.negativeTrait)
      ? `<div style="font-size:0.65rem; color:var(--danger); margin-top:2px; max-width:80px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(p.character.negativeTrait)}">⚠️ ${escapeHtml(p.character.negativeTrait.split('—')[0].trim())}</div>`
      : '';
    
    return `
      <div class="player-hp-badge ${dead ? 'dead' : ''}" onclick="showBio('${escapeHtml(p.id)}')">
        <span>${getPlayerEmoji(p.name)}</span>
        <span style="font-weight:600; max-width: 60px; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(p.character.name)}</span>
        <div class="mini-health-bar">
          <div class="mini-health-fill ${hpClass}" style="width: ${pct}%"></div>
        </div>
        <span style="font-size:0.7rem; color: ${dead ? 'var(--danger)' : 'var(--text-dim)'}">
          ${dead ? '💀' : p.character.hp}
        </span>
        ${flawLine}
      </div>
    `;
  }).join('');
  
  // Store players globally for bio panel
  window._gamePlayers = players;
}

function updateNPCs(npcs) {
  const panel = $('#npc-panel');
  const list = $('#npc-list');
  const count = $('.npc-count');
  
  if (npcs.length === 0) {
    panel.classList.add('hidden');
    return;
  }
  
  panel.classList.remove('hidden');
  count.textContent = npcs.length;
  
  list.innerHTML = npcs.map(npc => {
    const pct = Math.round((npc.hp / npc.maxHp) * 100);
    const hpClass = pct > 60 ? 'hp-high' : pct > 25 ? 'hp-mid' : 'hp-low';
    return `
      <div class="npc-card ${npc.role}">
        <span>${npc.role === 'hostile' ? '⚔️' : npc.role === 'friendly' ? '🤝' : '❓'}</span>
        <span style="flex:1"><strong>${escapeHtml(npc.name)}</strong> — ${escapeHtml(npc.description || '')}</span>
        <div class="mini-health-bar" style="width:30px">
          <div class="mini-health-fill ${hpClass}" style="width:${pct}%"></div>
        </div>
        <span style="font-size:0.7rem">${npc.hp}</span>
      </div>
    `;
  }).join('');
}

function updateWaitingPlayers(names) {
  const el = $('#waiting-players');
  if (!names || names.length === 0) {
    el.textContent = '';
    return;
  }
  el.textContent = `⏳ Waiting for: ${names.join(', ')}`;
}

function showDiceResults(results) {
  const container = $('#dice-results');
  container.classList.remove('hidden');
  
  container.innerHTML = results.map(r => {
    const critClass = r.diceRoll.critical ? 'crit' : r.diceRoll.critFail ? 'critfail' : '';
    return `
      <div class="dice-result-item">
        <span>${escapeHtml(r.playerName)}</span>
        <span class="dice-value ${critClass} dice-roll-anim">🎲 ${r.diceRoll.total}</span>
        ${r.weaponDamage ? `<span style="color:var(--danger);font-size:0.75rem">⚔️${r.weaponDamage.damage}</span>` : ''}
      </div>
    `;
  }).join('');
  
  // Hide after 8 seconds
  setTimeout(() => {
    container.classList.add('hidden');
  }, 8000);
}

function showDeadOverlay() {
  $('#dead-overlay').classList.remove('hidden');
  $('#action-input-wrapper').classList.add('hidden');
  $('#action-submitted-msg').classList.add('hidden');
}

// Bio panel
window.showBio = function(playerId) {
  const players = window._gamePlayers || [];
  const player = players.find(p => p.id === playerId);
  if (!player || !player.character) return;
  
  const c = player.character;
  const pct = Math.round((c.hp / c.maxHp) * 100);
  const hpClass = pct > 60 ? 'hp-high' : pct > 25 ? 'hp-mid' : 'hp-low';
  
  $('#bio-content').innerHTML = `
    <h2 style="text-align:center; margin-bottom:4px;">${escapeHtml(c.name)}</h2>
    <p style="text-align:center; color:var(--text-dim); margin-bottom:16px;">${c.race} ${c.class} • Level ${c.level}</p>
    
    <div style="margin-bottom:16px;">
      <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px;">
        <span>❤️ Health</span>
        <span>${c.hp} / ${c.maxHp}</span>
      </div>
      <div class="bio-hp-bar">
        <div class="bio-hp-fill ${hpClass}" style="width:${pct}%"></div>
      </div>
    </div>
    
    <div class="bio-stat"><span class="bio-stat-label">XP</span><span class="bio-stat-value">${c.xp}</span></div>
    <div class="bio-stat"><span class="bio-stat-label">Perk Points</span><span class="bio-stat-value">${c.perkPoints}</span></div>
    <div class="bio-stat"><span class="bio-stat-label">Status</span><span class="bio-stat-value">${c.alive ? '🟢 Alive' : '💀 Dead'}</span></div>
    
    <h4 style="color:var(--accent); margin:16px 0 8px;">📝 Backstory</h4>
    <p style="font-size:0.9rem; color:var(--text-dim); line-height:1.5;">${escapeHtml(c.backstory || 'Unknown')}</p>
    
    <h4 style="color:var(--accent); margin:16px 0 8px;">⚡ Traits</h4>
    <div class="bio-skills">${(c.traits || []).map(t => `<span class="bio-skill-tag">${escapeHtml(t)}</span>`).join('')}</div>
    
    <h4 style="color:var(--accent); margin:16px 0 8px;">🎒 Equipment</h4>
    <div class="bio-skills">${(c.equipment || []).map(e => `<span class="bio-skill-tag">${escapeHtml(e)}</span>`).join('')}</div>
    
    <h4 style="color:var(--accent); margin:16px 0 8px;">🌟 Skills</h4>
    <div class="bio-skills">${(c.skills || []).length > 0 ? c.skills.map(s => `<span class="bio-skill-tag">${escapeHtml(s)}</span>`).join('') : '<span style="color:var(--text-dim);font-size:0.85rem;">No skills yet — earn perk points to unlock!</span>'}</div>
    ${state.isGM && c.negativeTrait ? `
    <h4 style="color:var(--danger); margin:16px 0 8px;">⚠️ Secret Flaw (GM Only)</h4>
    <p style="font-size:0.9rem; color:var(--danger); line-height:1.5; background:rgba(255,0,0,0.1); padding:8px; border-radius:8px;">${escapeHtml(c.negativeTrait)}</p>
    ` : ''}
  `;
  
  const panel = $('#bio-panel');
  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('visible'));
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function scrollStoryToBottom() {
  const area = $('.story-area');
  setTimeout(() => {
    area.scrollTop = area.scrollHeight;
  }, 100);
}

function formatMarkdown(text) {
  if (!text) return '';
  
  // Convert literal \n sequences to actual newlines
  text = text.replace(/\\n/g, '\n');
  
  return text
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Headers
    .replace(/^### (.*$)/gm, '<h4>$1</h4>')
    .replace(/^## (.*$)/gm, '<h3>$1</h3>')
    // Lists
    .replace(/^- (.*$)/gm, '<li>$1</li>')
    // Line breaks (double newline = paragraph)
    .replace(/\n\n/g, '</p><p>')
    // Single newline = br
    .replace(/\n/g, '<br>')
    // Wrap in paragraph
    .replace(/^(.+)/, '<p>$1</p>')
    // Clean up list items
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    // Remove empty paragraphs
    .replace(/<p><\/p>/g, '');
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getPlayerEmoji(name) {
  const emojis = ['🧙', '⚔️', '🏹', '🛡️', '🗡️', '🔮', '🐉', '🦁'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return emojis[Math.abs(hash) % emojis.length];
}

function showToast(message, type = 'info') {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 4000);
}

// ============================================================
// RECONNECTION HANDLING
// ============================================================

function handleRejoin(res) {
  state.isGM = res.isGM;
  state.character = res.character;
  if (res.roomCode) state.roomCode = res.roomCode;

  if (res.phase === 'lobby') {
    enterLobby();
    if (res.players) updateLobbyPlayers(res.players);
  } else if (res.phase === 'character-creation') {
    showScreen('character');
    if (res.premise) $('#premise-preview').textContent = `"${res.premise}"`;

    if (state.isGM) {
      // Restore GM character-creation UI
      document.querySelector('.character-form').innerHTML = `
        <div style="text-align:center; padding: 20px;">
          <h3>\uD83C\uDFAE Game Master Mode</h3>
          <p style="color: var(--text-dim); margin: 16px 0;">Waiting for players to create their survivors...</p>
          <div class="char-ready-list" id="char-ready-list"></div>
          <button id="btn-start-game" class="btn btn-accent hidden" style="margin-top: 16px;">
            \uD83C\uDFAE Start Adventure!
          </button>
        </div>
      `;
      $('#btn-start-game').addEventListener('click', () => {
        socket.emit('start-game', { roomCode: state.roomCode });
        $('#btn-start-game').disabled = true;
        $('#btn-start-game').textContent = '\u23F3 Starting...';
      });
      // Populate ready list from players data
      if (res.players) {
        const readyList = $('#char-ready-list');
        let allReady = true;
        let hasPlayers = false;
        res.players.forEach(p => {
          if (p.isGM) return;
          hasPlayers = true;
          if (p.characterReady && p.character) {
            const item = document.createElement('div');
            item.className = 'char-ready-item';
            item.innerHTML = `
              <span class="status-icon">\u2705</span>
              <span><strong>${escapeHtml(p.character.name)}</strong> \u2014 ${p.character.race} ${p.character.class}</span>
            `;
            readyList.appendChild(item);
          } else {
            allReady = false;
          }
        });
        if (allReady && hasPlayers) {
          $('#btn-start-game').classList.remove('hidden');
        }
      }
    } else if (res.characterReady) {
      // Player already submitted — show waiting state
      document.querySelector('.character-form').innerHTML = `
        <div style="text-align:center; padding: 20px;">
          <h3>\u2705 Character Submitted</h3>
          <p style="color: var(--text-dim); margin: 16px 0;">Waiting for other players and the Game Master to start...</p>
        </div>
      `;
    } else {
      populateCharacterOptions('zombie-survival');
    }
  } else if (res.phase === 'playing') {
    restorePlayingState(res);
  } else if (res.phase === 'game-over') {
    clearSession();
    showScreen('gameover');
  }
}

function restorePlayingState(res) {
  showScreen('game');
  if (res.character) state.character = res.character;

  // Restore story log
  if (res.storyLog) {
    storyContent.innerHTML = '';
    res.storyLog.forEach(entry => {
      const el = document.createElement('div');
      el.className = 'story-entry';
      el.innerHTML = formatMarkdown(entry.text);
      storyContent.appendChild(el);
    });
  }

  if (res.players) updatePlayerHealthBars(res.players);
  if (res.npcs) updateNPCs(res.npcs);

  // Round & chapter display
  $('#game-round').textContent = res.round || 1;
  const chapterEl = $('#game-chapter');
  if (chapterEl && res.chapter) {
    chapterEl.textContent = `Ch.${res.chapter}`;
  }

  // Action input state
  if (res.actionSubmitted) {
    $('#action-input-wrapper').classList.add('hidden');
    $('#action-options').classList.add('hidden');
    $('#action-submitted-msg').classList.remove('hidden');
  } else if (res.character && res.character.alive) {
    $('#action-input-wrapper').classList.remove('hidden');
    $('#action-submitted-msg').classList.add('hidden');
  }

  // Check if dead
  if (res.character && !res.character.alive) {
    showDeadOverlay();
  }

  scrollStoryToBottom();
}

socket.on('connect', () => {
  // Mid-session reconnect only (network drop — state is still in JS memory)
  if (state.roomCode && state.playerName) {
    socket.emit('reconnect-player', {
      roomCode: state.roomCode,
      playerName: state.playerName
    }, (res) => {
      if (res.success) {
        state.playerId = res.playerId;
        handleRejoin(res);
        showToast('Reconnected!', 'success');
      } else {
        // Room no longer exists (server restarted) — reset to title
        state.roomCode = '';
        state.playerName = '';
        state.isGM = false;
        state.character = null;
        clearSession();
        showScreen('title');
      }
    });
  }
  // If there's a saved session but no in-memory state (page reload / new tab),
  // don't auto-reconnect — let the user rejoin manually via "Join Room"
  // (form fields are pre-filled by initFromSession)
});

socket.on('disconnect', () => {
  showToast('Connection lost. Reconnecting...', 'error');
});

// ============================================================
// INITIALIZE
// ============================================================

// Pre-fill name/code from saved session for convenience
(function initFromSession() {
  const saved = getSavedSession();
  if (saved) {
    if (playerNameInput) playerNameInput.value = saved.playerName;
    if (roomCodeInput) roomCodeInput.value = saved.roomCode;
    // Trigger validation so buttons enable
    playerNameInput.dispatchEvent(new Event('input'));
    roomCodeInput.dispatchEvent(new Event('input'));
  }
})();

console.log('⚔️ Quest Realms loaded!');
