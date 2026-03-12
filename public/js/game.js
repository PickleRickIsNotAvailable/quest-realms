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
  selectedSetting: 'fantasy',
  myPerkPoints: 0,
  currentPromptType: null  // 'opening' or 'round' — tracks what GM is working on
};

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
      state.isGM = false;
      enterLobby();
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

// Setting picker
$$('.setting-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.setting-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.selectedSetting = btn.dataset.setting;
  });
});

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

// ---- Setting-specific options ----
const SETTING_OPTIONS = {
  'fantasy': {
    races: [
      { value: 'Human', label: '🧑 Human' },
      { value: 'Elf', label: '🧝 Elf' },
      { value: 'Dwarf', label: '⛏️ Dwarf' },
      { value: 'Halfling', label: '🍀 Halfling' },
      { value: 'Orc', label: '👹 Orc' }
    ],
    classes: [
      { value: 'Warrior', label: '⚔️ Warrior' },
      { value: 'Mage', label: '🧙 Mage' },
      { value: 'Rogue', label: '🗡️ Rogue' },
      { value: 'Cleric', label: '✝️ Cleric' },
      { value: 'Ranger', label: '🏹 Ranger' },
      { value: 'Paladin', label: '🛡️ Paladin' },
      { value: 'Bard', label: '🎵 Bard' },
      { value: 'Barbarian', label: '💪 Barbarian' }
    ],
    traits: [
      { value: 'Brave', label: '💪 Brave' },
      { value: 'Cunning', label: '🧠 Cunning' },
      { value: 'Wise', label: '📖 Wise' },
      { value: 'Lucky', label: '🍀 Lucky' },
      { value: 'Noble', label: '👑 Noble' },
      { value: 'Mysterious', label: '🌙 Mysterious' },
      { value: 'Fierce', label: '🔥 Fierce' },
      { value: 'Gentle', label: '🕊️ Gentle' },
      { value: 'Resilient', label: '🦴 Resilient' },
      { value: 'Charismatic', label: '✨ Charismatic' }
    ],
    equipment: [
      { value: 'Longsword', label: '⚔️ Longsword' },
      { value: 'Staff', label: '🪄 Staff' },
      { value: 'Bow', label: '🏹 Bow' },
      { value: 'Shield', label: '🛡️ Shield' },
      { value: 'Healing Potion', label: '🧪 Healing Potion' },
      { value: 'Dagger', label: '🗡️ Dagger' },
      { value: 'Spell Book', label: '📕 Spell Book' },
      { value: 'Battle Axe', label: '🪓 Battle Axe' },
      { value: 'Crossbow', label: '🏹 Crossbow' },
      { value: 'Mace', label: '🔨 Mace' }
    ]
  },
  'sci-fi': {
    races: [
      { value: 'Human', label: '🧑 Human' },
      { value: 'Android', label: '🤖 Android' },
      { value: 'Alien', label: '👽 Alien' },
      { value: 'Cyborg', label: '🦾 Cyborg' },
      { value: 'Clone', label: '🧬 Clone' }
    ],
    classes: [
      { value: 'Pilot', label: '🚀 Pilot' },
      { value: 'Engineer', label: '🔧 Engineer' },
      { value: 'Soldier', label: '🎖️ Soldier' },
      { value: 'Medic', label: '💉 Medic' },
      { value: 'Hacker', label: '💻 Hacker' },
      { value: 'Scientist', label: '🔬 Scientist' },
      { value: 'Bounty Hunter', label: '🎯 Bounty Hunter' },
      { value: 'Diplomat', label: '🤝 Diplomat' }
    ],
    traits: [
      { value: 'Brave', label: '💪 Brave' },
      { value: 'Cunning', label: '🧠 Cunning' },
      { value: 'Tech-Savvy', label: '💻 Tech-Savvy' },
      { value: 'Lucky', label: '🍀 Lucky' },
      { value: 'Ruthless', label: '🔥 Ruthless' },
      { value: 'Paranoid', label: '👁️ Paranoid' },
      { value: 'Resourceful', label: '🛠️ Resourceful' },
      { value: 'Fast', label: '⚡ Fast' },
      { value: 'Tough', label: '🦴 Tough' },
      { value: 'Analytical', label: '🔍 Analytical' }
    ],
    equipment: [
      { value: 'Pistol', label: '🔫 Pistol' },
      { value: 'Rifle', label: '🎯 Rifle' },
      { value: 'Shield', label: '🛡️ Energy Shield' },
      { value: 'Healing Potion', label: '💊 Med Kit' },
      { value: 'Flashlight', label: '🔦 Flashlight' },
      { value: 'Dagger', label: '⚡ Plasma Blade' },
      { value: 'Crossbow', label: '🤖 Drone' },
      { value: 'Wand', label: '💻 Hacking Tool' },
      { value: 'Shotgun', label: '💥 Grenades' },
      { value: 'Bow', label: '📡 Scanner' }
    ]
  },
  'horror': {
    races: [
      { value: 'Human', label: '🧑 Human' }
    ],
    classes: [
      { value: 'Detective', label: '🔍 Detective' },
      { value: 'Occultist', label: '🔮 Occultist' },
      { value: 'Survivor', label: '🏃 Survivor' },
      { value: 'Medium', label: '👻 Medium' },
      { value: 'Doctor', label: '💉 Doctor' },
      { value: 'Professor', label: '📚 Professor' },
      { value: 'Reporter', label: '📰 Reporter' },
      { value: 'Priest', label: '✝️ Priest' }
    ],
    traits: [
      { value: 'Brave', label: '💪 Brave' },
      { value: 'Paranoid', label: '👁️ Paranoid' },
      { value: 'Resourceful', label: '🛠️ Resourceful' },
      { value: 'Lucky', label: '🍀 Lucky' },
      { value: 'Tough', label: '🦴 Tough' },
      { value: 'Cunning', label: '🧠 Cunning' },
      { value: 'Stealthy', label: '🌙 Stealthy' },
      { value: 'Cold-blooded', label: '🧊 Cold-blooded' },
      { value: 'Perceptive', label: '👂 Perceptive' },
      { value: 'Desperate', label: '😰 Desperate' }
    ],
    equipment: [
      { value: 'Flashlight', label: '🔦 Flashlight' },
      { value: 'Pistol', label: '🔫 Pistol' },
      { value: 'Dagger', label: '🗡️ Knife' },
      { value: 'Healing Potion', label: '🧪 First Aid Kit' },
      { value: 'Crossbow', label: '✝️ Cross' },
      { value: 'Bow', label: '📷 Camera' },
      { value: 'Wand', label: '🧂 Salt & Sage' },
      { value: 'Staff', label: '🔥 Lighter' },
      { value: 'Shield', label: '🪢 Rope' },
      { value: 'Shotgun', label: '📻 Radio' }
    ]
  },
  'western': {
    races: [
      { value: 'Human', label: '🧑 Human' }
    ],
    classes: [
      { value: 'Gunslinger', label: '🔫 Gunslinger' },
      { value: 'Sheriff', label: '⭐ Sheriff' },
      { value: 'Outlaw', label: '🤠 Outlaw' },
      { value: 'Doctor', label: '💉 Doctor' },
      { value: 'Bounty Hunter', label: '🎯 Bounty Hunter' },
      { value: 'Prospector', label: '⛏️ Prospector' },
      { value: 'Preacher', label: '📖 Preacher' },
      { value: 'Tracker', label: '🐾 Tracker' }
    ],
    traits: [
      { value: 'Brave', label: '💪 Brave' },
      { value: 'Ruthless', label: '🔥 Ruthless' },
      { value: 'Lucky', label: '🍀 Lucky' },
      { value: 'Cunning', label: '🧠 Cunning' },
      { value: 'Tough', label: '🦴 Tough' },
      { value: 'Fast', label: '⚡ Fast' },
      { value: 'Cold-blooded', label: '🧊 Cold-blooded' },
      { value: 'Honorable', label: '🤝 Honorable' },
      { value: 'Resourceful', label: '🛠️ Resourceful' },
      { value: 'Wild', label: '🐎 Wild' }
    ],
    equipment: [
      { value: 'Pistol', label: '🔫 Revolver' },
      { value: 'Rifle', label: '🎯 Rifle' },
      { value: 'Shotgun', label: '💥 Shotgun' },
      { value: 'Dagger', label: '🗡️ Knife' },
      { value: 'Bow', label: '🪢 Lasso' },
      { value: 'Staff', label: '🧨 Dynamite' },
      { value: 'Healing Potion', label: '🥃 Whiskey Flask' },
      { value: 'Shield', label: '🐴 Horse' },
      { value: 'Crossbow', label: '🃏 Playing Cards' },
      { value: 'Battle Axe', label: '⭐ Badge' }
    ]
  },
  'modern': {
    races: [
      { value: 'Human', label: '🧑 Human' }
    ],
    classes: [
      { value: 'Soldier', label: '🎖️ Soldier' },
      { value: 'Hacker', label: '💻 Hacker' },
      { value: 'Medic', label: '💉 Medic' },
      { value: 'Detective', label: '🔍 Detective' },
      { value: 'Spy', label: '🕵️ Spy' },
      { value: 'Scientist', label: '🔬 Scientist' },
      { value: 'Athlete', label: '🏃 Athlete' },
      { value: 'Leader', label: '📣 Leader' }
    ],
    traits: [
      { value: 'Brave', label: '💪 Brave' },
      { value: 'Cunning', label: '🧠 Cunning' },
      { value: 'Resourceful', label: '🛠️ Resourceful' },
      { value: 'Lucky', label: '🍀 Lucky' },
      { value: 'Tech-Savvy', label: '💻 Tech-Savvy' },
      { value: 'Tough', label: '🦴 Tough' },
      { value: 'Fast', label: '⚡ Fast' },
      { value: 'Stealthy', label: '🌙 Stealthy' },
      { value: 'Paranoid', label: '👁️ Paranoid' },
      { value: 'Charismatic', label: '✨ Charismatic' }
    ],
    equipment: [
      { value: 'Pistol', label: '🔫 Pistol' },
      { value: 'Dagger', label: '🗡️ Knife' },
      { value: 'Healing Potion', label: '🧪 Med Kit' },
      { value: 'Flashlight', label: '🔦 Flashlight' },
      { value: 'Wand', label: '📱 Phone' },
      { value: 'Bow', label: '💻 Laptop' },
      { value: 'Staff', label: '⚡ Taser' },
      { value: 'Shield', label: '🦺 Body Armor' },
      { value: 'Crossbow', label: '🔭 Binoculars' },
      { value: 'Rifle', label: '🪝 Grappling Hook' }
    ]
  },
  'post-apocalyptic': {
    races: [
      { value: 'Human', label: '🧑 Human' },
      { value: 'Mutant', label: '☢️ Mutant' },
      { value: 'Synthetic', label: '🤖 Synthetic' }
    ],
    classes: [
      { value: 'Soldier', label: '🎖️ Soldier' },
      { value: 'Medic', label: '💉 Medic' },
      { value: 'Scout', label: '🏃 Scout' },
      { value: 'Engineer', label: '🔧 Engineer' },
      { value: 'Sharpshooter', label: '🎯 Sharpshooter' },
      { value: 'Brawler', label: '👊 Brawler' },
      { value: 'Survivalist', label: '🏕️ Survivalist' },
      { value: 'Leader', label: '📣 Leader' }
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
      { value: 'Tough', label: '🦴 Tough' }
    ],
    equipment: [
      { value: 'Dagger', label: '🗡️ Knife' },
      { value: 'Battle Axe', label: '🪓 Axe' },
      { value: 'Baseball Bat', label: '🏏 Bat' },
      { value: 'Pistol', label: '🔫 Pistol' },
      { value: 'Rifle', label: '🎯 Rifle' },
      { value: 'Shotgun', label: '💥 Shotgun' },
      { value: 'Crossbow', label: '🏹 Crossbow' },
      { value: 'Shield', label: '🛡️ Shield' },
      { value: 'Healing Potion', label: '🧪 Med Kit' },
      { value: 'Flashlight', label: '🔦 Flashlight' }
    ]
  }
};

