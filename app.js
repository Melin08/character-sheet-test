"use strict";

const firebaseConfig = {
  apiKey: "AIzaSyAIKe_hrxyQvn4uebwU5OZrP2qf-FwK0Rg",
  authDomain: "character-sheet-bd250.firebaseapp.com",
  projectId: "character-sheet-bd250",
  storageBucket: "character-sheet-bd250.firebasestorage.app",
  messagingSenderId: "881155587941",
  appId: "1:881155587941:web:45087fba9dc7154fddeb8c",
  measurementId: "G-E0LD6CXQ2W"
};

let auth = null;
let db = null;
let analytics = null;
let currentUser = null;

try {
  if (typeof firebase !== "undefined") {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    if (firebase.analytics) analytics = firebase.analytics();
  }
} catch (err) {
  console.warn("Firebase initialization skipped or failed:", err);
}

const ROSTER_STORAGE_KEY = "badman_char_roster_v1";
const ACTIVE_CHAR_ID_KEY = "badman_active_char_id";

let activeCharId = localStorage.getItem(ACTIVE_CHAR_ID_KEY) || "default";

let myCharacterSpells = [];
let myCharacterTraits = [];
let myCharacterWeapons = [
  { name: "", atk: "", dmg: "", notes: "" },
  { name: "", atk: "", dmg: "", notes: "" }
];
let myActiveConditions = [];
let myBlurredPills = [];
let diceRollHistory = [];

let draggedSpellIndex = null;
const apiCache = {};

let allSpellsCache = [];
let allTraitsCache = [];

const DND_CLASSES = [
  "Barbarian", "Bard", "Cleric", "Druid", "Fighter",
  "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer",
  "Warlock", "Wizard", "Artificer", "Blood Hunter"
];

const DND_RACES_CATALOG = [
  { race: "Dragonborn", subraces: ["Black Dragonborn", "Blue Dragonborn", "Brass Dragonborn", "Bronze Dragonborn", "Copper Dragonborn", "Gold Dragonborn", "Green Dragonborn", "Red Dragonborn", "Silver Dragonborn", "White Dragonborn"] },
  { race: "Dwarf", subraces: ["Hill Dwarf", "Mountain Dwarf", "Duergar"] },
  { race: "Elf", subraces: ["High Elf", "Wood Elf", "Dark Elf (Drow)", "Eladrin", "Sea Elf", "Shadar-kai"] },
  { race: "Gnome", subraces: ["Forest Gnome", "Rock Gnome", "Deep Gnome (Svirfneblin)"] },
  { race: "Half-Elf", subraces: ["Half-Elf (Standard)", "Half-Elf (Aquatic)", "Half-Elf (Drow)", "Half-Elf (Wood Elf)"] },
  { race: "Half-Orc", subraces: ["Half-Orc"] },
  { race: "Halfling", subraces: ["Lightfoot Halfling", "Stout Halfling", "Ghostwise Halfling"] },
  { race: "Human", subraces: ["Standard Human", "Variant Human"] },
  { race: "Tiefling", subraces: ["Tiefling (Bloodline of Asmodeus)", "Tiefling (Bloodline of Baalzebul)", "Tiefling (Bloodline of Dispater)", "Tiefling (Bloodline of Fierna)", "Tiefling (Bloodline of Glasya)", "Tiefling (Bloodline of Levistus)", "Tiefling (Bloodline of Mammon)", "Tiefling (Bloodline of Mephistopheles)", "Tiefling (Bloodline of Zariel)", "Feral Tiefling"] },
  { race: "Aasimar", subraces: ["Protector Aasimar", "Scourge Aasimar", "Fallen Aasimar"] },
  { race: "Genasi", subraces: ["Air Genasi", "Earth Genasi", "Fire Genasi", "Water Genasi"] },
  { race: "Goliath", subraces: ["Goliath"] },
  { race: "Tabaxi", subraces: ["Tabaxi"] },
  { race: "Tortle", subraces: ["Tortle"] },
  { race: "Kenku", subraces: ["Kenku"] },
  { race: "Firbolg", subraces: ["Firbolg"] },
  { race: "Changeling", subraces: ["Changeling"] },
  { race: "Warforged", subraces: ["Warforged"] }
];

