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
const THEME_STORAGE_KEY = "badman_active_theme";
const CAMPAIGN_ROOM_KEY = "badman_active_campaign_room";

let activeCharId = localStorage.getItem(ACTIVE_CHAR_ID_KEY) || "default";
let connectedCampaignRoom = localStorage.getItem(CAMPAIGN_ROOM_KEY) || "";

let myCharacterAvatar = "";
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

// DM & Player Real-Time Listener State
let dmListenerUnsubscribe = null;
let playerPartyListUnsubscribe = null;
let activeDMRoomCode = "";
let currentInspectedMemberId = null;
let cachedRoomMembers = [];

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
  { name: "Action Surge", classes: ["Fighter"], type: "Class Feature", desc: "Take one additional action on your turn once per short or long rest." },
  { name: "Second Wind", classes: ["Fighter"], type: "Class Feature", desc: "Regain 1d10 + fighter level hit points as a bonus action once per short or long rest." },
  { name: "Sneak Attack", classes: ["Rogue"], type: "Class Feature", desc: "Deal extra damage once per turn with advantage or adjacent ally." },
  { name: "Cunning Action", classes: ["Rogue"], type: "Class Feature", desc: "Take a bonus action on each turn to Dash, Disengage, or Hide." },
  { name: "Rage", classes: ["Barbarian"], type: "Class Feature", desc: "Enter a rage for advantage on Strength checks, weapon damage bonus, and physical resistance." },
  { name: "Reckless Attack", classes: ["Barbarian"], type: "Class Feature", desc: "Gain advantage on melee weapon attack rolls using Strength during your turn." },
  { name: "Divine Smite", classes: ["Paladin"], type: "Class Feature", desc: "Expending a spell slot deals radiant damage to a struck creature." },
  { name: "Lay on Hands", classes: ["Paladin"], type: "Class Feature", desc: "Pool of healing power replenishing on long rest (5 × paladin level)." },
  { name: "Wild Shape", classes: ["Druid"], type: "Class Feature", desc: "Magically assume the shape of a beast you have seen before." },
  { name: "Bardic Inspiration", classes: ["Bard"], type: "Class Feature", desc: "Add an inspiration die to an ability check, attack roll, or saving throw." },
  { name: "Ki / Flurry of Blows", classes: ["Monk"], type: "Class Feature", desc: "Harness martial energy to make extra unarmed strikes or dodge." },
  { name: "Font of Magic", classes: ["Sorcerer"], type: "Class Feature", desc: "Metamagic and sorcery points to alter or create spell slots." },
  { name: "Eldritch Invocations", classes: ["Warlock"], type: "Class Feature", desc: "Occult lore fragments that bestow permanent magical abilities." },
  { name: "Darkvision", races: ["Elf", "Dwarf", "Tiefling", "Gnome", "Half-Orc"], type: "Racial Trait", desc: "See in dim light within 60 feet as if it were bright light, and in darkness as if dim light." },
  { name: "Fey Ancestry", races: ["Elf", "Half-Elf"], type: "Racial Trait", desc: "Advantage on saving throws against being charmed, and magic cannot put you to sleep." },
  { name: "Dwarven Resilience", races: ["Dwarf"], type: "Racial Trait", desc: "Advantage on saving throws against poison, and resistance against poison damage." }
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

// Themes
function applyTheme(themeName) {
  const themes = [
    "theme-obsidian", "theme-parchment", "theme-eldritch", "theme-celestial", "theme-emerald",
    "theme-aethertech", "theme-bloodmoon", "theme-glacial", "theme-underdark", "theme-solaris", "theme-cartographer"
  ];
  themes.forEach((t) => document.body.classList.remove(t));
  const validTheme = themes.includes(themeName) ? themeName : "theme-obsidian";
  document.body.classList.add(validTheme);
  localStorage.setItem(THEME_STORAGE_KEY, validTheme);
  const sel = document.getElementById("themeSelect");
  if (sel) sel.value = validTheme;
}