// Populate pill selectors based on setting
function populateCharacterOptions(setting) {
  const options = SETTING_OPTIONS[setting] || SETTING_OPTIONS['fantasy'];

  // Reset selections
  selectedRace = '';
  selectedClass = '';
  selectedTraits = [];
  selectedEquipment = [];

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
setupMultiSelect('trait-selector', () => selectedTraits, 3);
setupMultiSelect('equipment-selector', () => selectedEquipment, 3);

charNameInput.addEventListener('input', checkCharacterReady);
charBackstoryInput.addEventListener('input', checkCharacterReady);

function checkCharacterReady() {
  const ready = charNameInput.value.trim().length >= 2
    && selectedRace
    && selectedClass
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
    equipment: [...selectedEquipment]
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
  $('#action-submitted-msg').classList.remove('hidden');
}

// NPC panel toggle
$('#npc-toggle').addEventListener('click', () => {
  const list = $('#npc-list');
  list.classList.toggle('open');
});

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
  
  // Scroll to GM panel
  setTimeout(() => gmPanel.scrollIntoView({ behavior: 'smooth' }), 200);
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
    populateCharacterOptions(data.setting || 'fantasy');
    showScreen('character');
    if (data.premise) {
      $('#premise-preview').textContent = `"${data.premise}"`;
    }
  } else if (data.phase === 'playing') {
    showScreen('game');
  }
});