const SRD_SPELL_LEVELS = {
  "acid-arrow": 2, "acid-splash": 0, "aid": 2, "alarm": 1, "alter-self": 2, "animal-friendship": 1,
  "animal-messenger": 2, "animal-shapes": 8, "animate-dead": 3, "animate-objects": 5, "antimagic-field": 8,
  "antipathy-sympathy": 8, "arcane-eye": 4, "arcane-hand": 5, "arcane-lock": 2, "arcane-sword": 7,
  "arcanists-magic-aura": 2, "astral-projection": 9, "augury": 2, "awaken": 5, "bane": 1, "banishment": 4,
  "barkskin": 2, "beacon-of-hope": 3, "bestow-curse": 3, "black-tentacles": 4, "blade-barrier": 6,
  "bless": 1, "blight": 4, "blindness-deafness": 2, "blink": 3, "blur": 2, "branding-smite": 2,
  "burning-hands": 1, "call-lightning": 3, "calm-emotions": 2, "chain-lightning": 6, "charm-person": 1,
  "chill-touch": 0, "circle-of-death": 6, "clairvoyance": 3, "clone": 8, "cloudkill": 5, "color-spray": 1,
  "command": 1, "commune": 5, "commune-with-nature": 5, "comprehend-languages": 1, "cone-of-cold": 5,
  "confusion": 4, "conjure-animals": 3, "conjure-celestial": 7, "conjure-elemental": 5, "conjure-fey": 6,
  "conjure-minor-elementals": 4, "conjure-woodland-beings": 4, "contact-other-plane": 5, "contagion": 5,
  "contingency": 6, "continual-flame": 2, "control-water": 4, "control-weather": 8, "counterspell": 3,
  "create-food-and-water": 3, "create-or-destroy-water": 1, "create-undead": 6, "creation": 5,
  "cure-wounds": 1, "darkness": 2, "darkvision": 2, "daylight": 3, "death-ward": 4, "delayed-blast-fireball": 7,
  "demiplane": 8, "detect-evil-and-good": 1, "detect-magic": 1, "detect-poison-and-disease": 1,
  "detect-thoughts": 2, "dimension-door": 4, "disguise-self": 1, "disintegrate": 6, "dispel-evil-and-good": 5,
  "dispel-magic": 3, "divination": 4, "divine-favor": 1, "divine-word": 7, "dominate-beast": 4,
  "dominate-monster": 8, "dominate-person": 5, "dream": 5, "earthquake": 8, "eldritch-blast": 0,
  "enhance-ability": 2, "enlarge-reduce": 2, "entangle": 1, "enthrall": 2, "etherealness": 7,
  "expeditious-retreat": 1, "eyebite": 6, "fabricate": 4, "faerie-fire": 1, "faithful-hound": 4,
  "false-life": 1, "fear": 3, "feather-fall": 1, "feeblemind": 8, "find-familiar": 1, "find-steed": 2,
  "find-the-path": 6, "find-traps": 2, "finger-of-death": 7, "fire-shield": 4, "fire-storm": 7,
  "fireball": 3, "fire-bolt": 0, "flame-blade": 2, "flame-strike": 5, "flaming-sphere": 2, "flesh-to-stone": 6,
  "fly": 3, "fog-cloud": 1, "forbiddance": 6, "forcecage": 7, "foresight": 9, "freedom-of-movement": 4,
  "freezing-sphere": 6, "gaseous-form": 3, "gate": 9, "geas": 5, "gentle-repose": 2, "glibness": 8,
  "globe-of-invulnerability": 6, "glyph-of-warding": 3, "grease": 1, "greater-invisibility": 4,
  "greater-restoration": 5, "guardian-of-faith": 4, "guards-and-wards": 6, "guidance": 0, "guiding-bolt": 1,
  "gust-of-wind": 2, "hallow": 5, "hallucinatory-terrain": 4, "harm": 6, "haste": 3, "heal": 6,
  "healing-word": 1, "heat-metal": 2, "hellish-rebuke": 1, "heroes-feast": 6, "heroism": 1, "hideous-laughter": 1,
  "hold-monster": 5, "hold-person": 2, "holy-aura": 8, "hunters-mark": 1, "hypnotic-pattern": 3,
  "ice-storm": 4, "identify": 1, "illusory-script": 1, "imprisonment": 9, "incendiary-cloud": 8,
  "inflict-wounds": 1, "insect-plague": 5, "instant-summons": 6, "invisibility": 2, "jump": 1, "knock": 2,
  "legend-lore": 5, "lesser-restoration": 2, "levitate": 2, "light": 0, "lightning-bolt": 3,
  "locate-animals-or-plants": 2, "locate-creature": 4, "locate-object": 2, "longstrider": 1, "mage-armor": 1,
  "mage-hand": 0, "magic-circle": 3, "magic-jar": 6, "magic-missile": 1, "magic-mouth": 2, "magic-weapon": 2,
  "magnificent-mansion": 7, "major-image": 3, "mass-cure-wounds": 5, "mass-heal": 9, "mass-healing-word": 3,
  "mass-suggestion": 6, "maze": 8, "meld-into-stone": 3, "mending": 0, "message": 0, "meteor-swarm": 9,
  "mind-blank": 8, "minor-illusion": 0, "mirage-arcane": 7, "mirror-image": 2, "mislead": 5, "misty-step": 2,
  "modify-memory": 5, "moonbeam": 2, "move-earth": 6, "nondetection": 3, "pass-without-trace": 2,
  "passwall": 5, "phantasmal-killer": 4, "phantom-steed": 3, "planar-ally": 6, "planar-binding": 5,
  "plane-shift": 7, "plant-growth": 3, "poison-spray": 0, "polymorph": 4, "power-word-kill": 9,
  "power-word-stun": 8, "prayer-of-healing": 2, "prestidigitation": 0, "prismatic-spray": 7,
  "prismatic-wall": 9, "produce-flame": 0, "programmed-illusion": 6, "project-image": 7,
  "protection-from-energy": 3, "protection-from-evil-and-good": 1, "protection-from-poison": 2,
  "purify-food-and-drink": 1, "raise-dead": 5, "ray-of-enfeeblement": 2, "ray-of-frost": 0,
  "regenerate": 7, "reincarnate": 5, "remove-curse": 3, "resilient-sphere": 4, "resistance": 0,
  "resurrection": 7, "reverse-gravity": 7, "revivify": 3, "rope-trick": 2, "sacred-flame": 0,
  "sanctuary": 1, "scorching-ray": 2, "scrying": 5, "secret-chest": 4, "see-invisibility": 2, "seeming": 5,
  "sending": 3, "sequester": 7, "shapechange": 9, "shatter": 2, "shield": 1, "shield-of-faith": 1,
  "shillelagh": 0, "shocking-grasp": 0, "silence": 2, "silent-image": 1, "simulacrum": 7, "sleep": 1,
  "sleet-storm": 3, "slow": 3, "speak-with-animals": 1, "speak-with-dead": 3, "speak-with-plants": 3,
  "spider-climb": 2, "spike-growth": 2, "spirit-guardians": 3, "spiritual-weapon": 2, "stinking-cloud": 3,
  "stone-shape": 4, "stoneskin": 4, "storm-of-vengeance": 9, "suggestion": 2, "sunbeam": 6, "sunburst": 8,
  "symbol": 7, "telekinesis": 5, "telepathic-bond": 5, "teleport": 7, "teleportation-circle": 5,
  "thaumaturgy": 0, "thunderwave": 1, "time-stop": 9, "tiny-hut": 3, "tongues": 3, "transport-via-plants": 6,
  "tree-stride": 5, "true-polymorph": 9, "true-resurrection": 9, "true-seeing": 6, "true-strike": 0,
  "unseen-servant": 1, "vampiric-touch": 3, "vicious-mockery": 0, "wall-of-fire": 4, "wall-of-force": 5,
  "wall-of-ice": 6, "wall-of-stone": 5, "wall-of-thorns": 6, "warding-bond": 2, "water-breathing": 3,
  "water-walk": 3, "web": 2, "weird": 9, "wind-walk": 6, "wind-wall": 3, "wish": 9, "word-of-recall": 6,
  "zone-of-truth": 2
};

const BUILTIN_SPELLS = [
  { name: "Hunter's Mark", levelTag: "Level 1", schoolTag: "Divination", classesTag: "Ranger", casting_time: "1 Bonus Action", range: "90 ft", duration: "Concentration, up to 1 hour", desc: "Mark quarry for extra 1d6 damage." },
  { name: "Shield", levelTag: "Level 1", schoolTag: "Abjuration", classesTag: "Sorcerer, Wizard", casting_time: "1 Reaction", range: "Self", duration: "1 round", desc: "Gain +5 bonus to AC until start of your next turn and take no magic missile damage." },
  { name: "Fireball", levelTag: "Level 3", schoolTag: "Evocation", classesTag: "Sorcerer, Wizard", casting_time: "1 Action", range: "150 ft", duration: "Instantaneous", desc: "A 20-foot radius burst of flame deals 8d6 fire damage on failed Dexterity save." },
  { name: "Cure Wounds", levelTag: "Level 1", schoolTag: "Evocation", classesTag: "Bard, Cleric, Druid, Paladin, Ranger", casting_time: "1 Action", range: "Touch", duration: "Instantaneous", desc: "Restore 1d8 + spellcasting modifier hit points to a touched creature." },
  { name: "Misty Step", levelTag: "Level 2", schoolTag: "Conjuration", classesTag: "Sorcerer, Warlock, Wizard", casting_time: "1 Bonus Action", range: "Self", duration: "Instantaneous", desc: "Teleport up to 30 feet to an unoccupied space you can see." }
];

const BUILTIN_TRAITS = [
  { name: "Action Surge", classes: ["Fighter"], desc: "Take one additional action on your turn once per short or long rest." },
  { name: "Sneak Attack", classes: ["Rogue"], desc: "Deal extra damage once per turn with advantage or adjacent ally." },
  { name: "Rage", classes: ["Barbarian"], desc: "Enter a rage for advantage on Strength checks, weapon damage bonus, and physical resistance." }
];

function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#039;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

let toastTimer = null;
function showStatus(text) {
  const toast = document.getElementById("saveToast");
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.classList.remove("show"); }, 2000);
}

function getModifier(score) {
  return Math.floor((score - 10) / 2);
}

function getProfBonus(level) {
  return Math.ceil(1 + level / 4);
}

function getSchoolCssClass(school) {
  if (!school) return "school-transmutation";
  const s = school.toLowerCase();
  if (s.includes("abjur")) return "school-abjuration";
  if (s.includes("conjur")) return "school-conjuration";
  if (s.includes("divin")) return "school-divination";
  if (s.includes("enchant")) return "school-enchantment";
  if (s.includes("evoc")) return "school-evocation";
  if (s.includes("illus")) return "school-illusion";
  if (s.includes("necro")) return "school-necromancy";
  if (s.includes("transmut")) return "school-transmutation";
  return "school-transmutation";
}

function getClassCssClass(className) {
  if (!className) return "class-fighter";
  const c = className.toLowerCase();
  if (c.includes("barbarian")) return "class-barbarian";
  if (c.includes("bard")) return "class-bard";
  if (c.includes("cleric")) return "class-cleric";
  if (c.includes("druid")) return "class-druid";
  if (c.includes("fighter")) return "class-fighter";
  if (c.includes("monk")) return "class-monk";
  if (c.includes("paladin")) return "class-paladin";
  if (c.includes("ranger")) return "class-ranger";
  if (c.includes("rogue")) return "class-rogue";
  if (c.includes("sorcerer")) return "class-sorcerer";
  if (c.includes("warlock")) return "class-warlock";
  if (c.includes("wizard")) return "class-wizard";
  if (c.includes("artificer")) return "class-artificer";
  return "class-fighter";
}