function updateXpBar() {
  const xpInput = document.getElementById("charExp");
  const fill = document.getElementById("xpBarFill");
  if (!xpInput || !fill) return;

  const raw = parseInt(xpInput.value.replace(/\D/g, ""), 10) || 0;
  const level = parseInt(document.getElementById("charLevel")?.value, 10) || 1;
  const xpThresholds = [
    0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
    85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000
  ];
  const curTier = xpThresholds[level - 1] || 0;
  const nextTier = xpThresholds[level] || curTier + 10000;
  const span = Math.max(1, nextTier - curTier);
  const progress = Math.min(100, Math.max(0, ((raw - curTier) / span) * 100));
  fill.style.width = `${progress}%`;
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

  let percBonus = mods["wis"] || 0;
  let insBonus = mods["wis"] || 0;

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

    if (row.id === "row_perc") percBonus = total;
    if (row.id === "row_ins") insBonus = total;
  });

  const passPercEl = document.getElementById("passivePerception");
  if (passPercEl) passPercEl.textContent = 10 + percBonus;

  const passInsEl = document.getElementById("passiveInsight");
  if (passInsEl) passInsEl.textContent = 10 + insBonus;

  updateXpBar();
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
    container.innerHTML = `<p style="grid-column: 1 / -1; font-size: 0.88rem; color: #64748b; font-style: italic; padding: 2rem 0; text-align: center;">No abilities added yet. Click "+ Add Ability" above to browse the compendium.</p>`;
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
            <span class="trait-expand-icon">&blacktriangledown;</span>
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
    container.innerHTML = `<p style="grid-column: 1 / -1; font-size: 0.88rem; color: #64748b; text-align: center; font-style: italic; padding: 1.5rem 0;">No spells added yet. Click "+ Add Spell" above to browse the compendium.</p>`;
    return;
  }

  container.innerHTML = myCharacterSpells.map((spell, idx) => {
    if (!spell) return "";
    const typeVal = spell.type || spell.levelTag || "Cantrip";
    const descVal = Array.isArray(spell.desc) ? spell.desc.join("\n\n") : (spell.desc || "");
    return `
      <div class="spell-card" draggable="true" data-index="${idx}">
        <div class="spell-card-header">
          <span class="spell-drag-handle" title="Drag to reorder">&vellip;&vellip;</span>
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

function renderSpellSlotGrid() {
  const container = document.getElementById("slotsGridContainer");
  if (!container) return;

  const suffixes = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
  let html = "";

  for (let lvl = 1; lvl <= 9; lvl++) {
    const curVal = parseInt(document.getElementById(`slot${lvl}_cur`)?.value, 10) || 0;
    const maxVal = parseInt(document.getElementById(`slot${lvl}_max`)?.value, 10) || 0;

    let pipsHtml = "";
    for (let i = 0; i < maxVal; i++) {
      const isAvailable = i < curVal;
      pipsHtml += `<span class="slot-pip ${isAvailable ? 'active' : ''}" data-slot-lvl="${lvl}" data-pip-idx="${i}" title="${isAvailable ? 'Click to Cast' : 'Click to Recover'}"></span>`;
    }

    html += `
      <div class="slot-tile" data-slot-lvl="${lvl}">
        <span class="slot-level">${suffixes[lvl - 1]}</span>
        <div class="slot-pips-container">
          ${pipsHtml || '<span style="font-size:0.65rem; color:#475569;">No Slots</span>'}
        </div>
        <div class="slot-counter">
          <input type="number" id="slot${lvl}_cur" class="save-field slot-input center" value="${curVal}" min="0" />
          <span class="slot-divider">/</span>
          <input type="number" id="slot${lvl}_max" class="save-field slot-input center" value="${maxVal}" min="0" />
        </div>
      </div>
    `;
  }
  container.innerHTML = html;
}

function updateSlotPips(lvl) {
  const tile = document.querySelector(`.slot-tile[data-slot-lvl="${lvl}"]`);
  if (!tile) return;
  const cur = parseInt(document.getElementById(`slot${lvl}_cur`)?.value, 10) || 0;
  const max = parseInt(document.getElementById(`slot${lvl}_max`)?.value, 10) || 0;
  const pipsBox = tile.querySelector(".slot-pips-container");
  if (!pipsBox) return;

  let pipsHtml = "";
  for (let i = 0; i < max; i++) {
    const isAvailable = i < cur;
    pipsHtml += `<span class="slot-pip ${isAvailable ? 'active' : ''}" data-slot-lvl="${lvl}" data-pip-idx="${i}" title="${isAvailable ? 'Click to Cast' : 'Click to Recover'}"></span>`;
  }
  pipsBox.innerHTML = pipsHtml || '<span style="font-size:0.65rem; color:#475569;">No Slots</span>';
}

function renderAvatar() {
  const imgEl = document.getElementById("charAvatarImg");
  const placeholderEl = document.getElementById("avatarPlaceholder");
  if (!imgEl || !placeholderEl) return;

  if (myCharacterAvatar) {
    imgEl.src = myCharacterAvatar;
    imgEl.style.display = "block";
    placeholderEl.style.display = "none";
  } else {
    imgEl.src = "";
    imgEl.style.display = "none";
    placeholderEl.style.display = "flex";
  }
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
  document.querySelectorAll("[data-blur-id]").forEach((el) => {
    const blurId = el.dataset.blurId;
    if (myBlurredPills.includes(blurId)) el.classList.add("blurred");
    else el.classList.remove("blurred");
  });
}

function getRoster() {
  try {
    return JSON.parse(localStorage.getItem(ROSTER_STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function extractFullCharacterPayload(charData) {
  const f = charData.fields || {};

  const stats = ["str", "dex", "con", "int", "wis", "cha"];
  const attributes = {};
  stats.forEach((s) => {
    const score = parseInt(f[`attr_${s}`], 10) || 10;
    const mod = getModifier(score);
    const save = f[`save_${s}`] ? mod + getProfBonus(parseInt(f.charLevel, 10) || 1) : mod;
    attributes[s] = { score, mod, save, isSaveProf: !!f[`save_${s}`] };
  });

  const spellSlots = {};
  for (let lvl = 1; lvl <= 9; lvl++) {
    spellSlots[lvl] = {
      cur: parseInt(f[`slot${lvl}_cur`], 10) || 0,
      max: parseInt(f[`slot${lvl}_max`], 10) || 0
    };
  }

  const curHp = parseInt(f.curHp, 10) || 0;
  const maxHp = parseInt(f.maxHp, 10) || 10;
  const tempHp = parseInt(f.tempHp, 10) || 0;

  return {
    id: activeCharId,
    name: charData.name || "Unnamed Adventurer",
    charClass: f.charClass || "",
    charRace: f.charRace || "",
    charBackground: f.charBackground || "",
    charAlignment: f.charAlignment || "",
    level: parseInt(f.charLevel, 10) || 1,
    avatar: myCharacterAvatar || "",
    hp: { cur: curHp, max: maxHp, temp: tempHp },
    ac: parseInt(f.ac, 10) || 10,
    speed: parseInt(f.charSpeed, 10) || 30,
    deathSaves: {
      succ: parseInt(f.deathSucc, 10) || 0,
      fail: parseInt(f.deathFail, 10) || 0
    },
    classPoints: {
      cur: parseInt(f.classPtsCur, 10) || 0,
      max: parseInt(f.classPtsMax, 10) || 0
    },
    hitDice: {
      cur: f.hitDiceCur || "1",
      max: f.hitDiceMax || "1"
    },
    attributes,
    spellSlots,
    spells: myCharacterSpells || [],
    traits: myCharacterTraits || [],
    weapons: myCharacterWeapons || [],
    conditions: myActiveConditions || [],
    otherProfs: f.otherProfs || "",
    passivePerception: parseInt(document.getElementById("passivePerception")?.textContent, 10) || 10,
    passiveInsight: parseInt(document.getElementById("passiveInsight")?.textContent, 10) || 10,
    inspiration: f.charInspiration || "",
    updatedAt: Date.now()
  };
}

async function ensureAuthenticated() {
  if (!auth) return;
  if (!auth.currentUser) {
    try {
      await auth.signInAnonymously();
    } catch (e) {
      console.warn("Auto-authentication note:", e);
    }
  }
}

async function syncToLiveCampaign(charData) {
  if (!db || !connectedCampaignRoom || !charData) return;
  try {
    await ensureAuthenticated();
    const payload = extractFullCharacterPayload(charData);
    await db.collection("campaigns").doc(connectedCampaignRoom).collection("members").doc(activeCharId).set(payload, { merge: true });
  } catch (err) {
    console.error("Live party sync failed:", err);
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

  const charRecord = {
    id: activeCharId,
    name: name,
    summary: charClass ? `${charClass} (Lvl ${level})` : `Level ${level}`,
    updatedAt: Date.now(),
    avatar: myCharacterAvatar,
    fields: fields,
    spells: myCharacterSpells,
    traits: myCharacterTraits,
    weapons: myCharacterWeapons,
    conditions: myActiveConditions,
    blurredPills: myBlurredPills
  };

  roster[activeCharId] = charRecord;
  saveRoster(roster);
  localStorage.setItem(ACTIVE_CHAR_ID_KEY, activeCharId);
  syncToLiveCampaign(charRecord);
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

  myCharacterAvatar = charData.avatar || "";
  myCharacterSpells = charData.spells || [];
  myCharacterTraits = charData.traits || [];
  myActiveConditions = charData.conditions || [];
  myBlurredPills = charData.blurredPills || [];
  myCharacterWeapons = charData.weapons && charData.weapons.length >= 2 ? charData.weapons : [
    { name: "", atk: "", dmg: "", notes: "" },
    { name: "", atk: "", dmg: "", notes: "" }
  ];

  renderAvatar();
  renderWeapons();
  renderMySpells();
  renderMyTraits();
  renderConditionChips();
  renderBlurredPills();
  recalculateAll();
  renderSpellSlotGrid();
  syncToLiveCampaign(charData);
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
      renderAvatar();
      renderWeapons();
      renderMySpells();
      renderMyTraits();
      renderConditionChips();
      renderBlurredPills();
      renderSpellSlotGrid();
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
      field.classList.contains("exhaustion-input") ||
      field.id === "tempHp"
    ) field.value = 0;
    else field.value = "";
  });

  myCharacterAvatar = "";
  myCharacterSpells = [];
  myCharacterTraits = [];
  myActiveConditions = [];
  myBlurredPills = [];
  myCharacterWeapons = [
    { name: "", atk: "", dmg: "", notes: "" },
    { name: "", atk: "", dmg: "", notes: "" }
  ];
  diceRollHistory = [];

  renderAvatar();
  renderDiceHistory();
  recalculateAll();
  renderWeapons();
  renderMySpells();
  renderMyTraits();
  renderConditionChips();
  renderBlurredPills();
  renderSpellSlotGrid();
  saveSheet(false);
  showStatus("New Sheet Created!");
}

function switchMainTab(targetId) {
  if (!targetId) return;
  document.querySelectorAll(".main-tab").forEach((b) => {
    if (b.dataset.target === targetId) b.classList.add("active");
    else b.classList.remove("active");
  });
  document.querySelectorAll(".tab-page").forEach((p) => {
    if (p.id === targetId) p.classList.add("active");
    else p.classList.remove("active");
  });
}

function closeModal(modalId) {
  document.getElementById(modalId)?.classList.remove("open");
}

function closeAllModals() {
  document.querySelectorAll(".modal-backdrop.open").forEach((m) => m.classList.remove("open"));
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

function setAuthError(message) {
  const el = document.getElementById("authErrorMsg");
  if (el) el.textContent = message || "";
}

function updateAuthUI(user) {
  const authBtn = document.getElementById("authModalBtn");
  const loggedOutView = document.getElementById("authLoggedOutView");
  const loggedInView = document.getElementById("authLoggedInView");
  const userText = document.getElementById("currentUserText");

  if (user && !user.isAnonymous) {
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

    if (user && !user.isAnonymous && db) {
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

/* ==========================================================================
   API FETCH CACHE & COMPENDIUM LOADERS
   ========================================================================== */

async function fetchAPI(url) {
  if (apiCache[url]) return apiCache[url];
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    apiCache[url] = data;
    return data;
  } catch (err) {
    console.warn("API fetch failed:", url, err);
    return null;
  }
}

async function loadAllSpells() {
  allSpellsCache = [...BUILTIN_SPELLS];
  try {
    const data = await fetchAPI("https://www.dnd5eapi.co/api/spells");
    if (data && Array.isArray(data.results)) {
      const existing = new Set(allSpellsCache.map(s => s.name.toLowerCase()));
      data.results.forEach((s) => {
        if (!existing.has(s.name.toLowerCase())) {
          const lvl = SRD_SPELL_LEVELS[s.index] !== undefined ? SRD_SPELL_LEVELS[s.index] : 1;
          allSpellsCache.push({
            name: s.name,
            levelTag: lvl === 0 ? "Cantrip" : `Level ${lvl}`,
            type: lvl === 0 ? "Cantrip" : `Level ${lvl}`,
            url: s.url,
            index: s.index
          });
        }
      });
    }
  } catch (err) {
    console.warn("Spells API offline; using built-ins only.", err);
  }
}

function filterAndRenderSpells(query = "") {
  const container = document.getElementById("spellApiList");
  if (!container) return;

  const q = query.toLowerCase().trim();
  const filtered = allSpellsCache.filter((s) => {
    return !q ||
      s.name.toLowerCase().includes(q) ||
      (s.levelTag && s.levelTag.toLowerCase().includes(q)) ||
      (s.schoolTag && s.schoolTag.toLowerCase().includes(q)) ||
      (s.classesTag && s.classesTag.toLowerCase().includes(q));
  });

  if (filtered.length === 0) {
    container.innerHTML = `<p class="loading-text">No spells found matching "${escapeHtml(query)}".</p>`;
    return;
  }

  container.innerHTML = filtered.slice(0, 100).map((spell) => {
    const isCantrip = (spell.levelTag || "").toLowerCase().includes("cantrip");
    return `
      <div class="spell-option-item spell-pick-row" data-name="${escapeHtml(spell.name)}" data-url="${escapeHtml(spell.url || "")}">
        <div class="spell-option-details">
          <span class="spell-option-title">${escapeHtml(spell.name)}</span>
          <div class="spell-meta-tags">
            <span class="tag-pill ${isCantrip ? 'tag-cantrip' : 'tag-level'}">${escapeHtml(spell.levelTag || 'Spell')}</span>
            ${spell.schoolTag ? `<span class="tag-pill ${getSchoolCssClass(spell.schoolTag)}">${escapeHtml(spell.schoolTag)}</span>` : ''}
            ${spell.classesTag ? `<span class="tag-pill ${getClassCssClass(spell.classesTag)}">${escapeHtml(spell.classesTag)}</span>` : ''}
          </div>
        </div>
        <button type="button" class="spell-add-badge">+ Add</button>
      </div>
    `;
  }).join("");
}

async function loadAllTraits() {
  allTraitsCache = [...BUILTIN_TRAITS];
  try {
    const data = await fetchAPI("https://www.dnd5eapi.co/api/features");
    if (data && Array.isArray(data.results)) {
      const existing = new Set(allTraitsCache.map(t => t.name.toLowerCase()));
      data.results.forEach((f) => {
        if (!existing.has(f.name.toLowerCase())) {
          allTraitsCache.push({
            name: f.name,
            type: "Class Feature",
            url: f.url,
            index: f.index
          });
        }
      });
    }
  } catch (err) {
    console.warn("Features API offline; using built-ins only.", err);
  }
}

function filterAndRenderTraits(query = "") {
  const container = document.getElementById("traitApiList");
  if (!container) return;

  const q = query.toLowerCase().trim();
  const filtered = allTraitsCache.filter((t) => {
    return !q ||
      t.name.toLowerCase().includes(q) ||
      (t.type && t.type.toLowerCase().includes(q)) ||
      (t.classes && t.classes.some(c => c.toLowerCase().includes(q))) ||
      (t.races && t.races.some(r => r.toLowerCase().includes(q)));
  });

  if (filtered.length === 0) {
    container.innerHTML = `<p class="loading-text">No features or traits found matching "${escapeHtml(query)}".</p>`;
    return;
  }

  container.innerHTML = filtered.slice(0, 100).map((trait) => {
    const classTag = trait.classes ? trait.classes.join(", ") : (trait.races ? trait.races.join(", ") : "");
    return `
      <div class="spell-option-item trait-pick-row" data-name="${escapeHtml(trait.name)}" data-url="${escapeHtml(trait.url || "")}" data-type="${escapeHtml(trait.type || 'Feature')}">
        <div class="spell-option-details">
          <span class="spell-option-title">${escapeHtml(trait.name)}</span>
          <div class="spell-meta-tags">
            <span class="tag-pill tag-cantrip">${escapeHtml(trait.type || 'Feature')}</span>
            ${classTag ? `<span class="tag-pill ${getClassCssClass(classTag)}">${escapeHtml(classTag)}</span>` : ''}
          </div>
        </div>
        <button type="button" class="spell-add-badge">+ Add</button>
      </div>
    `;
  }).join("");
}

/* ==========================================================================
   PARTY REALM & DM DASHBOARD (REAL-TIME SYNC)
   ========================================================================== */

function updatePartyStatusUI() {
  const statusBox = document.getElementById("partyStatusBox");
  const statusText = document.getElementById("partyStatusText");
  const roomInput = document.getElementById("campaignRoomInput");
  const joinBtn = document.getElementById("joinCampaignBtn");
  const leaveBtn = document.getElementById("leaveCampaignBtn");
  const playerSection = document.getElementById("playerPartySection");

  const dot = statusBox?.querySelector(".status-dot");

  if (connectedCampaignRoom) {
    if (dot) { dot.classList.remove("disconnected"); dot.classList.add("connected"); }
    if (statusText) statusText.textContent = `Connected to room: ${connectedCampaignRoom}`;
    if (roomInput) roomInput.value = connectedCampaignRoom;
    if (joinBtn) joinBtn.style.display = "none";
    if (leaveBtn) leaveBtn.style.display = "inline-flex";
    if (playerSection) playerSection.style.display = "block";
    startPlayerPartyListener();
  } else {
    if (dot) { dot.classList.remove("connected"); dot.classList.add("disconnected"); }
    if (statusText) statusText.textContent = "Not connected to any campaign room.";
    if (joinBtn) joinBtn.style.display = "inline-flex";
    if (leaveBtn) leaveBtn.style.display = "none";
    if (playerSection) playerSection.style.display = "none";
    if (playerPartyListUnsubscribe) {
      playerPartyListUnsubscribe();
      playerPartyListUnsubscribe = null;
    }
  }

  const dmCodeText = document.getElementById("dmActiveRoomCode");
  const copyBtn = document.getElementById("copyRoomCodeBtn");
  const closeBtn = document.getElementById("closeCampaignBtn");

  if (activeDMRoomCode) {
    if (dmCodeText) dmCodeText.textContent = activeDMRoomCode;
    if (copyBtn) copyBtn.style.display = "inline-flex";
    if (closeBtn) closeBtn.style.display = "inline-flex";
  } else {
    if (dmCodeText) dmCodeText.textContent = "NONE";
    if (copyBtn) copyBtn.style.display = "none";
    if (closeBtn) closeBtn.style.display = "none";
  }
}

async function joinCampaignRoom(roomCode) {
  if (!db) {
    alert("Firebase database connection is unavailable.");
    return;
  }
  const cleanCode = roomCode.trim().toUpperCase();
  if (!cleanCode) return;

  await ensureAuthenticated();
  connectedCampaignRoom = cleanCode;
  localStorage.setItem(CAMPAIGN_ROOM_KEY, connectedCampaignRoom);
  updatePartyStatusUI();

  const roster = getRoster();
  if (roster[activeCharId]) {
    await syncToLiveCampaign(roster[activeCharId]);
  }
  showStatus(`Joined Room ${cleanCode}!`);
}

async function leaveCampaignRoom() {
  if (db && connectedCampaignRoom && activeCharId) {
    try {
      await db.collection("campaigns").doc(connectedCampaignRoom).collection("members").doc(activeCharId).delete();
    } catch (e) {
      console.warn("Could not remove character doc:", e);
    }
  }
  if (playerPartyListUnsubscribe) {
    playerPartyListUnsubscribe();
    playerPartyListUnsubscribe = null;
  }
  connectedCampaignRoom = "";
  localStorage.removeItem(CAMPAIGN_ROOM_KEY);
  updatePartyStatusUI();
  showStatus("Left Campaign Room");
}

function startPlayerPartyListener() {
  if (!db || !connectedCampaignRoom) return;
  if (playerPartyListUnsubscribe) playerPartyListUnsubscribe();

  const grid = document.getElementById("playerPartyGrid");
  const countEl = document.getElementById("playerMemberCount");

  playerPartyListUnsubscribe = db.collection("campaigns").doc(connectedCampaignRoom).collection("members")
    .onSnapshot((snapshot) => {
      const members = [];
      snapshot.forEach(doc => members.push(doc.data()));
      if (countEl) countEl.textContent = `${members.length} Active`;

      if (!grid) return;
      if (members.length === 0) {
        grid.innerHTML = `<p class="dm-empty-msg">No adventurers in this party yet.</p>`;
        return;
      }

      grid.innerHTML = members.map((m) => {
        const hp = m.hp || { cur: 10, max: 10, temp: 0 };
        const pct = Math.min(100, Math.max(0, Math.round((hp.cur / (hp.max || 1)) * 100)));
        const conds = (m.conditions || []).join(", ") || "Normal";
        const isDead = hp.cur <= 0;

        return `
          <div class="player-party-card ${isDead ? 'unconscious' : ''}">
            <div class="dm-card-header">
              ${m.avatar ? `<img src="${m.avatar}" class="dm-player-avatar" alt="Avatar" />` : `<div class="dm-avatar-placeholder">&dagger;</div>`}
              <div class="dm-player-info">
                <span class="dm-player-name">${escapeHtml(m.name || 'Unnamed')}</span>
                <span class="dm-player-sub">${escapeHtml(m.charClass || '')} (Lvl ${m.level || 1})</span>
              </div>
            </div>
            <div class="dm-health-gauge">
              <div class="dm-health-labels">
                <span class="dm-hp-val">HP: ${hp.cur}/${hp.max} ${hp.temp > 0 ? `(+${hp.temp})` : ''}</span>
                <span>${pct}%</span>
              </div>
              <div class="dm-health-track">
                <div class="dm-health-fill" style="width: ${pct}%;"></div>
              </div>
            </div>
            <div style="font-size: 0.72rem; color: #94a3b8;"><strong>Conditions:</strong> ${escapeHtml(conds)}</div>
          </div>
        `;
      }).join("");
    }, (err) => {
      console.warn("Party listener error:", err);
    });
}

function createNewCampaignRoom() {
  const code = "REALM-" + Math.floor(1000 + Math.random() * 9000);
  startDMLiveListener(code);
}

function startDMLiveListener(roomCode) {
  if (!db) {
    alert("Firebase database connection is unavailable.");
    return;
  }
  if (dmListenerUnsubscribe) dmListenerUnsubscribe();

  activeDMRoomCode = roomCode.toUpperCase();
  updatePartyStatusUI();

  const grid = document.getElementById("dmPartyGrid");
  const countEl = document.getElementById("dmMemberCount");

  dmListenerUnsubscribe = db.collection("campaigns").doc(activeDMRoomCode).collection("members")
    .onSnapshot((snapshot) => {
      cachedRoomMembers = [];
      snapshot.forEach(doc => cachedRoomMembers.push(doc.data()));
      if (countEl) countEl.textContent = `${cachedRoomMembers.length} Active`;

      if (!grid) return;
      if (cachedRoomMembers.length === 0) {
        grid.innerHTML = `<p class="dm-empty-msg">Waiting for adventurers to join room ${activeDMRoomCode}...</p>`;
        return;
      }

      grid.innerHTML = cachedRoomMembers.map((m) => {
        const hp = m.hp || { cur: 10, max: 10, temp: 0 };
        const pct = Math.min(100, Math.max(0, Math.round((hp.cur / (hp.max || 1)) * 100)));
        const isDead = hp.cur <= 0;

        return `
          <div class="dm-player-card ${isDead ? 'unconscious' : ''}" data-member-id="${escapeHtml(m.id)}">
            <div class="dm-card-header">
              ${m.avatar ? `<img src="${m.avatar}" class="dm-player-avatar" alt="Avatar" />` : `<div class="dm-avatar-placeholder">&dagger;</div>`}
              <div class="dm-player-info">
                <span class="dm-player-name">${escapeHtml(m.name || 'Unnamed')}</span>
                <span class="dm-player-sub">${escapeHtml(m.charRace || '')} ${escapeHtml(m.charClass || '')} (Lvl ${m.level || 1})</span>
              </div>
            </div>
            <div class="dm-health-gauge">
              <div class="dm-health-labels">
                <span class="dm-hp-val">HP: ${hp.cur} / ${hp.max}</span>
                ${hp.temp > 0 ? `<span class="dm-temp-val">+${hp.temp} Temp</span>` : ''}
              </div>
              <div class="dm-health-track">
                <div class="dm-health-fill" style="width: ${pct}%;"></div>
              </div>
            </div>
            <div class="dm-stats-strip">
              <span class="dm-stat-item">AC: <strong>${m.ac || 10}</strong></span>
              <span class="dm-stat-item">PP: <strong>${m.passivePerception || 10}</strong></span>
              <span class="dm-stat-item">Speed: <strong>${m.speed || 30}ft</strong></span>
            </div>
            <div class="dm-conditions-list">
              ${(m.conditions || []).map(c => `<span class="dm-cond-badge">${escapeHtml(c)}</span>`).join("")}
            </div>
          </div>
        `;
      }).join("");
    }, (err) => {
      console.warn("DM listener error:", err);
    });

  showStatus(`DM Monitoring Room ${activeDMRoomCode}`);
}

async function closeDMCampaignRoom() {
  if (dmListenerUnsubscribe) {
    dmListenerUnsubscribe();
    dmListenerUnsubscribe = null;
  }
  activeDMRoomCode = "";
  cachedRoomMembers = [];
  updatePartyStatusUI();
  const grid = document.getElementById("dmPartyGrid");
  if (grid) grid.innerHTML = `<p class="dm-empty-msg">No party active. Create or enter a room code to inspect your players live.</p>`;
  showStatus("DM Session Closed");
}

function openInspectModal(memberId) {
  const member = cachedRoomMembers.find(m => m.id === memberId);
  if (!member) return;
  currentInspectedMemberId = memberId;

  const content = document.getElementById("dmInspectContent");
  const title = document.getElementById("inspectCharTitle");
  if (title) title.textContent = `Inspection: ${member.name || "Adventurer"}`;

  const attrs = member.attributes || {};
  const hp = member.hp || { cur: 10, max: 10, temp: 0 };

  if (content) {
    content.innerHTML = `
      <div class="inspect-char-banner">
        ${member.avatar ? `<div class="inspect-avatar-wrap"><img src="${member.avatar}" class="inspect-avatar-img" alt="Avatar" /></div>` : ''}
        <div class="inspect-char-info">
          <span class="inspect-char-name">${escapeHtml(member.name || "Unnamed")}</span>
          <span class="inspect-char-meta-line">${escapeHtml(member.charRace || '')} ${escapeHtml(member.charClass || '')} &bull; Level ${member.level || 1} &bull; ${escapeHtml(member.charAlignment || '')}</span>
        </div>
      </div>

      <div class="inspect-vitals-ribbon">
        <div class="inspect-stat-card"><span class="inspect-stat-card-label">Hit Points</span><span class="inspect-stat-card-val">${hp.cur}/${hp.max} ${hp.temp > 0 ? `(+${hp.temp})` : ''}</span></div>
        <div class="inspect-stat-card"><span class="inspect-stat-card-label">Armor Class</span><span class="inspect-stat-card-val">${member.ac || 10}</span></div>
        <div class="inspect-stat-card"><span class="inspect-stat-card-label">Passive Perception</span><span class="inspect-stat-card-val">${member.passivePerception || 10}</span></div>
        <div class="inspect-stat-card"><span class="inspect-stat-card-label">Passive Insight</span><span class="inspect-stat-card-val">${member.passiveInsight || 10}</span></div>
        <div class="inspect-stat-card"><span class="inspect-stat-card-label">Speed</span><span class="inspect-stat-card-val">${member.speed || 30} ft</span></div>
      </div>

      <div class="inspect-section">
        <h4 class="inspect-section-title">Ability Scores &amp; Saves</h4>
        <div class="inspect-ability-grid">
          ${["str", "dex", "con", "int", "wis", "cha"].map((s) => {
            const a = attrs[s] || { score: 10, mod: 0, save: 0, isSaveProf: false };
            return `
              <div class="inspect-ability-cell">
                <span class="inspect-attr-tag">${s.toUpperCase()}</span>
                <span class="inspect-attr-mod">${a.mod >= 0 ? `+${a.mod}` : a.mod}</span>
                <span class="inspect-attr-score">(${a.score})</span>
                <span class="inspect-attr-save">Save: ${a.save >= 0 ? `+${a.save}` : a.save}</span>
              </div>
            `;
          }).join("")}
        </div>
      </div>

      <div class="inspect-section">
        <h4 class="inspect-section-title">Weapons &amp; Attacks</h4>
        <div class="inspect-weapons-list">
          ${(member.weapons || []).filter(w => w.name).map(w => `
            <div class="inspect-weapon-row">
              <span class="inspect-wpn-name">${escapeHtml(w.name)}</span>
              <span class="inspect-wpn-type">${escapeHtml(w.atk || '-')}</span>
              <span class="inspect-wpn-dmg">${escapeHtml(w.dmg || '-')}</span>
              <span class="inspect-wpn-notes">${escapeHtml(w.notes || '')}</span>
            </div>
          `).join("") || '<p class="loading-text">No weapons logged.</p>'}
        </div>
      </div>

      <div class="inspect-section">
        <h4 class="inspect-section-title">Abilities &amp; Traits</h4>
        <div class="inspect-grid-blocks">
          ${(member.traits || []).map(t => `
            <div class="inspect-mini-card">
              <span class="inspect-mini-title">${escapeHtml(t.name)}</span>
              <span class="inspect-mini-tag">${escapeHtml(t.type || 'Feature')}</span>
              <p class="inspect-mini-desc">${escapeHtml(t.desc || '')}</p>
            </div>
          `).join("") || '<p class="loading-text">No features listed.</p>'}
        </div>
      </div>
    `;
  }

  document.getElementById("dmInspectModal")?.classList.add("open");
}

async function kickPlayerFromRoom(memberId) {
  if (!db || !activeDMRoomCode || !memberId) return;
  if (!confirm("Are you sure you want to remove this player from the live party?")) return;
  try {
    await db.collection("campaigns").doc(activeDMRoomCode).collection("members").doc(memberId).delete();
    closeModal("dmInspectModal");
    currentInspectedMemberId = null;
    showStatus("Player removed from session");
  } catch (err) {
    console.error("Kick error:", err);
  }
}

/* ==========================================================================
   HP CALCULATOR & REST ACTIONS
   ========================================================================== */

function applyHpAdjustment(type) {
  const amtInput = document.getElementById("hpModalAmount");
  const amt = parseInt(amtInput?.value, 10);
  if (!amt || isNaN(amt) || amt <= 0) {
    alert("Please enter a valid positive number.");
    return;
  }

  const curHpEl = document.getElementById("curHp");
  const maxHpEl = document.getElementById("maxHp");
  const tempHpEl = document.getElementById("tempHp");

  let curHp = parseInt(curHpEl?.value, 10) || 0;
  const maxHp = parseInt(maxHpEl?.value, 10) || 10;
  let tempHp = parseInt(tempHpEl?.value, 10) || 0;

  if (type === "damage") {
    if (tempHp > 0) {
      if (amt <= tempHp) {
        tempHp -= amt;
      } else {
        const remaining = amt - tempHp;
        tempHp = 0;
        curHp = Math.max(0, curHp - remaining);
      }
    } else {
      curHp = Math.max(0, curHp - amt);
    }
    showStatus(`Took ${amt} damage!`);
  } else if (type === "heal") {
    curHp = Math.min(maxHp, curHp + amt);
    showStatus(`Healed for ${amt} HP!`);
  } else if (type === "temp") {
    tempHp = Math.max(tempHp, amt);
    showStatus(`Gained ${amt} Temp HP!`);
  }

  if (curHpEl) curHpEl.value = curHp;
  if (tempHpEl) tempHpEl.value = tempHp;

  saveSheet(false);
  closeModal("hpModal");
}

function applyShortRest() {
  const curHDEl = document.getElementById("hitDiceCur");
  const maxHDEl = document.getElementById("hitDiceMax");
  const curHpEl = document.getElementById("curHp");
  const maxHpEl = document.getElementById("maxHp");

  let curHD = parseInt(curHDEl?.value, 10) || 0;
  let curHp = parseInt(curHpEl?.value, 10) || 0;
  const maxHp = parseInt(maxHpEl?.value, 10) || 10;
  const conMod = getModifier(parseInt(document.getElementById("attr_con")?.value, 10) || 10);

  if (curHD <= 0) {
    alert("You have no Hit Dice left to spend during this Short Rest.");
    return;
  }

  const spend = prompt(`Short Rest: You have ${curHD} Hit Dice available.\nHow many would you like to spend to recover HP?`, "1");
  const count = parseInt(spend, 10);
  if (!count || isNaN(count) || count <= 0) return;

  const toSpend = Math.min(curHD, count);
  let totalHealed = 0;
  for (let i = 0; i < toSpend; i++) {
    const roll = Math.floor(Math.random() * 8) + 1; // default fallback d8
    totalHealed += Math.max(1, roll + conMod);
  }

  curHD -= toSpend;
  curHp = Math.min(maxHp, curHp + totalHealed);

  if (curHDEl) curHDEl.value = curHD;
  if (curHpEl) curHpEl.value = curHp;

  // Restore class points (if applicable)
  const classPtsMax = parseInt(document.getElementById("classPtsMax")?.value, 10) || 0;
  const curClassPts = document.getElementById("classPtsCur");
  if (curClassPts && classPtsMax > 0) curClassPts.value = classPtsMax;

  saveSheet(false);
  showStatus(`Short Rest: Spent ${toSpend} HD, restored ${totalHealed} HP!`);
}

function applyLongRest() {
  if (!confirm("Take a Long Rest? This will restore all HP, reset spell slots, restore class points, and recover half your Hit Dice.")) return;

  const maxHp = parseInt(document.getElementById("maxHp")?.value, 10) || 10;
  const curHpEl = document.getElementById("curHp");
  if (curHpEl) curHpEl.value = maxHp;

  const tempHpEl = document.getElementById("tempHp");
  if (tempHpEl) tempHpEl.value = 0;

  // Restore Hit Dice (half max, min 1)
  const maxHD = parseInt(document.getElementById("hitDiceMax")?.value, 10) || 1;
  const curHDEl = document.getElementById("hitDiceCur");
  if (curHDEl) {
    let curHD = parseInt(curHDEl.value, 10) || 0;
    curHD = Math.min(maxHD, curHD + Math.max(1, Math.floor(maxHD / 2)));
    curHDEl.value = curHD;
  }

  // Restore Spell Slots
  for (let lvl = 1; lvl <= 9; lvl++) {
    const maxVal = parseInt(document.getElementById(`slot${lvl}_max`)?.value, 10) || 0;
    const curEl = document.getElementById(`slot${lvl}_cur`);
    if (curEl) curEl.value = maxVal;
    updateSlotPips(lvl);
  }

  // Reset Death Saves
  const dSucc = document.getElementById("deathSucc");
  const dFail = document.getElementById("deathFail");
  if (dSucc) dSucc.value = 0;
  if (dFail) dFail.value = 0;

  // Reset Class Points
  const classPtsMax = parseInt(document.getElementById("classPtsMax")?.value, 10) || 0;
  const curClassPts = document.getElementById("classPtsCur");
  if (curClassPts) curClassPts.value = classPtsMax;

  // Decrease Exhaustion by 1
  const exEl = document.getElementById("exhaustionLevel");
  if (exEl) {
    const curEx = parseInt(exEl.value, 10) || 0;
    if (curEx > 0) exEl.value = curEx - 1;
  }

  saveSheet(false);
  showStatus("Long Rest Complete! Vitals & Slots Restored.");
}

/* ==========================================================================
   MULTI-PLATFORM IMPORTERS
   ========================================================================== */

function importFromPconParchment(parsed) {
  const data = Array.isArray(parsed) ? parsed[0] : (parsed.character || parsed.data || parsed);
  if (!data) throw new Error("Unrecognized parchment format");

  resetSheet();

  const charName = data.name || data.charName || "Imported Character";
  document.getElementById("charName").value = charName;
  if (data.level || data.charLevel) document.getElementById("charLevel").value = data.level || data.charLevel;
  if (data.race || data.charRace) document.getElementById("charRace").value = data.race || data.charRace;
  if (data.class || data.charClass) document.getElementById("charClass").value = data.class || data.charClass;

  const stats = ["str", "dex", "con", "int", "wis", "cha"];
  stats.forEach((s) => {
    const val = data.stats?.[s] || data.attributes?.[s]?.score || data[`attr_${s}`] || 10;
    const el = document.getElementById(`attr_${s}`);
    if (el) el.value = val;
  });

  if (data.hp || data.maxHp) {
    const max = data.hp?.max || data.maxHp || 10;
    const cur = data.hp?.cur || data.curHp || max;
    document.getElementById("maxHp").value = max;
    document.getElementById("curHp").value = cur;
  }

  if (Array.isArray(data.spells)) myCharacterSpells = data.spells;
  if (Array.isArray(data.traits)) myCharacterTraits = data.traits;
  if (Array.isArray(data.weapons)) myCharacterWeapons = data.weapons;

  recalculateAll();
  renderWeapons();
  renderMySpells();
  renderMyTraits();
  saveSheet(false);
  showStatus("Imported from PC on Parchment!");
}

function importFromDnDBeyond(parsed) {
  const d = parsed.data || parsed;
  if (!d) throw new Error("Invalid D&D Beyond format");

  resetSheet();

  document.getElementById("charName").value = d.name || "D&D Beyond Character";

  // Race
  if (d.race?.fullName) document.getElementById("charRace").value = d.race.fullName;

  // Class & Level
  if (Array.isArray(d.classes) && d.classes.length > 0) {
    const primary = d.classes[0];
    document.getElementById("charClass").value = primary.definition?.name || "";
    document.getElementById("charLevel").value = primary.level || 1;
  }

  // Base Stats
  const statMap = ["str", "dex", "con", "int", "wis", "cha"];
  if (Array.isArray(d.stats)) {
    d.stats.forEach((s, idx) => {
      const statCode = statMap[idx];
      const el = document.getElementById(`attr_${statCode}`);
      if (el) el.value = s.value || 10;
    });
  }

  // HP
  const baseHp = d.baseHitPoints || 10;
  const bonusHp = d.bonusHitPoints || 0;
  const totalMax = baseHp + bonusHp;
  document.getElementById("maxHp").value = totalMax;
  document.getElementById("curHp").value = totalMax - (d.removedHitPoints || 0);

  // Weapons & Actions
  if (Array.isArray(d.inventory)) {
    myCharacterWeapons = [];
    d.inventory.forEach((item) => {
      if (item.definition?.filterType === "Weapon" && item.equipped) {
        myCharacterWeapons.push({
          name: item.definition.name || "Weapon",
          atk: item.definition.attackType === 1 ? "Melee" : "Ranged",
          dmg: item.definition.damage?.diceString || "1d6",
          notes: item.definition.snippet || ""
        });
      }
    });
  }

  recalculateAll();
  renderWeapons();
  saveSheet(false);
  showStatus("Imported from D&D Beyond!");
}

/* ==========================================================================
   DIRECT MODAL OPEN HANDLERS
   ========================================================================== */

function openPartyModal() {
  updatePartyStatusUI();
  const modal = document.getElementById("partyModal");
  if (modal) {
    modal.classList.add("open");
    modal.querySelectorAll(".party-mode-tabs .sub-tab").forEach((b, i) => {
      b.classList.toggle("active", i === 0);
    });
    document.getElementById("party-join-view")?.classList.add("active");
    document.getElementById("party-dm-view")?.classList.remove("active");
  }
}

function openSpellModal() {
  const input = document.getElementById("spellSearchInput");
  if (input) input.value = "";
  loadAllSpells();
  filterAndRenderSpells("");
  document.getElementById("spellModal")?.classList.add("open");
  setTimeout(() => input?.focus(), 60);
}

function openTraitModal() {
  const input = document.getElementById("traitSearchInput");
  if (input) input.value = "";
  loadAllTraits();
  filterAndRenderTraits("");
  document.getElementById("traitModal")?.classList.add("open");
  setTimeout(() => input?.focus(), 60);
}

// Master Click Event Delegation
document.addEventListener("click", async (e) => {
  // 1. TOP MAIN WORKSPACE TABS ROUTING
  const mainTab = e.target.closest(".main-tab");
  if (mainTab && mainTab.dataset.target) {
    e.preventDefault();
    switchMainTab(mainTab.dataset.target);
    return;
  }

  // 2. SUBTABS ROUTING (Journal, Party, Importers)
  const subTab = e.target.closest(".sub-tab");
  if (subTab && subTab.dataset.sub) {
    e.preventDefault();
    const parentContainer = subTab.closest(".subtab-controls");
    if (parentContainer) {
      parentContainer.querySelectorAll(".sub-tab").forEach((b) => b.classList.remove("active"));
      subTab.classList.add("active");
      const parentScope = parentContainer.parentElement;
      parentScope.querySelectorAll(".subtab-page").forEach((p) => p.classList.remove("active"));
      document.getElementById(subTab.dataset.sub)?.classList.add("active");
    }
    return;
  }

  // 3. FOOTER QUICKNAV
  const footerBtn = e.target.closest(".footer-nav-btn");
  if (footerBtn && footerBtn.dataset.tab) {
    e.preventDefault();
    switchMainTab(footerBtn.dataset.tab);
    const map = {
      attr: ".attributes-group",
      skills: ".skills-attribute-matrix",
      traits: "#tab-traits",
      spells: "#tab-spells",
      journal: "#tab-journal"
    };
    if (footerBtn.dataset.scroll && map[footerBtn.dataset.scroll]) {
      document.querySelector(map[footerBtn.dataset.scroll])?.scrollIntoView({ behavior: "smooth" });
    }
    return;
  }

  // Modal Close Buttons
  if (e.target.classList.contains("modal-close-btn") || e.target.closest(".modal-close-btn")) {
    e.preventDefault();
    e.target.closest(".modal-backdrop")?.classList.remove("open");
    if (e.target.closest("#dmInspectModal")) currentInspectedMemberId = null;
    return;
  }
  if (e.target.classList.contains("modal-backdrop")) {
    e.preventDefault();
    e.target.classList.remove("open");
    if (e.target.id === "dmInspectModal") currentInspectedMemberId = null;
    return;
  }

  // TOP BAR COMMAND BUTTONS
  if (e.target.id === "partyModalBtn" || e.target.closest("#partyModalBtn")) {
    e.preventDefault();
    openPartyModal();
    return;
  }

  if (e.target.id === "authModalBtn" || e.target.closest("#authModalBtn")) {
    setAuthError("");
    document.getElementById("authModal")?.classList.add("open");
    return;
  }

  if (e.target.id === "saveBtn" || e.target.closest("#saveBtn")) {
    saveSheet(false);
    return;
  }

  if (e.target.id === "loadBtn" || e.target.closest("#loadBtn")) {
    renderCharList();
    document.getElementById("loadModal")?.classList.add("open");
    return;
  }

  if (e.target.id === "newBtn" || e.target.closest("#newBtn")) {
    if (confirm("Create a new blank character sheet?")) resetSheet();
    return;
  }

  if (e.target.id === "backupBtn" || e.target.closest("#backupBtn")) {
    const roster = getRoster();
    const currentChar = roster[activeCharId] || {
      id: activeCharId,
      name: "Character",
      avatar: myCharacterAvatar,
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

  if (e.target.id === "importHubBtn" || e.target.closest("#importHubBtn")) {
    const pTxt = document.getElementById("parchmentJsonInput");
    const dTxt = document.getElementById("dndbeyondJsonInput");
    if (pTxt) pTxt.value = "";
    if (dTxt) dTxt.value = "";
    document.getElementById("importHubModal")?.classList.add("open");
    return;
  }

  if (e.target.id === "deleteBtn" || e.target.closest("#deleteBtn")) {
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

  if (e.target.id === "cancelImportHubBtn" || e.target.closest("#cancelImportHubBtn") || e.target.id === "cancelDnDBeyondBtn") {
    closeModal("importHubModal");
    return;
  }

  if (e.target.id === "parseParchmentBtn") {
    const txt = document.getElementById("parchmentJsonInput")?.value.trim();
    if (!txt) {
      alert("Please paste the character JSON or select a file first.");
      return;
    }
    try {
      const parsed = JSON.parse(txt);
      importFromPconParchment(parsed);
      closeModal("importHubModal");
    } catch (err) {
      alert("Invalid JSON format. Please verify the copied text.");
    }
    return;
  }

  if (e.target.id === "parseDnDBeyondBtn") {
    const txt = document.getElementById("dndbeyondJsonInput")?.value.trim();
    if (!txt) {
      alert("Please paste the D&D Beyond character JSON or select a file first.");
      return;
    }
    try {
      const parsed = JSON.parse(txt);
      importFromDnDBeyond(parsed);
      closeModal("importHubModal");
    } catch (err) {
      alert("Invalid D&D Beyond JSON format. Please verify the copied text.");
    }
    return;
  }

  if (e.target.id === "addSpellBtn" || e.target.closest("#addSpellBtn") || e.target.closest(".btn-add-spell")) {
    e.preventDefault();
    openSpellModal();
    return;
  }

  if (e.target.id === "addTraitBtn" || e.target.closest("#addTraitBtn") || e.target.closest(".btn-add-trait")) {
    e.preventDefault();
    openTraitModal();
    return;
  }

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

  // Pick Spell
  const spellRow = e.target.closest(".spell-pick-row");
  if (spellRow) {
    const name = spellRow.dataset.name;
    const url = spellRow.dataset.url;
    let detail = allSpellsCache.find((s) => s.name.toLowerCase() === name.toLowerCase());

    myCharacterSpells.push({
      name: detail?.name || name,
      type: detail?.type || detail?.levelTag || "Cantrip",
      casting_time: detail?.casting_time || "1 Action",
      range: detail?.range || "30 ft",
      duration: detail?.duration || "Instantaneous",
      desc: detail?.desc || ""
    });

    saveSheet(false);
    renderMySpells();
    closeModal("spellModal");
    showStatus(`Added ${name}!`);

    if (url && (!detail || !detail.desc)) {
      fetchAPI("https://www.dnd5eapi.co" + url).then((fetched) => {
        if (fetched && fetched.desc) {
          const addedSpell = myCharacterSpells[myCharacterSpells.length - 1];
          if (addedSpell && addedSpell.name.toLowerCase() === name.toLowerCase() && !addedSpell.desc) {
            addedSpell.desc = Array.isArray(fetched.desc) ? fetched.desc.join("\n\n") : (fetched.desc || "");
            saveSheet(true);
            renderMySpells();
          }
        }
      }).catch(() => {});
    }
    return;
  }

  // Pick Trait
  const traitRow = e.target.closest(".trait-pick-row");
  if (traitRow) {
    const name = traitRow.dataset.name;
    const url = traitRow.dataset.url;
    let detail = allTraitsCache.find((t) => t.name.toLowerCase() === name.toLowerCase());

    myCharacterTraits.push({
      name: detail?.name || name,
      type: detail?.type || traitRow.dataset.type || "Feature",
      desc: detail?.desc || "",
      isExpanded: false
    });

    saveSheet(false);
    renderMyTraits();
    closeModal("traitModal");
    showStatus(`Added ${name}!`);

    if (url && (!detail || !detail.desc)) {
      fetchAPI("https://www.dnd5eapi.co" + url).then((fetched) => {
        if (fetched && fetched.desc) {
          const addedTrait = myCharacterTraits[myCharacterTraits.length - 1];
          if (addedTrait && addedTrait.name.toLowerCase() === name.toLowerCase() && !addedTrait.desc) {
            addedTrait.desc = Array.isArray(fetched.desc) ? fetched.desc.join("\n\n") : (fetched.desc || "");
            saveSheet(true);
            renderMyTraits();
          }
        }
      }).catch(() => {});
    }
    return;
  }

  // Auth Buttons
  if (e.target.id === "emailLoginBtn") {
    if (!auth) return setAuthError("Firebase is not initialized.");
    const email = document.getElementById("authEmail")?.value.trim();
    const pass = document.getElementById("authPassword")?.value;
    if (!email || !pass) return setAuthError("Please enter your email and password.");
    try {
      await auth.signInWithEmailAndPassword(email, pass);
      showStatus("Logged In!");
      document.getElementById("authModal")?.classList.remove("open");
    } catch (err) {
      setAuthError(err.message);
    }
    return;
  }

  if (e.target.id === "emailSignUpBtn") {
    if (!auth) return setAuthError("Firebase is not initialized.");
    const email = document.getElementById("authEmail")?.value.trim();
    const pass = document.getElementById("authPassword")?.value;
    if (!email || !pass) return setAuthError("Please enter an email and password.");
    try {
      await auth.createUserWithEmailAndPassword(email, pass);
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
    showStatus("Signed Out");
    document.getElementById("authModal")?.classList.remove("open");
    return;
  }

  // Party Room Actions
  if (e.target.id === "joinCampaignBtn") {
    const input = document.getElementById("campaignRoomInput");
    if (input && input.value.trim()) {
      await joinCampaignRoom(input.value.trim());
    } else {
      alert("Please enter a room code (e.g. TAVERN-42).");
    }
    return;
  }

  if (e.target.id === "leaveCampaignBtn") {
    await leaveCampaignRoom();
    return;
  }

  if (e.target.id === "createCampaignBtn") {
    createNewCampaignRoom();
    return;
  }

  if (e.target.id === "openDMRoomBtn") {
    const input = document.getElementById("dmRoomCodeInput");
    if (input && input.value.trim()) {
      startDMLiveListener(input.value.trim().toUpperCase());
    } else {
      alert("Please enter a room code to open.");
    }
    return;
  }

  if (e.target.id === "copyRoomCodeBtn") {
    const code = document.getElementById("dmActiveRoomCode")?.textContent;
    if (code && code !== "NONE") {
      navigator.clipboard.writeText(code).then(() => showStatus("Room Code Copied!"));
    }
    return;
  }

  if (e.target.id === "closeCampaignBtn") {
    await closeDMCampaignRoom();
    return;
  }

  const dmPlayerCard = e.target.closest(".dm-player-card");
  if (dmPlayerCard) {
    const memberId = dmPlayerCard.dataset.memberId;
    if (memberId) openInspectModal(memberId);
    return;
  }

  if (e.target.id === "inspectKickBtn") {
    if (currentInspectedMemberId) {
      await kickPlayerFromRoom(currentInspectedMemberId);
    }
    return;
  }

  // Avatar Click
  if (e.target.id === "avatarFrame" || e.target.closest("#avatarFrame")) {
    document.getElementById("avatarFileInput")?.click();
    return;
  }

  // HP Calculator Actions
  if (
    e.target.id === "openHpModalBtn" ||
    e.target.closest("#openHpModalBtn") ||
    e.target.id === "hpTitleClick" ||
    e.target.closest("#hpTitleClick") ||
    e.target.classList.contains("hp-corner-btn") ||
    e.target.closest(".hp-corner-btn")
  ) {
    const amtInput = document.getElementById("hpModalAmount");
    if (amtInput) amtInput.value = "";
    document.getElementById("hpModal")?.classList.add("open");
    setTimeout(() => amtInput?.focus(), 50);
    return;
  }

  if (e.target.id === "hpApplyDamageBtn") {
    applyHpAdjustment("damage");
    return;
  }
  if (e.target.id === "hpApplyHealBtn") {
    applyHpAdjustment("heal");
    return;
  }
  if (e.target.id === "hpApplyTempBtn") {
    applyHpAdjustment("temp");
    return;
  }

  // Rest Actions
  if (e.target.id === "shortRestBtn" || e.target.closest("#shortRestBtn")) {
    applyShortRest();
    return;
  }
  if (e.target.id === "longRestBtn" || e.target.closest("#longRestBtn")) {
    applyLongRest();
    return;
  }

  // Spell Slot Pip Click
  if (e.target.classList.contains("slot-pip")) {
    const lvl = parseInt(e.target.dataset.slotLvl, 10);
    const pipIdx = parseInt(e.target.dataset.pipIdx, 10);
    const curEl = document.getElementById(`slot${lvl}_cur`);
    if (curEl) {
      let curVal = parseInt(curEl.value, 10) || 0;
      if (e.target.classList.contains("active")) {
        curVal = Math.max(0, pipIdx);
      } else {
        curVal = Math.max(curVal, pipIdx + 1);
      }
      curEl.value = curVal;
      updateSlotPips(lvl);
      saveSheet(true);
    }
    return;
  }

  // Blur Toggle
  const blurBtn = e.target.closest(".blur-toggle-btn");
  if (blurBtn) {
    e.preventDefault();
    e.stopPropagation();
    const wrapper = blurBtn.closest("[data-blur-id]");
    if (wrapper) {
      wrapper.classList.toggle("blurred");
      const blurId = wrapper.dataset.blurId;
      if (wrapper.classList.contains("blurred")) {
        if (!myBlurredPills.includes(blurId)) myBlurredPills.push(blurId);
        wrapper.querySelectorAll(".dropdown-menu").forEach(d => d.classList.remove("open"));
      } else {
        myBlurredPills = myBlurredPills.filter((id) => id !== blurId);
      }
      saveSheet(true);
    }
    return;
  }

  // Close dropdowns when clicking outside
  if (!e.target.closest(".dropdown-pill-wrapper")) {
    document.querySelectorAll(".dropdown-menu").forEach((d) => d.classList.remove("open"));
  }

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

  // Dice Rolls
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

  if (e.target.id === "addWeaponBtn" || e.target.closest("#addWeaponBtn") || e.target.closest(".btn-add-weapon")) {
    if (!Array.isArray(myCharacterWeapons)) myCharacterWeapons = [];
    myCharacterWeapons.push({ name: "", atk: "", dmg: "", notes: "" });
    saveSheet(false);
    renderWeapons();
    showStatus("Weapon Added!");
    return;
  }

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

  if (e.target.classList.contains("trait-card-delete")) {
    myCharacterTraits.splice(parseInt(e.target.dataset.index, 10), 1);
    saveSheet(false);
    renderMyTraits();
    return;
  }

  if (e.target.classList.contains("trait-expand-btn") || e.target.closest(".trait-expand-btn")) {
    const btn = e.target.closest(".trait-expand-btn");
    const card = btn.closest(".trait-card");
    const idx = parseInt(card.dataset.index, 10);
    card.classList.toggle("expanded");
    const isExp = card.classList.contains("expanded");
    btn.innerHTML = `${isExp ? 'Collapse' : 'Expand'} <span class="trait-expand-icon">&blacktriangledown;</span>`;
    if (myCharacterTraits[idx]) myCharacterTraits[idx].isExpanded = isExp;
    saveSheet(true);
    return;
  }

  if (e.target.classList.contains("spell-card-delete")) {
    myCharacterSpells.splice(parseInt(e.target.dataset.index, 10), 1);
    saveSheet(false);
    renderMySpells();
    return;
  }

  if (e.target.classList.contains("char-delete-btn")) {
    const row = e.target.closest(".char-item-row");
    const roster = getRoster();
    if (confirm(`Permanently delete "${roster[row.dataset.id]?.name || "character"}"?`)) {
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

  if (e.target.closest(".char-item-name") || e.target.classList.contains("char-select-btn")) {
    const row = e.target.closest(".char-item-row");
    activeCharId = row.dataset.id;
    localStorage.setItem(ACTIVE_CHAR_ID_KEY, activeCharId);
    applyCharacterData(getRoster()[activeCharId]);
    closeModal("loadModal");
    showStatus("Character Loaded");
    return;
  }

  if (e.target.id === "helpLinkBtn") {
    document.getElementById("helpModal")?.classList.add("open");
    return;
  }
});

// Explicit Button Click Attachments
document.getElementById("partyModalBtn")?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  openPartyModal();
});
document.getElementById("addSpellBtn")?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  openSpellModal();
});
document.getElementById("addTraitBtn")?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  openTraitModal();
});

// Input & Change Handlers
document.getElementById("themeSelect")?.addEventListener("change", (e) => {
  applyTheme(e.target.value);
});

document.getElementById("avatarFileInput")?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    myCharacterAvatar = evt.target.result;
    renderAvatar();
    saveSheet(false);
    showStatus("Avatar Updated!");
  };
  reader.readAsDataURL(file);
});

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

document.getElementById("spellSearchInput")?.addEventListener("input", (e) => {
  filterAndRenderSpells(e.target.value);
});

document.getElementById("traitSearchInput")?.addEventListener("input", (e) => {
  filterAndRenderTraits(e.target.value);
});

document.getElementById("filterSpellbookInput")?.addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase().trim();
  document.querySelectorAll(".spell-card").forEach((card) => {
    const title = card.querySelector(".spell-custom-title-input")?.value.toLowerCase() || "";
    card.style.display = (!q || title.includes(q)) ? "flex" : "none";
  });
});

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

    if (e.target.id && e.target.id.startsWith("slot")) {
      const lvl = e.target.id.replace(/\D/g, "");
      if (lvl) updateSlotPips(lvl);
    }
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

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeAllModals();
    currentInspectedMemberId = null;
  }
});

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

document.getElementById("parchmentFileInput")?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const parsed = JSON.parse(evt.target.result);
      importFromPconParchment(parsed);
      closeModal("importHubModal");
    } catch (err) {
      alert("Invalid PC on Parchment JSON file.");
    }
  };
  reader.readAsText(file);
});

document.getElementById("dndbeyondFileInput")?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const parsed = JSON.parse(evt.target.result);
      importFromDnDBeyond(parsed);
      closeModal("importHubModal");
    } catch (err) {
      alert("Invalid D&D Beyond JSON file.");
    }
  };
  reader.readAsText(file);
});

// Initialization
applyTheme(localStorage.getItem(THEME_STORAGE_KEY) || "theme-obsidian");
loadSheet();
loadAllSpells();
loadAllTraits();
updatePartyStatusUI();
