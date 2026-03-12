// ============================================================
// Prompt Builder - Generates copy-paste prompts for ChatGPT
// ============================================================

class PromptBuilder {

  // Build the FIRST prompt the GM pastes into ChatGPT to start the game
  static buildOpeningPrompt(room) {
    const players = room.getPlayerList();
    const characterSheets = players.map(p => {
      if (!p.character) return '';
      return `
CHARACTER: ${p.character.name}
  Player: ${p.name}
  Race: ${p.character.race}
  Class: ${p.character.class}
  Backstory: ${p.character.backstory}
  Traits: ${p.character.traits.join(', ')}
  Equipment: ${p.character.equipment.join(', ')}
  HP: ${p.character.hp}/${p.character.maxHp}
  Skills: ${p.character.skills.length > 0 ? p.character.skills.join(', ') : 'None yet'}
  Starting Location: ${p.character.location || 'Unknown'}
  *** SECRET FLAW (HIDDEN FROM THIS PLAYER): ${p.character.negativeTrait || 'None'} ***`;
    }).filter(Boolean).join('\n');

    return `You are the AI Game Master for a ZOMBIE SURVIVAL RPG, inspired by The Walking Dead and The Last of Us. The world has fallen to a zombie apocalypse. Society has collapsed. The dead walk. Survivors must scavenge, fight, and make brutal choices to stay alive. Trust is rare. Resources are scarce. Every decision could be your last.

LOCATION: South Africa. The outbreak hit hard across the country — from the streets of Johannesburg to the coastline of Cape Town. Use real South African locations, landmarks, slang, and culture to make the world feel authentic.

TONE: Gritty, tense, emotional. Focus on survival horror — resource scarcity, moral dilemmas, human conflict, and the ever-present threat of the undead.

============================
SETTING: Zombie Apocalypse — South Africa
============================

STORY PREMISE:
"${room.premise}"

============================
PLAYER CHARACTERS:
============================
${characterSheets}

============================
YOUR TASK:
============================
Generate an intense opening narrative for this zombie survival story. You must:
1. Set the scene vividly — describe the ruined world, the danger, the atmosphere of dread
2. Do NOT introduce any NPCs yet. The opening focuses entirely on the player characters and the environment. NPCs will be introduced in later rounds.
3. Present a tense situation that forces the players to make survival choices
4. Reference each player's character by name, their starting location, and weave in their backstory/traits
5. End with a clear prompt asking "What do you do?"
6. IMPORTANT: Each character has a SECRET FLAW listed above. Subtly weave these into the story WITHOUT revealing what the flaw is. For example, if someone is "Clumsy", describe them stumbling. If "Paranoid Wreck", describe them nervously scanning shadows. Players should FEEL the effects but never be told the flaw name.
7. Provide 3-4 suggested action options for the players. These should be survival-focused choices that fit the zombie apocalypse (e.g., scavenge, fortify, fight, flee, explore the area). Players can also type their own custom action.

============================
RESPOND IN THIS EXACT JSON FORMAT (this is critical):
============================
{
  "narrative": "Your vivid narrative text here. Use **bold** for names and *italic* for emphasis.",
  "options": [
    "Option 1: A suggested action players could take",
    "Option 2: Another possible action",
    "Option 3: A third choice"
  ]
}`;
  }