function getRaceCssClass(raceName) {
  if (!raceName) return "race-generic";
  const r = raceName.toLowerCase();
  if (r.includes("elf")) return "race-elf";
  if (r.includes("dwarf")) return "race-dwarf";
  if (r.includes("tiefling")) return "race-tiefling";
  if (r.includes("dragon")) return "race-dragonborn";
  return "race-generic";
}

function recalculateAll() {
  const levelInput = document.getElementById("charLevel");
  const level = parseInt(levelInput?.value, 10) || 1;
  const prof = getProfBonus(level);

  const profBonusDisplay = document.getElementById("profBonusDisplay");
  if (profBonusDisplay) profBonusDisplay.textContent = prof >= 0 ? `+${prof}` : `${prof}`;

  const stats = ["str", "dex", "con", "int", "wis", "cha"];
  const mods = {};

  stats.forEach((stat) => {
    const scoreVal = parseInt(document.getElementById(`attr_${stat}`)?.value, 10) || 10;
    const mod = getModifier(scoreVal);
    mods[stat] = mod;

    const modElem = document.getElementById(`mod_${stat}`);
    if (modElem) modElem.textContent = mod >= 0 ? `+${mod}` : mod;

    const isSaveChecked = document.getElementById(`save_${stat}`)?.checked;
    const saveValElem = document.getElementById(`save_val_${stat}`);
    if (saveValElem) {
      const saveTotal = isSaveChecked ? mod + prof : mod;
      saveValElem.textContent = saveTotal >= 0 ? `+${saveTotal}` : saveTotal;
    }
  });

  document.querySelectorAll(".skill-row").forEach((row) => {
    const stat = row.dataset.stat;
    const statMod = mods[stat] ?? 0;
    const isProf = row.querySelector(".prof-cb")?.checked;
    const isExp = row.querySelector(".exp-cb")?.checked;

    let total = statMod;
    if (isProf) total += prof;
    if (isExp) total += prof;

    const valElem = row.querySelector(".skill-val");
    if (valElem) valElem.textContent = total >= 0 ? `+${total}` : total;
  });
}

function renderWeapons() {
  const container = document.getElementById("weaponsContainer");
  if (!container) return;

  if (!Array.isArray(myCharacterWeapons)) {
    myCharacterWeapons = [];
  }

  while (myCharacterWeapons.length < 2) {
    myCharacterWeapons.push({ name: "", atk: "", dmg: "", notes: "" });
  }

  container.innerHTML = myCharacterWeapons.map((wpn, idx) => `
    <div class="attack-entry weapon-row-card" data-index="${idx}">
      <input type="text" class="save-field wpn-field wpn-name-input" data-prop="name" value="${escapeHtml(wpn.name || "")}" placeholder="Weapon name..." />
      <input type="text" class="save-field wpn-field wpn-type-input center" data-prop="atk" value="${escapeHtml(wpn.atk || "")}" placeholder="Type" />
      <input type="text" class="save-field wpn-field wpn-dmg-input center" data-prop="dmg" value="${escapeHtml(wpn.dmg || "")}" placeholder="1d8" />
      <input type="text" class="save-field wpn-field wpn-notes-input" data-prop="notes" value="${escapeHtml(wpn.notes || "")}" placeholder="Range, properties, notes..." />
      <button type="button" class="weapon-delete-btn" data-index="${idx}" title="Delete weapon">&times;</button>
    </div>
  `).join("");
}

