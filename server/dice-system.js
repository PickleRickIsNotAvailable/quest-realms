// ============================================================
// Dice System - Handles all random rolls
// ============================================================

class DiceSystem {
  // Roll a single die with N sides
  roll(sides) {
    return Math.floor(Math.random() * sides) + 1;
  }

  // Standard D20 roll with modifier
  rollD20(modifier = 0) {
    const base = this.roll(20);
    const total = base + modifier;
    return {
      base: base,
      modifier: modifier,
      total: Math.max(1, total),
      critical: base === 20,
      critFail: base === 1
    };
  }

  // Roll weapon damage based on equipped items
  rollWeaponDamage(equipment) {
    if (!equipment || equipment.length === 0) {
      // Unarmed
      return { weapon: 'Fists', damage: this.roll(3), min: 1, max: 3 };
    }

    const weaponStats = {
      'dagger': { min: 1, max: 4, dice: '1d4' },
      'knife': { min: 1, max: 4, dice: '1d4' },
      'baseball bat': { min: 2, max: 8, dice: '1d8' },
      'short sword': { min: 2, max: 6, dice: '1d6' },
      'longsword': { min: 3, max: 8, dice: '1d8' },
      'greatsword': { min: 4, max: 12, dice: '2d6' },
      'battle axe': { min: 4, max: 10, dice: '1d10' },
      'mace': { min: 3, max: 8, dice: '1d8' },
      'staff': { min: 2, max: 6, dice: '1d6' },
      'bow': { min: 2, max: 8, dice: '1d8' },
      'crossbow': { min: 3, max: 10, dice: '1d10' },
      'pistol': { min: 5, max: 14, dice: '2d7' },
      'rifle': { min: 6, max: 16, dice: '2d8' },
      'shotgun': { min: 4, max: 20, dice: '4d5' },
      'wand': { min: 3, max: 10, dice: '1d10' },
      'spell book': { min: 2, max: 12, dice: '2d6' },
      'flashlight': { min: 1, max: 2, dice: '1d2' }
    };

    // Find the best weapon in equipment
    let bestWeapon = null;
    let bestStats = null;

    for (const item of equipment) {
      const lower = item.toLowerCase();
      for (const [weapon, stats] of Object.entries(weaponStats)) {
        if (lower.includes(weapon)) {
          if (!bestStats || stats.max > bestStats.max) {
            bestWeapon = item;
            bestStats = stats;
          }
        }
      }
    }

    if (!bestStats) {
      return { weapon: equipment[0] || 'Unknown', damage: this.roll(4), min: 1, max: 4 };
    }

    // Roll the damage
    const damage = Math.floor(Math.random() * (bestStats.max - bestStats.min + 1)) + bestStats.min;
    
    return {
      weapon: bestWeapon,
      damage: damage,
      min: bestStats.min,
      max: bestStats.max,
      dice: bestStats.dice
    };
  }

  // Roll for skill check
  rollSkillCheck(skill, difficulty = 10) {
    const roll = this.rollD20();
    return {
      ...roll,
      skill: skill,
      difficulty: difficulty,
      success: roll.total >= difficulty,
      margin: roll.total - difficulty
    };
  }
}

module.exports = { DiceSystem };