// Character submitted by another player
socket.on('character-submitted', (data) => {
  const readyList = $('#char-ready-list');
  
  // Update the ready list
  readyList.innerHTML = '';
  showToast(`${data.playerName} locked in ${data.character.name}!`, 'success');
  
  // Show/update character list (we need to track via the player list from server)
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
  
  // Update round
  $('#game-round').textContent = data.round;
  
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
      
      // Show perk notification if available
      if (me.character.perkPoints > 0) {
        $('#perk-notification').classList.remove('hidden');
      }
    }
  }
  
  scrollStoryToBottom();
});

// Action submitted by a player
socket.on('action-submitted', (data) => {
  if (data.playerName !== state.playerName) {
    showToast(`${data.playerName} submitted their action 🎲 ${data.diceRoll.total}`, 'info');
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

// Game over
socket.on('game-over', (data) => {
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
socket.on('connect', () => {
  if (state.roomCode && state.playerName) {
    // Attempt to reconnect
    socket.emit('reconnect-player', {
      roomCode: state.roomCode,
      playerName: state.playerName
    }, (res) => {
      if (res.success) {
        state.playerId = res.playerId;
        state.isGM = res.isGM;
        
        if (res.phase === 'playing') {
          showScreen('game');
          if (res.character) state.character = res.character;
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
          $('#game-round').textContent = res.round || 1;
          
          // Check if dead
          if (res.character && !res.character.alive) {
            showDeadOverlay();
          }
          
          scrollStoryToBottom();
        }
        
        showToast('Reconnected!', 'success');
      }
    });
  }
});

socket.on('disconnect', () => {
  showToast('Connection lost. Reconnecting...', 'error');
});

// ============================================================
// INITIALIZE
// ============================================================
console.log('⚔️ Quest Realms loaded!');