function renderMyTraits() {
  const container = document.getElementById("traitsList");
  if (!container) return;

  if (myCharacterTraits.length === 0) {
    container.innerHTML = `<p style="grid-column: 1 / -1; font-size: 0.88rem; color: #64748b; font-style: italic; padding: 0.5rem 0;">No abilities added yet. Click "+ Add Ability" above to browse the compendium.</p>`;
    return;
  }

  container.innerHTML = myCharacterTraits.map((trait, idx) => {
    if (!trait) return "";
    const isExpanded = !!trait.isExpanded;
    return `
      <div class="trait-card ${isExpanded ? 'expanded' : ''}" data-index="${idx}">
        <div class="trait-card-header">
          <input type="text" class="trait-name-input custom-trait-field" data-prop="name" value="${escapeHtml(trait.name || '')}" placeholder="Ability Name" />
          <button class="trait-card-delete" data-index="${idx}" type="button" title="Delete ability">&times;</button>
        </div>
        <div class="trait-type-wrap">
          <input type="text" class="trait-type-input custom-trait-field" data-prop="type" value="${escapeHtml(trait.type || 'FEATURE')}" placeholder="Category" />
        </div>
        <textarea class="trait-desc-input custom-trait-field" data-prop="desc" placeholder="Ability description and rules...">${escapeHtml(trait.desc || '')}</textarea>
        <div class="trait-card-footer">
          <button type="button" class="trait-expand-btn">
            ${isExpanded ? 'Collapse' : 'Expand'}
            <span class="trait-expand-icon">▼</span>
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function renderMySpells() {
  const container = document.getElementById("spellsList");
  if (!container) return;

  if (myCharacterSpells.length === 0) {
    container.innerHTML = `<p style="grid-column: 1 / -1; font-size: 0.88rem; color: #64748b; text-align: center; font-style: italic; padding: 1rem 0;">No spells added yet. Click "+ Add Spell" above to browse the compendium.</p>`;
    return;
  }

  container.innerHTML = myCharacterSpells.map((spell, idx) => {
    if (!spell) return "";
    const typeVal = spell.type || spell.levelTag || "Cantrip";
    const descVal = Array.isArray(spell.desc) ? spell.desc.join("\n\n") : (spell.desc || "");
    return `
      <div class="spell-card" draggable="true" data-index="${idx}">
        <div class="spell-card-header">
          <span class="spell-drag-handle" title="Drag to reorder">⋮⋮</span>
          <input type="text" class="spell-custom-title-input custom-spell-field" data-prop="name" value="${escapeHtml(spell.name || "")}" placeholder="Spell Name" />
          <button class="spell-card-delete" data-index="${idx}" type="button" title="Delete spell">&times;</button>
        </div>
        <div class="spell-card-meta">
          <div class="spell-meta-badge">
            <input type="text" class="spell-meta-input custom-spell-field center" data-prop="type" value="${escapeHtml(typeVal)}" placeholder="Level / Type" />
          </div>
          <div class="spell-meta-badge">
            <input type="text" class="spell-meta-input custom-spell-field center" data-prop="casting_time" value="${escapeHtml(spell.casting_time || "")}" placeholder="1 Action" />
          </div>
          <div class="spell-meta-badge">
            <input type="text" class="spell-meta-input custom-spell-field center" data-prop="range" value="${escapeHtml(spell.range || "")}" placeholder="30 ft" />
          </div>
          <div class="spell-meta-badge">
            <input type="text" class="spell-meta-input custom-spell-field center" data-prop="duration" value="${escapeHtml(spell.duration || "")}" placeholder="Instant" />
          </div>
        </div>
        <textarea class="spell-custom-desc-textarea custom-spell-field" data-prop="desc" placeholder="Spell description and effects...">${escapeHtml(descVal)}</textarea>
      </div>
    `;
  }).join("");

  attachSpellDragEvents();
}

function attachSpellDragEvents() {
  document.querySelectorAll(".spell-card").forEach((card) => {
    card.addEventListener("dragstart", (e) => {
      if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) {
        e.preventDefault();
        return;
      }
      draggedSpellIndex = parseInt(card.dataset.index, 10);
      e.dataTransfer.effectAllowed = "move";
      card.style.opacity = "0.4";
    });

    card.addEventListener("dragend", () => {
      card.style.opacity = "1";
      document.querySelectorAll(".spell-card").forEach((c) => c.classList.remove("drag-over"));
      draggedSpellIndex = null;
    });

    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      card.classList.add("drag-over");
    });

    card.addEventListener("dragleave", () => {
      card.classList.remove("drag-over");
    });

    card.addEventListener("drop", (e) => {
      e.preventDefault();
      card.classList.remove("drag-over");
      if (draggedSpellIndex === null) return;
      const targetIndex = parseInt(card.dataset.index, 10);
      if (draggedSpellIndex === targetIndex) return;

      const moved = myCharacterSpells.splice(draggedSpellIndex, 1)[0];
      myCharacterSpells.splice(targetIndex, 0, moved);
      saveSheet(false);
      renderMySpells();
    });
  });
}

function addDiceHistory(desc, total) {
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  diceRollHistory.unshift({ desc, total, time });
  if (diceRollHistory.length > 25) diceRollHistory.pop();
  renderDiceHistory();
}

function renderDiceHistory() {
  const container = document.getElementById("diceHistoryList");
  if (!container) return;

  if (diceRollHistory.length === 0) {
    container.innerHTML = `<span class="dice-history-empty">No rolls logged yet.</span>`;
    return;
  }

  container.innerHTML = diceRollHistory.map((item) => `
    <div class="dice-history-item">
      <span class="dice-history-desc">${escapeHtml(item.desc)} <small style="color:#64748b;">(${item.time})</small></span>
      <span class="dice-history-val">${escapeHtml(String(item.total))}</span>
    </div>
  `).join("");
}

function renderConditionChips() {
  document.querySelectorAll(".cond-chip").forEach((chip) => {
    const cond = chip.dataset.cond;
    if (myActiveConditions.includes(cond)) chip.classList.add("active");
    else chip.classList.remove("active");
  });
}

function renderBlurredPills() {
  document.querySelectorAll(".field-pill[data-blur-id]").forEach((pill) => {
    const blurId = pill.dataset.blurId;
    if (myBlurredPills.includes(blurId)) pill.classList.add("blurred");
    else pill.classList.remove("blurred");
  });
}

function getRoster() {
  try {
    return JSON.parse(localStorage.getItem(ROSTER_STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

async function syncRosterToCloud(roster) {
  if (!currentUser || !db) return;
  try {
    await db.collection("users").doc(currentUser.uid).set({
      roster: roster,
      updatedAt: Date.now()
    }, { merge: true });
  } catch (err) {
    console.error("Cloud sync failed:", err);
  }
}

function saveRoster(roster) {
  localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(roster));
  syncRosterToCloud(roster);
}

function getCurrentSheetData() {
  const fields = {};
  document.querySelectorAll(".save-field").forEach((field) => {
    if (field.id) {
      fields[field.id] = field.type === "checkbox" ? field.checked : field.value;
    }
  });
  return fields;
}

function saveSheet(quiet = false) {
  const roster = getRoster();
  const fields = getCurrentSheetData();
  const name = fields.charName?.trim() || "Unnamed Character";
  const charClass = fields.charClass?.trim() || "";
  const level = fields.charLevel || 1;

  roster[activeCharId] = {
    id: activeCharId,
    name: name,
    summary: charClass ? `${charClass} (Lvl ${level})` : `Level ${level}`,
    updatedAt: Date.now(),
    fields: fields,
    spells: myCharacterSpells,
    traits: myCharacterTraits,
    weapons: myCharacterWeapons,
    conditions: myActiveConditions,
    blurredPills: myBlurredPills
  };

  saveRoster(roster);
  localStorage.setItem(ACTIVE_CHAR_ID_KEY, activeCharId);
  if (!quiet) showStatus("Saved!");
}

function applyCharacterData(charData) {
  if (!charData) return;
  const fields = charData.fields || {};
  Object.keys(fields).forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      if (el.type === "checkbox") el.checked = fields[id];
      else el.value = fields[id];
    }
  });

  myCharacterSpells = charData.spells || [];
  myCharacterTraits = charData.traits || [];
  myActiveConditions = charData.conditions || [];
  myBlurredPills = charData.blurredPills || [];
  myCharacterWeapons = charData.weapons && charData.weapons.length >= 2 ? charData.weapons : [
    { name: "", atk: "", dmg: "", notes: "" },
    { name: "", atk: "", dmg: "", notes: "" }
  ];

  renderWeapons();
  renderMySpells();
  renderMyTraits();
  renderConditionChips();
  renderBlurredPills();
  recalculateAll();
}

function loadSheet() {
  const roster = getRoster();
  if (roster[activeCharId]) {
    applyCharacterData(roster[activeCharId]);
  } else {
    const keys = Object.keys(roster);
    if (keys.length > 0) {
      activeCharId = keys[0];
      localStorage.setItem(ACTIVE_CHAR_ID_KEY, activeCharId);
      applyCharacterData(roster[activeCharId]);
    } else {
      recalculateAll();
      renderWeapons();
      renderMySpells();
      renderMyTraits();
      renderConditionChips();
      renderBlurredPills();
    }
  }
}

function resetSheet() {
  activeCharId = "char_" + Date.now();
  localStorage.setItem(ACTIVE_CHAR_ID_KEY, activeCharId);

  document.querySelectorAll(".save-field").forEach((field) => {
    if (field.type === "checkbox") field.checked = false;
    else if (field.id === "charLevel") field.value = 1;
    else if (field.id === "ac" || field.id === "curHp" || field.id === "maxHp") field.value = 10;
    else if (field.classList.contains("attr-input")) field.value = 10;
    else if (field.id === "charSpeed") field.value = 30;
    else if (field.id === "hitDiceCur" || field.id === "hitDiceMax") field.value = 1;
    else if (
      field.classList.contains("hitdice-input") ||
      field.classList.contains("coin-input") ||
      field.classList.contains("slot-input") ||
      field.classList.contains("death-input") ||
      field.classList.contains("res-input") ||
      field.classList.contains("exhaustion-input")
    ) field.value = 0;
    else field.value = "";
  });

  myCharacterSpells = [];
  myCharacterTraits = [];
  myActiveConditions = [];
  myBlurredPills = [];
  myCharacterWeapons = [
    { name: "", atk: "", dmg: "", notes: "" },
    { name: "", atk: "", dmg: "", notes: "" }
  ];
  diceRollHistory = [];

  renderDiceHistory();
  recalculateAll();
  renderWeapons();
  renderMySpells();
  renderMyTraits();
  renderConditionChips();
  renderBlurredPills();
  saveSheet(false);
  showStatus("New Sheet Created!");
}

function renderCharList() {
  const container = document.getElementById("charList");
  if (!container) return;
  const roster = getRoster();
  const keys = Object.keys(roster);

  if (keys.length === 0) {
    container.innerHTML = `<p class="loading-text" style="color: #64748b; font-style: italic;">No saved characters found.</p>`;
    return;
  }

  container.innerHTML = keys.map((id) => {
    const char = roster[id];
    const isActive = id === activeCharId;
    return `
      <div class="char-item-row" data-id="${id}">
        <div class="char-item-info">
          <span class="char-item-name">${escapeHtml(char.name || "Unnamed Character")}</span>
          <span class="char-item-sub">${escapeHtml(char.summary || "")}</span>
        </div>
        <div class="char-actions">
          <button type="button" class="char-select-btn ${isActive ? "active" : ""}">${isActive ? "Active" : "Select"}</button>
          <button type="button" class="char-delete-btn" title="Delete character">&times;</button>
        </div>
      </div>
    `;
  }).join("");
}

function renderClassDropdown(filter = "") {
  const dropdown = document.getElementById("classDropdown");
  if (!dropdown) return;
  const q = filter.toLowerCase().trim();
  const filtered = DND_CLASSES.filter((c) => c.toLowerCase().includes(q));

  if (filtered.length === 0) {
    dropdown.innerHTML = `<div class="dropdown-item" style="color:#64748b; cursor:default;">No classes match</div>`;
    return;
  }

  dropdown.innerHTML = filtered.map((c) => `
    <div class="dropdown-item select-class-item" data-name="${escapeHtml(c)}">${escapeHtml(c)}</div>
  `).join("");
}

function renderRaceDropdown(filter = "") {
  const dropdown = document.getElementById("raceDropdown");
  if (!dropdown) return;
  const q = filter.toLowerCase().trim();

  let html = "";
  DND_RACES_CATALOG.forEach((group) => {
    const subMatches = group.subraces.filter((s) => s.toLowerCase().includes(q));
    const raceMatches = group.race.toLowerCase().includes(q);

    if (raceMatches || subMatches.length > 0) {
      html += `<div class="dropdown-header-item">${escapeHtml(group.race)}</div>`;
      if (!q || raceMatches) {
        html += `<div class="dropdown-item select-race-item" data-name="${escapeHtml(group.race)}">${escapeHtml(group.race)} (Base)</div>`;
      }
      const listToDisplay = q && !raceMatches ? subMatches : group.subraces;
      listToDisplay.forEach((sub) => {
        if (sub !== group.race) {
          html += `<div class="dropdown-item subrace-item select-race-item" data-name="${escapeHtml(sub)}">${escapeHtml(sub)}</div>`;
        }
      });
    }
  });

  dropdown.innerHTML = html || `<div class="dropdown-item" style="color:#64748b; cursor:default;">No races match</div>`;
}

async function fetchAPI(url) {
  if (apiCache[url]) return apiCache[url];
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    apiCache[url] = data;
    return data;
  } catch (err) {
    return null;
  }
}

function getSpellLevelTag(s) {
  if (s.levelTag) return s.levelTag;
  let lvl = s.level;
  if (lvl === undefined) {
    const key = (s.index || s.name || "").toLowerCase().replace(/[^a-z0-9]/g, '-');
    lvl = SRD_SPELL_LEVELS[key];
  }
  if (lvl === 0) return "Cantrip";
  if (lvl !== undefined && lvl !== null) return `Level ${lvl}`;
  return "Spell";
}

async function loadAllSpells() {
  if (allSpellsCache.length > 0) return allSpellsCache;
  const res = await fetchAPI("https://www.dnd5eapi.co/api/spells");
  if (res && res.results && res.results.length > 0) {
    const combined = [...BUILTIN_SPELLS];
    res.results.forEach((s) => {
      if (!combined.some((b) => b.name.toLowerCase() === s.name.toLowerCase())) {
        combined.push({
          name: s.name,
          url: s.url,
          index: s.index,
          level: s.level,
          levelTag: getSpellLevelTag(s)
        });
      }
    });
    allSpellsCache = combined;
  } else {
    allSpellsCache = [...BUILTIN_SPELLS];
  }
  return allSpellsCache;
}

async function enrichSpellList(items) {
  const topSlice = items.slice(0, 25);
  let updated = false;
  await Promise.all(topSlice.map(async (s) => {
    if (!s.schoolTag && s.url) {
      const data = await fetchAPI("https://www.dnd5eapi.co" + s.url);
      if (data) {
        s.levelTag = data.level === 0 ? "Cantrip" : `Level ${data.level}`;
        s.schoolTag = data.school?.name || "";
        s.classesTag = (data.classes || []).map((c) => c.name).join(", ");
        s.casting_time = data.casting_time || "1 Action";
        s.range = data.range || "30 ft";
        s.duration = data.duration || "Instantaneous";
        s.desc = Array.isArray(data.desc) ? data.desc.join("\n\n") : (data.desc || "");
        updated = true;
      }
    }
  }));
  return updated;
}

async function loadAllTraits() {
  if (allTraitsCache.length > 0) return allTraitsCache;
  const combined = [...BUILTIN_TRAITS];
  const [f, t] = await Promise.all([
    fetchAPI("https://www.dnd5eapi.co/api/features"),
    fetchAPI("https://www.dnd5eapi.co/api/traits")
  ]);

  if (f && f.results) {
    f.results.forEach((item) => {
      if (!combined.some((b) => b.name.toLowerCase() === item.name.toLowerCase())) {
        combined.push({ name: item.name, url: item.url, type: "Class Feature" });
      }
    });
  }
  if (t && t.results) {
    t.results.forEach((item) => {
      if (!combined.some((b) => b.name.toLowerCase() === item.name.toLowerCase())) {
        combined.push({ name: item.name, url: item.url, type: "Racial Trait" });
      }
    });
  }
  allTraitsCache = combined;
  syncClassAndRaceFeatureTags();
  return allTraitsCache;
}

async function syncClassAndRaceFeatureTags() {
  const classes = ["barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"];
  const races = ["dragonborn", "dwarf", "elf", "gnome", "half-elf", "half-orc", "halfling", "human", "tiefling"];

  const classFetches = classes.map((c) => fetchAPI(`https://www.dnd5eapi.co/api/classes/${c}/features`));
  const raceFetches = races.map((r) => fetchAPI(`https://www.dnd5eapi.co/api/races/${r}/traits`));

  const [classResults, raceResults] = await Promise.all([
    Promise.all(classFetches),
    Promise.all(raceFetches)
  ]);

  classResults.forEach((res, idx) => {
    if (res && res.results) {
      const className = classes[idx].charAt(0).toUpperCase() + classes[idx].slice(1);
      res.results.forEach((feat) => {
        const match = allTraitsCache.find((t) => t.name.toLowerCase() === feat.name.toLowerCase());
        if (match) {
          if (!match.classes) match.classes = [];
          if (!match.classes.includes(className)) match.classes.push(className);
        }
      });
    }
  });

  raceResults.forEach((res, idx) => {
    if (res && res.results) {
      const raceName = races[idx].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-');
      res.results.forEach((trait) => {
        const match = allTraitsCache.find((t) => t.name.toLowerCase() === trait.name.toLowerCase());
        if (match) {
          if (!match.races) match.races = [];
          if (!match.races.includes(raceName)) match.races.push(raceName);
        }
      });
    }
  });

  const traitModal = document.getElementById("traitModal");
  if (traitModal && traitModal.classList.contains("open")) {
    const query = document.getElementById("traitSearchInput")?.value.toLowerCase().trim() || "";
    const filtered = allTraitsCache.filter((t) => {
      const matchName = (t.name || "").toLowerCase().includes(query);
      const matchType = (t.type || "").toLowerCase().includes(query);
      const matchClass = (t.classes || []).some(c => c.toLowerCase().includes(query));
      const matchRace = (t.races || []).some(r => r.toLowerCase().includes(query));
      return matchName || matchType || matchClass || matchRace;
    });
    renderModalTraits(filtered);
  }
}

function renderModalSpells(list) {
  const container = document.getElementById("spellApiList");
  if (!container) return;

  if (!list || list.length === 0) {
    container.innerHTML = `<p class="loading-text" style="color: #64748b; font-style: italic;">No matching spells found.</p>`;
    return;
  }

  container.innerHTML = list.slice(0, 40).map((s) => {
    const levelStr = getSpellLevelTag(s);
    const isCantrip = levelStr.toLowerCase().includes("cantrip");
    const lvlClass = isCantrip ? "tag-cantrip" : "tag-level";

    let tagsHtml = `<span class="tag-pill ${lvlClass}">${escapeHtml(levelStr)}</span>`;

    if (s.schoolTag) {
      tagsHtml += `<span class="tag-pill ${getSchoolCssClass(s.schoolTag)}">${escapeHtml(s.schoolTag)}</span>`;
    }

    if (s.classesTag) {
      const cList = s.classesTag.split(",").map(c => c.trim()).filter(Boolean);
      cList.forEach((cls) => {
        const isRace = ["elf", "dwarf", "tiefling", "dragonborn", "halfling", "half-orc", "gnome", "half-elf", "human", "drow", "genasi", "aasimar", "triton"].some(r => cls.toLowerCase().includes(r));
        const pillClass = isRace ? getRaceCssClass(cls) : getClassCssClass(cls);
        tagsHtml += `<span class="tag-pill ${pillClass}">${escapeHtml(cls)}</span>`;
      });
    }

    return `
      <div class="spell-option-item spell-pick-row" data-url="${s.url || ''}" data-name="${escapeHtml(s.name)}">
        <div class="spell-option-details">
          <div class="spell-option-title">${escapeHtml(s.name)}</div>
          <div class="spell-meta-tags">${tagsHtml}</div>
        </div>
        <button type="button" class="spell-add-badge">+ Add</button>
      </div>
    `;
  }).join("");
}

function renderModalTraits(list) {
  const container = document.getElementById("traitApiList");
  if (!container) return;

  if (!list || list.length === 0) {
    container.innerHTML = `<p class="loading-text" style="color: #64748b; font-style: italic;">No matching abilities found.</p>`;
    return;
  }

  container.innerHTML = list.slice(0, 40).map((t) => {
    let tagsHtml = "";
    const classes = Array.isArray(t.classes) ? t.classes : (t.class ? [t.class] : []);
    const races = Array.isArray(t.races) ? t.races : (t.race ? [t.race] : []);

    classes.forEach((c) => {
      tagsHtml += `<span class="tag-pill ${getClassCssClass(c)}">${escapeHtml(c)}</span>`;
    });
    races.forEach((r) => {
      tagsHtml += `<span class="tag-pill ${getRaceCssClass(r)}">${escapeHtml(r)}</span>`;
    });

    if (!tagsHtml) {
      tagsHtml = `<span class="tag-pill race-generic">${escapeHtml(t.type || 'Feature')}</span>`;
    }

    return `
      <div class="spell-option-item trait-pick-row" data-url="${t.url || ''}" data-name="${escapeHtml(t.name)}" data-type="${escapeHtml(t.type || 'Feature')}">
        <div class="spell-option-details">
          <div class="spell-option-title">${escapeHtml(t.name)}</div>
          <div class="spell-meta-tags">${tagsHtml}</div>
        </div>
        <button type="button" class="spell-add-badge">+ Add</button>
      </div>
    `;
  }).join("");
}

function closeModal(modalId) {
  document.getElementById(modalId)?.classList.remove("open");
}

function closeAllModals() {
  document.querySelectorAll(".modal-backdrop.open").forEach((m) => m.classList.remove("open"));
}

function switchMainTab(targetId) {
  document.querySelectorAll(".main-tab").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-page").forEach((p) => p.classList.remove("active"));
  document.querySelector(`.main-tab[data-target="${targetId}"]`)?.classList.add("active");
  document.getElementById(targetId)?.classList.add("active");
}

function setAuthError(message) {
  const el = document.getElementById("authErrorMsg");
  if (el) el.textContent = message || "";
}

function updateAuthUI(user) {
  const authBtn = document.getElementById("authModalBtn");
  const loggedOutView = document.getElementById("authLoggedOutView");
  const loggedInView = document.getElementById("authLoggedInView");
  const userText = document.getElementById("currentUserText");

  if (user) {
    if (authBtn) authBtn.textContent = user.displayName || user.email.split("@")[0];
    if (loggedOutView) loggedOutView.style.display = "none";
    if (loggedInView) loggedInView.style.display = "block";
    if (userText) userText.textContent = user.email;
  } else {
    if (authBtn) authBtn.textContent = "Account";
    if (loggedOutView) loggedOutView.style.display = "block";
    if (loggedInView) loggedInView.style.display = "none";
    if (userText) userText.textContent = "";
  }
}

if (auth) {
  auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    updateAuthUI(user);

    if (user && db) {
      try {
        const doc = await db.collection("users").doc(user.uid).get();
        if (doc.exists && doc.data()?.roster) {
          const merged = { ...getRoster(), ...doc.data().roster };
          localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(merged));
          loadSheet();
          showStatus("Cloud Synced");
        } else {
          const localRoster = getRoster();
          if (Object.keys(localRoster).length > 0) syncRosterToCloud(localRoster);
        }
      } catch (err) {
        console.error("Cloud sync load error:", err);
      }
    }
  });
}