  // Build the prompt for each round after players submit actions
  static buildRoundPrompt(room, actions) {
    const players = room.getPlayerList();
    const npcs = room.getNPCList();
    const recentStory = room.storyLog.slice(-3).map(s => s.text).join('\n\n---\n\n');

    const actionLines = actions.map(a => {
      const critText = a.diceRoll.critical ? ' *** CRITICAL HIT! ***' : (a.diceRoll.critFail ? ' *** CRITICAL FAIL! ***' : '');
      return `
PLAYER: ${a.playerName} (${a.character.name} — ${a.character.race} ${a.character.class})
  HP: ${a.character.hp}/${a.character.maxHp}
  Location: ${a.character.location || 'Unknown'}
  Skills: [${a.character.skills.join(', ')}]
  Traits: [${a.character.traits.join(', ')}]
  Equipment: [${a.character.equipment.join(', ')}]
  *** SECRET FLAW: ${a.character.negativeTrait || 'None'} ***
  ACTION: "${a.action}"
  DICE ROLL (D20): ${a.diceRoll.total}${critText}
  WEAPON DAMAGE: ${a.weaponDamage.weapon} = ${a.weaponDamage.damage} damage (range: ${a.weaponDamage.min}-${a.weaponDamage.max})`;
    }).join('\n');

    const npcLines = npcs.length > 0 ? npcs.map(n =>
      `  - ${n.name} (${n.role}, HP: ${n.hp}/${n.maxHp}): ${n.description}`
    ).join('\n') : '  None';

    const charLines = players.filter(p => p.character && p.character.alive).map(p =>
      `  - ${p.character.name}: HP ${p.character.hp}/${p.character.maxHp}, Level ${p.character.level}, Skills: [${p.character.skills.join(', ')}]`
    ).join('\n');

    return `============================
ROUND ${room.round} — RESOLVE PLAYER ACTIONS
============================

RECENT STORY:
${recentStory}

============================
LIVING CHARACTERS:
============================
${charLines}

============================
NPCs IN PLAY:
============================
${npcLines}

============================
PLAYER ACTIONS THIS ROUND:
============================
${actionLines}

============================
RULES:
============================
- D20 roll 15+ = great success. 5 or less = failure/backfire. 20 = AMAZING outcome. 1 = DISASTER.
- Character traits and skills SIGNIFICANTLY affect outcomes (e.g., a Scout with "Stealthy" trait sneaking = bonus)
- Weapon damage is already rolled. A knife (1-4) hurts WAY less than a rifle (6-16) or shotgun (4-20).
- NPCs should react realistically. Hostile NPCs and zombies attack back!
- ZOMBIE RULES: Zombies are attracted to noise. Gunshots draw hordes. Bites are deadly — bitten characters get infected and slowly turn unless treated. Headshots kill zombies. Body shots barely slow them down.
- SURVIVAL RULES: Resources are scarce. Ammo is limited. Food and water matter. Safe shelter is rare.
- MEDICAL RULES: If a player uses a Med Kit or medical supplies, they MUST receive HP healing (+15 to +30 HP depending on the roll). Medic class characters heal more effectively (+20 to +40). Always include positive hpChanges when meds are used.
- Players CAN die if HP reaches 0. Don't protect them. This is survival horror — death should feel real and impactful.
- Award XP: 10-50 per player based on what they did.
- You may introduce new NPCs (survivor groups, bandits, infected) or kill existing ones. Use South African characters, locations, and culture.
- IMPORTANT: Each character has a SECRET FLAW. These MUST affect gameplay! Low dice rolls + a relevant flaw = the flaw causes problems. Describe the EFFECTS without naming the flaw.
- End with a new tense situation for the next round — always maintain the threat of zombies, hostile survivors, or resource scarcity.
- Provide 3-4 suggested action options for the next round. These should be survival-focused choices (scavenge, fight, flee, fortify, negotiate, explore, rest). Players can also type their own custom action.

============================
RESPOND IN THIS EXACT JSON FORMAT (this is critical):
============================
{
  "narrative": "Vivid narrative of what happens this round. Use **bold** for character names and *italic* for dramatic moments.",
  "hpChanges": [
    {"character": "Character Name", "amount": -15, "reason": "hit by zombie bite"}
  ],
  "xpAwards": [
    {"character": "Character Name", "amount": 25}
  ],
  "newNpcs": [
    {"name": "Name", "description": "desc", "role": "hostile", "hp": 30, "maxHp": 30}
  ],
  "options": [
    "Option 1: A suggested action for the next round",
    "Option 2: Another possible action",
    "Option 3: A third choice"
  ]
}`;
  }
}

module.exports = { PromptBuilder };