// Master Click Event Delegation
document.addEventListener("click", async (e) => {
  // Modal Close
  if (e.target.classList.contains("modal-close-btn") || e.target.closest(".modal-close-btn")) {
    e.target.closest(".modal-backdrop")?.classList.remove("open");
    return;
  }
  if (e.target.classList.contains("modal-backdrop")) {
    e.target.classList.remove("open");
    return;
  }

  // Blur Toggle
  if (e.target.closest(".blur-toggle-btn")) {
    const pill = e.target.closest(".blur-toggle-btn").closest(".field-pill");
    if (pill) {
      pill.classList.toggle("blurred");
      const blurId = pill.dataset.blurId;
      if (pill.classList.contains("blurred")) {
        if (!myBlurredPills.includes(blurId)) myBlurredPills.push(blurId);
      } else {
        myBlurredPills = myBlurredPills.filter((id) => id !== blurId);
      }
      saveSheet(true);
    }
    return;
  }

  // Close dropdowns if clicked outside
  if (!e.target.closest(".dropdown-pill-wrapper")) {
    document.querySelectorAll(".dropdown-menu").forEach((d) => d.classList.remove("open"));
  }

  // Dropdown item selection
  if (e.target.classList.contains("select-class-item")) {
    const classInput = document.getElementById("charClass");
    if (classInput) {
      classInput.value = e.target.dataset.name;
      saveSheet(false);
    }
    document.getElementById("classDropdown")?.classList.remove("open");
    return;
  }

  if (e.target.classList.contains("select-race-item")) {
    const raceInput = document.getElementById("charRace");
    if (raceInput) {
      raceInput.value = e.target.dataset.name;
      saveSheet(false);
    }
    document.getElementById("raceDropdown")?.classList.remove("open");
    return;
  }

  // Conditions
  if (e.target.classList.contains("cond-chip")) {
    const cond = e.target.dataset.cond;
    if (myActiveConditions.includes(cond)) {
      myActiveConditions = myActiveConditions.filter((c) => c !== cond);
      e.target.classList.remove("active");
    } else {
      myActiveConditions.push(cond);
      e.target.classList.add("active");
    }
    saveSheet(true);
    return;
  }

  // Top nav action buttons
  if (e.target.id === "saveBtn") {
    saveSheet(false);
    return;
  }

  if (e.target.id === "newBtn") {
    if (confirm("Create a new blank character sheet?")) resetSheet();
    return;
  }

  if (e.target.id === "loadBtn") {
    renderCharList();
    document.getElementById("loadModal")?.classList.add("open");
    return;
  }

  // Auth Modals
  if (e.target.id === "authModalBtn" || e.target.closest("#authModalBtn")) {
    setAuthError("");
    document.getElementById("authModal")?.classList.add("open");
    return;
  }

  if (e.target.id === "closeAuthModal" || e.target.closest("#closeAuthModal")) {
    document.getElementById("authModal")?.classList.remove("open");
    return;
  }

  if (e.target.id === "emailLoginBtn") {
    if (!auth) return setAuthError("Firebase is not initialized.");
    try {
      await auth.signInWithEmailAndPassword(
        document.getElementById("authEmail")?.value.trim(),
        document.getElementById("authPassword")?.value
      );
      showStatus("Logged In!");
      document.getElementById("authModal")?.classList.remove("open");
    } catch (err) {
      setAuthError(err.message);
    }
    return;
  }

  if (e.target.id === "emailSignUpBtn") {
    if (!auth) return setAuthError("Firebase is not initialized.");
    try {
      await auth.createUserWithEmailAndPassword(
        document.getElementById("authEmail")?.value.trim(),
        document.getElementById("authPassword")?.value
      );
      showStatus("Account Created!");
      document.getElementById("authModal")?.classList.remove("open");
    } catch (err) {
      setAuthError(err.message);
    }
    return;
  }

  if (e.target.id === "googleLoginBtn") {
    if (!auth) return setAuthError("Firebase is not initialized.");
    try {
      await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
      showStatus("Logged In!");
      document.getElementById("authModal")?.classList.remove("open");
    } catch (err) {
      setAuthError(err.message);
    }
    return;
  }

  if (e.target.id === "logoutBtn") {
    if (!auth) return;
    await auth.signOut();
    currentUser = null;
    localStorage.removeItem(ROSTER_STORAGE_KEY);
    localStorage.removeItem(ACTIVE_CHAR_ID_KEY);
    activeCharId = "default";
    resetSheet();
    showStatus("Signed Out");
    document.getElementById("authModal")?.classList.remove("open");
    return;
  }

  if (e.target.id === "deleteBtn") {
    const roster = getRoster();
    if (confirm(`Permanently delete "${roster[activeCharId]?.name || "this character"}"?`)) {
      delete roster[activeCharId];
      saveRoster(roster);
      const remaining = Object.keys(roster);
      if (remaining.length > 0) {
        activeCharId = remaining[0];
        localStorage.setItem(ACTIVE_CHAR_ID_KEY, activeCharId);
        loadSheet();
      } else {
        resetSheet();
      }
      renderCharList();
    }
    return;
  }

  if (e.target.id === "backupBtn") {
    const roster = getRoster();
    const currentChar = roster[activeCharId] || {
      id: activeCharId,
      name: "Character",
      fields: getCurrentSheetData(),
      spells: myCharacterSpells,
      traits: myCharacterTraits,
      weapons: myCharacterWeapons,
      conditions: myActiveConditions,
      blurredPills: myBlurredPills
    };
    const blob = new Blob([JSON.stringify({ character: currentChar, allRoster: roster }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(currentChar.name || "character").toLowerCase().replace(/\s+/g, "_")}-backup.json`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus("Backup Downloaded");
    return;
  }

  if (e.target.id === "helpLinkBtn") {
    document.getElementById("helpModal")?.classList.add("open");
    return;
  }

  // Tabs
  if (e.target.classList.contains("main-tab")) {
    switchMainTab(e.target.dataset.target);
    return;
  }

  if (e.target.classList.contains("sub-tab")) {
    document.querySelectorAll(".sub-tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".subtab-page").forEach((p) => p.classList.remove("active"));
    e.target.classList.add("active");
    document.getElementById(e.target.dataset.sub)?.classList.add("active");
    return;
  }

  if (e.target.classList.contains("footer-nav-btn")) {
    switchMainTab(e.target.dataset.tab);
    const map = {
      attr: ".attributes-group",
      skills: ".skills-group",
      traits: "#abilitiesSection",
      spells: "#spellsSection",
      journal: "#tab-journal"
    };
    document.querySelector(map[e.target.dataset.scroll])?.scrollIntoView({ behavior: "smooth" });
    return;
  }

  // Dice rolls
  if (e.target.classList.contains("dice-btn")) {
    const sides = parseInt(e.target.dataset.sides, 10);
    const roll = Math.floor(Math.random() * sides) + 1;
    const out = document.getElementById("rollResult");
    if (out) out.textContent = roll;
    addDiceHistory(`1d${sides}`, roll);
    return;
  }

  if (e.target.classList.contains("roll-btn")) {
    const roll = Math.floor(Math.random() * 20) + 1;
    let bonus = 0;
    let label = "Check";

    if (e.target.dataset.type === "save") {
      const attr = e.target.dataset.attr;
      bonus = parseInt(document.getElementById(`save_val_${attr}`)?.textContent, 10) || 0;
      label = `${attr.toUpperCase()} Save`;
    } else if (e.target.dataset.type === "skill") {
      const row = e.target.closest(".skill-row");
      bonus = parseInt(row?.querySelector(".skill-val")?.textContent, 10) || 0;
      label = row?.querySelector(".skill-label")?.textContent.replace(/\s+[A-Za-z]+$/, "").trim() || "Skill";
    }

    const total = roll + bonus;
    const out = document.getElementById("rollResult");
    if (out) out.textContent = total;
    addDiceHistory(`${label} (${roll} ${bonus >= 0 ? `+ ${bonus}` : `- ${Math.abs(bonus)}`})`, total);
    return;
  }

  // Add Weapon Button
  if (e.target.id === "addWeaponBtn" || e.target.closest("#addWeaponBtn") || e.target.closest(".btn-add-weapon")) {
    if (!Array.isArray(myCharacterWeapons)) myCharacterWeapons = [];
    myCharacterWeapons.push({ name: "", atk: "", dmg: "", notes: "" });
    saveSheet(false);
    renderWeapons();
    showStatus("Weapon Added!");
    return;
  }

  // Open Spell Modal
  if (e.target.id === "addSpellBtn" || e.target.closest("#addSpellBtn") || e.target.closest(".btn-add-spell")) {
    document.getElementById("spellModal")?.classList.add("open");
    const input = document.getElementById("spellSearchInput");
    if (input) input.value = "";
    const list = await loadAllSpells();
    renderModalSpells(list);
    enrichSpellList(list).then((changed) => {
      if (changed && (!input || input.value === "")) {
        renderModalSpells(allSpellsCache);
      }
    });
    return;
  }

  // Custom Spell
  if (e.target.id === "addCustomSpellBtn" || e.target.closest("#addCustomSpellBtn")) {
    myCharacterSpells.push({
      name: "New Spell",
      type: "Cantrip",
      casting_time: "1 Action",
      range: "30 ft",
      duration: "Instantaneous",
      desc: ""
    });
    saveSheet(false);
    renderMySpells();
    closeModal("spellModal");
    return;
  }

  // Open Trait Modal
  if (e.target.id === "addTraitBtn" || e.target.closest("#addTraitBtn") || e.target.closest(".btn-add-trait")) {
    document.getElementById("traitModal")?.classList.add("open");
    const input = document.getElementById("traitSearchInput");
    if (input) input.value = "";
    loadAllTraits().then((list) => {
      renderModalTraits(list);
    });
    return;
  }

  // Custom Trait
  if (e.target.id === "addCustomTraitBtn" || e.target.closest("#addCustomTraitBtn")) {
    myCharacterTraits.push({
      name: "New Ability",
      type: "Feature",
      desc: "",
      isExpanded: true
    });
    saveSheet(false);
    renderMyTraits();
    closeModal("traitModal");
    return;
  }

  // Pick Spell from compendium
  const spellRow = e.target.closest(".spell-pick-row");
  if (spellRow) {
    const name = spellRow.dataset.name;
    const url = spellRow.dataset.url;
    let detail = allSpellsCache.find((s) => s.name.toLowerCase() === name.toLowerCase());

    if (url && (!detail || !detail.desc)) {
      const fetched = await fetchAPI("https://www.dnd5eapi.co" + url);
      if (fetched) {
        detail = {
          name: fetched.name,
          type: fetched.level === 0 ? "Cantrip" : `Level ${fetched.level}`,
          casting_time: fetched.casting_time || "1 Action",
          range: fetched.range || "30 ft",
          duration: fetched.duration || "Instantaneous",
          desc: Array.isArray(fetched.desc) ? fetched.desc.join("\n\n") : (fetched.desc || "")
        };
      }
    }

    myCharacterSpells.push({
      name: detail?.name || name,
      type: detail?.type || getSpellLevelTag({ name }),
      casting_time: detail?.casting_time || "1 Action",
      range: detail?.range || "30 ft",
      duration: detail?.duration || "Instantaneous",
      desc: detail?.desc || ""
    });

    saveSheet(false);
    renderMySpells();
    closeModal("spellModal");
    return;
  }

  // Pick Trait from compendium
  const traitRow = e.target.closest(".trait-pick-row");
  if (traitRow) {
    const name = traitRow.dataset.name;
    const url = traitRow.dataset.url;
    let detail = allTraitsCache.find((t) => t.name.toLowerCase() === name.toLowerCase());

    if (url && (!detail || !detail.desc)) {
      const fetched = await fetchAPI("https://www.dnd5eapi.co" + url);
      if (fetched) {
        detail = {
          name: fetched.name,
          type: traitRow.dataset.type || "Feature",
          desc: Array.isArray(fetched.desc) ? fetched.desc.join("\n\n") : (fetched.desc || "")
        };
      }
    }

    myCharacterTraits.push({
      name: detail?.name || name,
      type: detail?.type || "Feature",
      desc: detail?.desc || "",
      isExpanded: false
    });

    saveSheet(false);
    renderMyTraits();
    closeModal("traitModal");
    return;
  }

  // Delete Weapon
  if (e.target.classList.contains("weapon-delete-btn")) {
    const idx = parseInt(e.target.dataset.index, 10);
    myCharacterWeapons.splice(idx, 1);
    while (myCharacterWeapons.length < 2) {
      myCharacterWeapons.push({ name: "", atk: "", dmg: "", notes: "" });
    }
    saveSheet(false);
    renderWeapons();
    return;
  }

  // Delete Trait
  if (e.target.classList.contains("trait-card-delete")) {
    myCharacterTraits.splice(parseInt(e.target.dataset.index, 10), 1);
    saveSheet(false);
    renderMyTraits();
    return;
  }

  // Expand / Collapse Trait
  if (e.target.classList.contains("trait-expand-btn") || e.target.closest(".trait-expand-btn")) {
    const btn = e.target.closest(".trait-expand-btn");
    const card = btn.closest(".trait-card");
    const idx = parseInt(card.dataset.index, 10);
    card.classList.toggle("expanded");
    const isExp = card.classList.contains("expanded");
    btn.innerHTML = `${isExp ? 'Collapse' : 'Expand'} <span class="trait-expand-icon">▼</span>`;
    if (myCharacterTraits[idx]) myCharacterTraits[idx].isExpanded = isExp;
    saveSheet(true);
    return;
  }

  // Delete Spell
  if (e.target.classList.contains("spell-card-delete")) {
    myCharacterSpells.splice(parseInt(e.target.dataset.index, 10), 1);
    saveSheet(false);
    renderMySpells();
    return;
  }

  // Delete Character from Saved Modal
  if (e.target.classList.contains("char-delete-btn")) {
    const row = e.target.closest(".char-item-row");
    const roster = getRoster();
    if (confirm(`Delete "${roster[row.dataset.id]?.name || "character"}"?`)) {
      delete roster[row.dataset.id];
      saveRoster(roster);
      if (activeCharId === row.dataset.id) {
        const remaining = Object.keys(roster);
        if (remaining.length > 0) {
          activeCharId = remaining[0];
          localStorage.setItem(ACTIVE_CHAR_ID_KEY, activeCharId);
          loadSheet();
        } else {
          resetSheet();
        }
      }
      renderCharList();
    }
    return;
  }

  // Load Character from Saved Modal
  if (e.target.closest(".char-item-name") || e.target.classList.contains("char-select-btn")) {
    const row = e.target.closest(".char-item-row");
    activeCharId = row.dataset.id;
    localStorage.setItem(ACTIVE_CHAR_ID_KEY, activeCharId);
    applyCharacterData(getRoster()[activeCharId]);
    closeModal("loadModal");
    showStatus("Character Loaded");
    return;
  }
});

// Dropdown input listeners
document.getElementById("charClass")?.addEventListener("focus", (e) => {
  renderClassDropdown(e.target.value);
  document.getElementById("classDropdown")?.classList.add("open");
});

document.getElementById("charClass")?.addEventListener("input", (e) => {
  renderClassDropdown(e.target.value);
  document.getElementById("classDropdown")?.classList.add("open");
});

document.getElementById("charRace")?.addEventListener("focus", (e) => {
  renderRaceDropdown(e.target.value);
  document.getElementById("raceDropdown")?.classList.add("open");
});

document.getElementById("charRace")?.addEventListener("input", (e) => {
  renderRaceDropdown(e.target.value);
  document.getElementById("raceDropdown")?.classList.add("open");
});

// Search inputs
let spellSearchTimeout = null;
document.getElementById("spellSearchInput")?.addEventListener("input", (e) => {
  const query = e.target.value.toLowerCase().trim();
  clearTimeout(spellSearchTimeout);
  spellSearchTimeout = setTimeout(() => {
    const filtered = allSpellsCache.filter((s) => {
      const matchName = (s.name || "").toLowerCase().includes(query);
      const matchClass = (s.classesTag || "").toLowerCase().includes(query);
      const matchSchool = (s.schoolTag || "").toLowerCase().includes(query);
      const matchLevel = (s.levelTag || "").toLowerCase().includes(query);
      return matchName || matchClass || matchSchool || matchLevel;
    });
    renderModalSpells(filtered);
    enrichSpellList(filtered).then((changed) => {
      if (changed && document.getElementById("spellSearchInput")?.value.toLowerCase().trim() === query) {
        renderModalSpells(filtered);
      }
    });
  }, 120);
});

let traitSearchTimeout = null;
document.getElementById("traitSearchInput")?.addEventListener("input", (e) => {
  const query = e.target.value.toLowerCase().trim();
  clearTimeout(traitSearchTimeout);
  traitSearchTimeout = setTimeout(() => {
    const filtered = allTraitsCache.filter((t) => {
      const matchName = (t.name || "").toLowerCase().includes(query);
      const matchType = (t.type || "").toLowerCase().includes(query);
      const matchClass = (t.classes || []).some(c => c.toLowerCase().includes(query));
      const matchRace = (t.races || []).some(r => r.toLowerCase().includes(query));
      return matchName || matchType || matchClass || matchRace;
    });
    renderModalTraits(filtered);
  }, 120);
});

// Filter spells in spellbook
document.getElementById("filterSpellbookInput")?.addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase().trim();
  document.querySelectorAll(".spell-card").forEach((card) => {
    const title = card.querySelector(".spell-custom-title-input")?.value.toLowerCase() || "";
    card.style.display = (!q || title.includes(q)) ? "flex" : "none";
  });
});

// Dynamic form inputs
document.addEventListener("change", (e) => {
  if (e.target.type === "checkbox" && e.target.classList.contains("save-field")) {
    recalculateAll();
    saveSheet(false);
  }
});

document.addEventListener("input", (e) => {
  if (e.target.classList.contains("save-field") && e.target.type !== "checkbox") {
    recalculateAll();
    saveSheet(true);
  }

  if (e.target.classList.contains("custom-spell-field")) {
    const card = e.target.closest(".spell-card");
    if (card) {
      const idx = parseInt(card.dataset.index, 10);
      if (myCharacterSpells[idx]) {
        myCharacterSpells[idx][e.target.dataset.prop] = e.target.value;
        saveSheet(true);
      }
    }
  }

  if (e.target.classList.contains("custom-trait-field")) {
    const card = e.target.closest(".trait-card");
    if (card) {
      const idx = parseInt(card.dataset.index, 10);
      if (myCharacterTraits[idx]) {
        myCharacterTraits[idx][e.target.dataset.prop] = e.target.value;
        saveSheet(true);
      }
    }
  }

  if (e.target.classList.contains("wpn-field")) {
    const entry = e.target.closest(".attack-entry");
    if (entry) {
      const idx = parseInt(entry.dataset.index, 10);
      if (myCharacterWeapons[idx]) {
        myCharacterWeapons[idx][e.target.dataset.prop] = e.target.value;
        saveSheet(true);
      }
    }
  }
});

document.addEventListener("focusout", (e) => {
  if (
    e.target.classList.contains("save-field") ||
    e.target.classList.contains("custom-spell-field") ||
    e.target.classList.contains("custom-trait-field") ||
    e.target.classList.contains("wpn-field")
  ) {
    if (e.target.type !== "checkbox") saveSheet(false);
  }
});

// Escape key closes modals
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeAllModals();
});

// File Restore handler
document.getElementById("restoreFile")?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const parsed = JSON.parse(evt.target.result);
      const roster = getRoster();
      if (parsed.allRoster) {
        Object.assign(roster, parsed.allRoster);
        const keys = Object.keys(parsed.allRoster);
        if (keys.length > 0) {
          activeCharId = keys[0];
          localStorage.setItem(ACTIVE_CHAR_ID_KEY, activeCharId);
        }
      } else if (parsed.character) {
        const charId = parsed.character.id || "char_" + Date.now();
        roster[charId] = parsed.character;
        activeCharId = charId;
        localStorage.setItem(ACTIVE_CHAR_ID_KEY, activeCharId);
      }
      saveRoster(roster);
      loadSheet();
      showStatus("Sheet Restored!");
    } catch (err) {
      alert("Invalid backup file.");
    }
  };
  reader.readAsText(file);
});

// Initialization
loadSheet();
loadAllSpells();
loadAllTraits();
