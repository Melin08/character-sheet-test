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
const THEME_STORAGE_KEY = "badman_active_theme_v2";
const CAMPAIGN_ROOM_KEY = "badman_active_campaign_room";
const RECENT_ROOMS_KEY = "badman_recent_rooms_v1";
const CREATED_ROOMS_KEY = "badman_created_dm_rooms_v1";

let activeCharId = localStorage.getItem(ACTIVE_CHAR_ID_KEY) || "default";
let connectedCampaignRoom = localStorage.getItem(CAMPAIGN_ROOM_KEY) || "";

let myCharacterAvatar = "";
let myCharacterSpells = [];
let myCharacterTraits = [];
let myCharacterWeapons = [
  { name: "", atk: "", dmg: "", notes: "" },
  { name: "", atk: "", dmg: "", notes: "" }
];
let myCustomResources = [];
let myStructuredInventory = [];
let myCompanions = [];
let myActiveConditions = [];
let myBlurredPills = [];
let diceRollHistory = [];
let lastBroadcastRoll = null;

// UI Filter & Dice States
let currentDiceMode = "norm"; // "norm" | "adv" | "dis"
let activeTraitCategoryFilter = "all";
let activeSpellLevelFilter = "all";
let isPartyDockCollapsed = false;
let filterProficientSkillsOnly = false;

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
  { name: "Misty Step", levelTag: "Level 2", schoolTag: "Conjuration", classesTag: "Sorcerer, Warlock, Wizard", casting_time: "1 Bonus Action", range: "Self", duration: "Instantaneous", desc: "Teleport up to 30 feet to an unoccupied space you can see." },
  { name: "Eldritch Blast", levelTag: "Cantrip", schoolTag: "Evocation", classesTag: "Warlock", casting_time: "1 Action", range: "120 ft", duration: "Instantaneous", desc: "A beam of crackling energy streaks toward a creature within range. Make a ranged spell attack against the target. On a hit, the target takes 1d10 force damage." }
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
  { name: "Dwarven Resilience", races: ["Dwarf"], type: "Racial Trait", desc: "Advantage on saving throws against poison, and resistance against poison damage." },
  { name: "Lucky", type: "Feat", desc: "You have 3 luck points per long rest. Whenever you make an attack roll, an ability check, or a saving throw, you can spend one luck point to roll an additional d20." },
  { name: "War Caster", type: "Feat", desc: "You have advantage on Constitution saving throws that you make to maintain your concentration on a spell when you take damage." },
  { name: "Great Weapon Master", type: "Feat", desc: "Before you make a melee attack with a heavy weapon that you are proficient with, you can choose to take a -5 penalty to the attack roll to add +10 to the attack's damage." },
  { name: "Sharpshooter", type: "Feat", desc: "Attacking at long range doesn't impose disadvantage. Before making an attack with a ranged weapon, you can take a -5 penalty to hit for +10 damage." }
];

/* ==========================================================================
   UTILITIES, OS DETECTION & HELPERS
   ========================================================================== */

function detectOSAndSetShortcut() {
  const kbdEl = document.getElementById("quickActionShortcutKbd");
  const btnEl = document.getElementById("commandPaletteBtn");
  if (!kbdEl) return;

  const isTouchOnly = window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  if (isTouchOnly) {
    kbdEl.style.display = "none";
    return;
  }

  const platform = (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || "").toLowerCase();
  const isMac = platform.includes("mac") || platform.includes("iphone") || platform.includes("ipad");
  const shortcutText = isMac ? "⌘K" : "Ctrl+K";

  kbdEl.textContent = shortcutText;
  if (btnEl) btnEl.title = `Quick Roll & Search (${shortcutText})`;
}

function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

let toastTimer = null;
function showStatus(text) {
  const toast = document.getElementById("saveToast");
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

function getModifier(score) {
  return Math.floor((score - 10) / 2);
}

function getProfBonus(level) {
  return Math.ceil(1 + level / 4);
}

function formatSigned(val) {
  return val >= 0 ? `+${val}` : `${val}`;
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

// Themes (including Sovereign VTT Redesigned UI theme-nexus)
function applyTheme(themeName) {
  const themes = [
    "theme-nexus",
    "theme-obsidian", "theme-parchment", "theme-eldritch", "theme-celestial", "theme-emerald",
    "theme-aethertech", "theme-bloodmoon", "theme-glacial", "theme-underdark", "theme-solaris", "theme-cartographer"
  ];
  themes.forEach((t) => document.body.classList.remove(t));
  const validTheme = themes.includes(themeName) ? themeName : "theme-nexus";
  document.body.classList.add(validTheme);
  localStorage.setItem(THEME_STORAGE_KEY, validTheme);
  const sel = document.getElementById("themeSelect");
  if (sel) sel.value = validTheme;
}

/* ==========================================================================
   CORE CALCULATIONS & HUD UPDATES
   ========================================================================== */

function updateXpBar() {
  const xpInput = document.getElementById("charExp");
  const fill = document.getElementById("xpBarFill");
  const nextLabel = document.getElementById("xpNextTierText");
  if (!xpInput || !fill) return;

  const raw = parseInt(String(xpInput.value).replace(/\D/g, ""), 10) || 0;
  const level = Math.min(20, Math.max(1, parseInt(document.getElementById("charLevel")?.value, 10) || 1));
  const xpThresholds = [
    0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
    85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000
  ];
  const curTier = xpThresholds[level - 1] || 0;
  const nextTier = xpThresholds[level] || 355000;
  const span = Math.max(1, nextTier - curTier);
  const progress = level >= 20 ? 100 : Math.min(100, Math.max(0, ((raw - curTier) / span) * 100));
  fill.style.width = `${progress}%`;
  if (nextLabel) {
    nextLabel.textContent = level >= 20 ? "/ MAX" : `/ ${nextTier.toLocaleString()}`;
  }
}

function updateHealthBars() {
  const curHp = parseInt(document.getElementById("curHp")?.value, 10) || 0;
  const maxHp = Math.max(1, parseInt(document.getElementById("maxHp")?.value, 10) || 10);
  const tempHp = Math.max(0, parseInt(document.getElementById("tempHp")?.value, 10) || 0);

  const hpPct = Math.min(100, Math.max(0, Math.round((curHp / maxHp) * 100)));
  const tempPct = Math.min(100 - hpPct, Math.max(0, Math.round((tempHp / maxHp) * 100)));

  const hpFill = document.getElementById("heroHpBarFill");
  const tempFill = document.getElementById("heroTempHpBarFill");
  const caption = document.getElementById("hpStatusCaption");

  if (hpFill) hpFill.style.width = `${hpPct}%`;
  if (tempFill) tempFill.style.width = `${tempPct}%`;

  if (caption) {
    if (curHp <= 0) caption.textContent = "Unconscious / Dying (0%)";
    else if (hpPct <= 25) caption.textContent = `Critical (${hpPct}%)`;
    else if (hpPct <= 50) caption.textContent = `Bloodied (${hpPct}%)`;
    else caption.textContent = `Healthy (${hpPct}%)${tempHp > 0 ? ` +${tempHp} Temp` : ""}`;
  }
}

function updateConcentrationBanner() {
  const concInput = document.getElementById("spellConcentration");
  const banner = document.getElementById("globalConcentrationBanner");
  const nameEl = document.getElementById("globalConcentrationName");
  const spellVal = concInput?.value?.trim() || "";

  if (banner && nameEl) {
    if (spellVal) {
      banner.style.display = "inline-flex";
      nameEl.textContent = spellVal;
    } else {
      banner.style.display = "none";
      nameEl.textContent = "None";
    }
  }

  document.querySelectorAll(".spell-conc-btn").forEach((btn) => {
    const cardSpellName = btn.dataset.spellName || "";
    if (spellVal && cardSpellName.toLowerCase() === spellVal.toLowerCase()) {
      btn.classList.add("active");
      btn.textContent = "Concentrating";
    } else {
      btn.classList.remove("active");
      btn.textContent = "Concentrate";
    }
  });
}

function updateWealthAndEncumbrance() {
  const cp = parseInt(document.getElementById("coin_cp")?.value, 10) || 0;
  const sp = parseInt(document.getElementById("coin_sp")?.value, 10) || 0;
  const ep = parseInt(document.getElementById("coin_ep")?.value, 10) || 0;
  const gp = parseInt(document.getElementById("coin_gp")?.value, 10) || 0;
  const pp = parseInt(document.getElementById("coin_pp")?.value, 10) || 0;

  const totalGp = gp + (pp * 10) + (ep * 0.5) + (sp * 0.1) + (cp * 0.01);
  const wealthEl = document.getElementById("totalWealthGpDisplay");
  if (wealthEl) {
    wealthEl.textContent = `Total Value: ${totalGp.toLocaleString(undefined, { maximumFractionDigits: 2 })} GP`;
  }

  const strScore = parseInt(document.getElementById("attr_str")?.value, 10) || 10;
  const maxCarry = strScore * 15;

  let carriedLbs = 0;
  if (Array.isArray(myStructuredInventory)) {
    myStructuredInventory.forEach((item) => {
      const q = parseFloat(item.qty) || 0;
      const w = parseFloat(item.weight) || 0;
      carriedLbs += q * w;
    });
  }

  const weightDisplay = document.getElementById("carryWeightDisplay");
  const barFill = document.getElementById("encumbranceBarFill");
  const statusText = document.getElementById("encumbranceStatusText");

  if (weightDisplay) {
    weightDisplay.textContent = `${carriedLbs.toFixed(1).replace(/\.0$/, "")} / ${maxCarry} lbs`;
  }

  const pct = Math.min(100, Math.max(0, (carriedLbs / Math.max(1, maxCarry)) * 100));
  if (barFill) {
    barFill.style.width = `${pct}%`;
    barFill.style.background = carriedLbs > maxCarry ? "#ef4444" : (pct > 66 ? "#f59e0b" : "#10b981");
  }
  if (statusText) {
    if (carriedLbs > maxCarry) {
      statusText.textContent = `Overencumbered! Speed reduced (Max = ${maxCarry} lbs)`;
    } else {
      statusText.textContent = `Unencumbered (Max = STR × 15 = ${maxCarry} lbs)`;
    }
  }
}

function updateTabCounters() {
  const traitsBadge = document.getElementById("traitsCountBadge");
  const spellsBadge = document.getElementById("spellsCountBadge");
  if (traitsBadge) traitsBadge.textContent = myCharacterTraits.length;
  if (spellsBadge) spellsBadge.textContent = myCharacterSpells.length;
}

function filterSkillsMatrix() {
  const q = (document.getElementById("quickSkillSearch")?.value || "").toLowerCase().trim();

  document.querySelectorAll(".skill-attr-column").forEach((col) => {
    let visibleCount = 0;
    col.querySelectorAll(".skill-row").forEach((row) => {
      const label = (row.querySelector(".skill-label")?.textContent || "").toLowerCase();
      const isProf = !!row.querySelector(".prof-cb")?.checked;
      const isExp = !!row.querySelector(".exp-cb")?.checked;

      const matchesSearch = !q || label.includes(q);
      const matchesProf = !filterProficientSkillsOnly || isProf || isExp;

      if (matchesSearch && matchesProf) {
        row.style.display = "flex";
        visibleCount++;
      } else {
        row.style.display = "none";
      }
    });
    col.style.display = visibleCount > 0 ? "flex" : "none";
  });
}

function recalculateAll() {
  const levelInput = document.getElementById("charLevel");
  const level = Math.min(20, Math.max(1, parseInt(levelInput?.value, 10) || 1));
  const prof = getProfBonus(level);
  const isJackOfAllTrades = !!document.getElementById("jackOfAllTradesCb")?.checked;
  const halfProf = Math.floor(prof / 2);

  const profBonusDisplay = document.getElementById("profBonusDisplay");
  if (profBonusDisplay) profBonusDisplay.textContent = formatSigned(prof);

  const stats = ["str", "dex", "con", "int", "wis", "cha"];
  const mods = {};

  stats.forEach((stat) => {
    const scoreVal = parseInt(document.getElementById(`attr_${stat}`)?.value, 10) || 10;
    const mod = getModifier(scoreVal);
    mods[stat] = mod;

    const modElem = document.getElementById(`mod_${stat}`);
    if (modElem) modElem.textContent = formatSigned(mod);

    const isSaveChecked = document.getElementById(`save_${stat}`)?.checked;
    const saveValElem = document.getElementById(`save_val_${stat}`);
    if (saveValElem) {
      const saveTotal = isSaveChecked ? mod + prof : mod;
      saveValElem.textContent = formatSigned(saveTotal);
    }
  });

  // Initiative Orb Calculation
  const initMisc = parseInt(document.getElementById("initBonusMod")?.value, 10) || 0;
  const initTotal = (mods["dex"] || 0) + initMisc + (isJackOfAllTrades ? halfProf : 0);
  const initDisplay = document.getElementById("initiativeDisplay");
  if (initDisplay) initDisplay.textContent = formatSigned(initTotal);

  let percBonus = mods["wis"] || 0;
  let insBonus = mods["wis"] || 0;
  let invBonus = mods["int"] || 0;

  document.querySelectorAll(".skill-row").forEach((row) => {
    const stat = row.dataset.stat;
    const statMod = mods[stat] ?? 0;
    const isProf = row.querySelector(".prof-cb")?.checked;
    const isExp = row.querySelector(".exp-cb")?.checked;

    let total = statMod;
    if (isProf) total += prof;
    if (isExp) total += prof;
    if (!isProf && !isExp && isJackOfAllTrades) total += halfProf;

    const valElem = row.querySelector(".skill-val");
    if (valElem) valElem.textContent = formatSigned(total);

    if (row.id === "row_perc") percBonus = total;
    if (row.id === "row_ins") insBonus = total;
    if (row.id === "row_inv") invBonus = total;
  });

  const passPercEl = document.getElementById("passivePerception");
  if (passPercEl) passPercEl.textContent = 10 + percBonus;

  const passInsEl = document.getElementById("passiveInsight");
  if (passInsEl) passInsEl.textContent = 10 + insBonus;

  const passInvEl = document.getElementById("passiveInvestigation");
  if (passInvEl) passInvEl.textContent = 10 + invBonus;

  updateXpBar();
  updateHealthBars();
  updateConcentrationBanner();
  updateWealthAndEncumbrance();
  updateTabCounters();
  filterSkillsMatrix();
}

/* ==========================================================================
   DYNAMIC SECTION RENDERERS
   ========================================================================== */

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
      <input type="text" class="save-field wpn-field wpn-name-input" data-prop="name" value="${escapeHtml(wpn.name || "")}" placeholder="Weapon or Attack..." />
      <div class="wpn-cell-with-roll">
        <input type="text" class="save-field wpn-field wpn-type-input center" data-prop="atk" value="${escapeHtml(wpn.atk || "")}" placeholder="+5" />
        <button type="button" class="wpn-roll-btn wpn-roll-atk-btn" data-index="${idx}" title="Roll Weapon Attack (d20 + Atk Bonus)">&#9856;</button>
      </div>
      <div class="wpn-cell-with-roll">
        <input type="text" class="save-field wpn-field wpn-dmg-input center" data-prop="dmg" value="${escapeHtml(wpn.dmg || "")}" placeholder="1d8+3" />
        <button type="button" class="wpn-roll-btn wpn-roll-dmg-btn" data-index="${idx}" title="Roll Weapon Damage">&#9876;</button>
      </div>
      <input type="text" class="save-field wpn-field wpn-notes-input" data-prop="notes" value="${escapeHtml(wpn.notes || "")}" placeholder="Range, mastery, properties..." />
      <button type="button" class="weapon-delete-btn" data-index="${idx}" title="Delete weapon">&times;</button>
    </div>
  `).join("");
}

function renderCustomResources() {
  const container = document.getElementById("customResourcesList");
  if (!container) return;

  if (!Array.isArray(myCustomResources)) myCustomResources = [];

  if (myCustomResources.length === 0) {
    container.innerHTML = `<span style="font-size: 0.78rem; color: var(--text-dim); font-style: italic;">No custom trackers yet. Click "+ Add Counter" to track Arrows, Bardic Inspiration, Luck, or Channel Divinity.</span>`;
    return;
  }

  container.innerHTML = myCustomResources.map((res, idx) => `
    <div class="custom-res-card" data-index="${idx}">
      <input type="text" class="custom-res-name custom-res-field" data-prop="name" value="${escapeHtml(res.name || "")}" placeholder="Resource..." />
      <div class="custom-res-controls">
        <input type="number" class="custom-res-input custom-res-field" data-prop="cur" value="${res.cur ?? 0}" />
        <span style="color: var(--text-dim); font-weight: 800;">/</span>
        <input type="number" class="custom-res-input custom-res-field" data-prop="max" value="${res.max ?? 0}" />
        <button type="button" class="custom-res-del" data-index="${idx}" title="Remove tracker">&times;</button>
      </div>
    </div>
  `).join("");
}

function renderStructuredInventory() {
  const container = document.getElementById("structuredInventoryList");
  if (!container) return;

  if (!Array.isArray(myStructuredInventory)) myStructuredInventory = [];

  if (myStructuredInventory.length === 0) {
    container.innerHTML = `<p style="font-size: 0.8rem; color: var(--text-dim); font-style: italic; padding: 0.4rem 0;">No individual weight-tracked items yet. Click "+ Add Tracked Item" to calculate encumbrance automatically.</p>`;
    updateWealthAndEncumbrance();
    return;
  }

  container.innerHTML = myStructuredInventory.map((item, idx) => `
    <div class="inv-item-row" data-index="${idx}">
      <input type="checkbox" class="inv-item-field" data-prop="equipped" ${item.equipped ? "checked" : ""} title="Equipped / Carried" />
      <input type="text" class="inv-item-field" data-prop="name" value="${escapeHtml(item.name || "")}" placeholder="Item name..." />
      <input type="number" class="inv-item-field center" data-prop="qty" value="${item.qty ?? 1}" min="0" title="Quantity" placeholder="Qty" />
      <input type="number" class="inv-item-field center" data-prop="weight" value="${item.weight ?? 0}" min="0" step="0.5" title="Weight (lbs per item)" placeholder="lbs" />
      <button type="button" class="weapon-delete-btn inv-item-delete" data-index="${idx}" title="Remove item">&times;</button>
    </div>
  `).join("");

  updateWealthAndEncumbrance();
}

function renderCompanions() {
  const container = document.getElementById("companionsList");
  if (!container) return;

  if (!Array.isArray(myCompanions)) myCompanions = [];

  if (myCompanions.length === 0) {
    container.innerHTML = `<p style="grid-column: 1 / -1; font-size: 0.88rem; color: #64748b; font-style: italic; padding: 2rem 0; text-align: center;">No companions, familiars, mounts, or creatures added yet. Click "+ Add Creature" above to create a statblock.</p>`;
    return;
  }

  container.innerHTML = myCompanions.map((comp, idx) => `
    <div class="companion-card" data-index="${idx}">
      <div class="trait-card-header">
        <input type="text" class="trait-name-input companion-field" data-prop="name" value="${escapeHtml(comp.name || "")}" placeholder="Creature Name (e.g. Owl Familiar, Dire Wolf)" />
        <button type="button" class="trait-card-delete companion-delete-btn" data-index="${idx}" title="Delete creature">&times;</button>
      </div>
      <div class="trait-type-wrap">
        <input type="text" class="trait-type-input companion-field" data-prop="type" value="${escapeHtml(comp.type || "Beast / Familiar")}" placeholder="Type &amp; CR" />
      </div>
      <div class="comp-stats-row">
        <div class="comp-stat-pill">
          <label>AC</label>
          <input type="number" class="companion-field" data-prop="ac" value="${comp.ac ?? 12}" />
        </div>
        <div class="comp-stat-pill">
          <label>Hit Points</label>
          <input type="text" class="companion-field" data-prop="hp" value="${escapeHtml(comp.hp || "10 / 10")}" placeholder="15 / 15" />
        </div>
        <div class="comp-stat-pill">
          <label>Speed</label>
          <input type="text" class="companion-field" data-prop="speed" value="${escapeHtml(comp.speed || "30 ft.")}" placeholder="30 ft., fly 60 ft." />
        </div>
      </div>
      <textarea class="trait-desc-input companion-field" data-prop="notes" placeholder="STR 10 DEX 14 CON 12... Attacks, Keen Senses, Flyby, Pack Tactics...">${escapeHtml(comp.notes || "")}</textarea>
    </div>
  `).join("");
}

function renderMyTraits() {
  const container = document.getElementById("traitsList");
  if (!container) return;

  updateTabCounters();

  if (myCharacterTraits.length === 0) {
    container.innerHTML = `<p style="grid-column: 1 / -1; font-size: 0.88rem; color: #64748b; font-style: italic; padding: 2rem 0; text-align: center;">No abilities added yet. Click "+ Add Ability" above to browse the compendium.</p>`;
    return;
  }

  const searchQuery = (document.getElementById("filterTraitsInput")?.value || "").toLowerCase().trim();

  container.innerHTML = myCharacterTraits.map((trait, idx) => {
    if (!trait) return "";
    const isExpanded = !!trait.isExpanded;
    const tName = (trait.name || "").toLowerCase();
    const tType = (trait.type || "FEATURE").toLowerCase();
    const tDesc = (trait.desc || "").toLowerCase();

    let matchesCat = true;
    if (activeTraitCategoryFilter === "class") matchesCat = tType.includes("class");
    else if (activeTraitCategoryFilter === "racial") matchesCat = tType.includes("rac") || tType.includes("species");
    else if (activeTraitCategoryFilter === "feat") matchesCat = tType.includes("feat");

    const matchesSearch = !searchQuery || tName.includes(searchQuery) || tType.includes(searchQuery) || tDesc.includes(searchQuery);
    const hiddenStyle = (matchesCat && matchesSearch) ? "" : "display: none;";

    return `
      <div class="trait-card ${isExpanded ? "expanded" : ""}" data-index="${idx}" style="${hiddenStyle}">
        <div class="trait-card-header">
          <input type="text" class="trait-name-input custom-trait-field" data-prop="name" value="${escapeHtml(trait.name || "")}" placeholder="Ability Name" />
          <button class="trait-card-delete" data-index="${idx}" type="button" title="Delete ability">&times;</button>
        </div>
        <div class="trait-type-wrap">
          <input type="text" class="trait-type-input custom-trait-field" data-prop="type" value="${escapeHtml(trait.type || "FEATURE")}" placeholder="Category (e.g. Class Feature, Feat)" />
        </div>
        <textarea class="trait-desc-input custom-trait-field" data-prop="desc" placeholder="Ability description and rules...">${escapeHtml(trait.desc || "")}</textarea>
        <div class="trait-card-footer">
          <button type="button" class="trait-expand-btn">
            ${isExpanded ? "Collapse" : "Expand"}
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

  updateTabCounters();

  if (myCharacterSpells.length === 0) {
    container.innerHTML = `<p style="grid-column: 1 / -1; font-size: 0.88rem; color: #64748b; text-align: center; font-style: italic; padding: 1.5rem 0;">No spells added yet. Click "+ Add Spell" above to browse the compendium.</p>`;
    return;
  }

  const searchQ = (document.getElementById("filterSpellbookInput")?.value || "").toLowerCase().trim();
  const activeConc = (document.getElementById("spellConcentration")?.value || "").trim().toLowerCase();

  container.innerHTML = myCharacterSpells.map((spell, idx) => {
    if (!spell) return "";
    const typeVal = spell.type || spell.levelTag || "Cantrip";
    const descVal = Array.isArray(spell.desc) ? spell.desc.join("\n\n") : (spell.desc || "");
    const sName = spell.name || "";
    const isConcentrating = activeConc && sName.toLowerCase() === activeConc;

    let matchesLvl = true;
    const lowerType = typeVal.toLowerCase();
    if (activeSpellLevelFilter === "cantrip") {
      matchesLvl = lowerType.includes("cantrip") || lowerType.includes("0");
    } else if (activeSpellLevelFilter === "5") {
      matchesLvl = /[56789]/.test(lowerType);
    } else if (activeSpellLevelFilter !== "all") {
      matchesLvl = lowerType.includes(activeSpellLevelFilter);
    }

    const matchesSearch = !searchQ ||
      sName.toLowerCase().includes(searchQ) ||
      lowerType.includes(searchQ) ||
      descVal.toLowerCase().includes(searchQ);

    const hiddenStyle = (matchesLvl && matchesSearch) ? "" : "display: none;";

    return `
      <div class="spell-card" draggable="true" data-index="${idx}" style="${hiddenStyle}">
        <div class="spell-card-header">
          <span class="spell-drag-handle" title="Drag to reorder">&vellip;&vellip;</span>
          <input type="text" class="spell-custom-title-input custom-spell-field" data-prop="name" value="${escapeHtml(sName)}" placeholder="Spell Name" />
          <div class="spell-card-actions">
            <button type="button" class="spell-conc-btn ${isConcentrating ? "active" : ""}" data-spell-name="${escapeHtml(sName)}" title="Set as active concentration spell">
              ${isConcentrating ? "Concentrating" : "Concentrate"}
            </button>
            <button class="spell-card-delete" data-index="${idx}" type="button" title="Delete spell">&times;</button>
          </div>
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
      if (["INPUT", "TEXTAREA", "BUTTON"].includes(e.target.tagName)) {
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

function renderSpellSlotGrid(savedFields = null) {
  const container = document.getElementById("slotsGridContainer");
  if (!container) return;

  const suffixes = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
  let html = "";

  for (let lvl = 1; lvl <= 9; lvl++) {
    const curVal = savedFields
      ? (parseInt(savedFields[`slot${lvl}_cur`], 10) || 0)
      : (parseInt(document.getElementById(`slot${lvl}_cur`)?.value, 10) || 0);
    const maxVal = savedFields
      ? (parseInt(savedFields[`slot${lvl}_max`], 10) || 0)
      : (parseInt(document.getElementById(`slot${lvl}_max`)?.value, 10) || 0);

    let pipsHtml = "";
    for (let i = 0; i < maxVal; i++) {
      const isAvailable = i < curVal;
      pipsHtml += `<span class="slot-pip ${isAvailable ? "active" : ""}" data-slot-lvl="${lvl}" data-pip-idx="${i}" title="${isAvailable ? "Click to Expend Slot" : "Click to Recover Slot"}"></span>`;
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
    pipsHtml += `<span class="slot-pip ${isAvailable ? "active" : ""}" data-slot-lvl="${lvl}" data-pip-idx="${i}" title="${isAvailable ? "Click to Expend Slot" : "Click to Recover Slot"}"></span>`;
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

/* ==========================================================================
   DICE ENGINE (ADVANTAGE / DISADVANTAGE, CRITS & LIVE PARTY BROADCAST)
   ========================================================================== */

function performD20Roll(bonus = 0, label = "Roll") {
  const r1 = Math.floor(Math.random() * 20) + 1;
  const r2 = Math.floor(Math.random() * 20) + 1;

  let chosen = r1;
  let rollDetail = `${r1}`;

  if (currentDiceMode === "adv") {
    chosen = Math.max(r1, r2);
    rollDetail = `ADV [${r1}, ${r2}] → ${chosen}`;
  } else if (currentDiceMode === "dis") {
    chosen = Math.min(r1, r2);
    rollDetail = `DIS [${r1}, ${r2}] → ${chosen}`;
  }

  const total = chosen + bonus;
  const bonusStr = bonus !== 0 ? (bonus > 0 ? ` + ${bonus}` : ` - ${Math.abs(bonus)}`) : "";

  updateDiceBadgeDisplay(total, `${label} (${rollDetail}${bonusStr})`, chosen === 20, chosen === 1);
  addDiceHistory(`${label} (${rollDetail}${bonusStr})`, total);
  return { chosen, total };
}

function updateDiceBadgeDisplay(total, captionText = "Result", isCritSuccess = false, isCritFail = false) {
  const out = document.getElementById("rollResult");
  const cap = document.getElementById("rollDetailCaption");
  const badge = document.getElementById("diceResultBadge");

  if (out) out.textContent = total;
  if (cap) {
    if (isCritSuccess) cap.textContent = "NATURAL 20!";
    else if (isCritFail) cap.textContent = "NATURAL 1!";
    else cap.textContent = captionText.length > 22 ? captionText.slice(0, 22) + "…" : captionText;
  }

  if (badge) {
    badge.classList.remove("crit-success", "crit-fail");
    if (isCritSuccess) badge.classList.add("crit-success");
    else if (isCritFail) badge.classList.add("crit-fail");
  }
}

function rollCustomFormula(formulaStr, customLabel = "") {
  const rawMatch = (formulaStr || "").toLowerCase().match(/(\d*d\d+(?:\s*[+-]\s*\d+)?)/);
  const clean = rawMatch ? rawMatch[1].replace(/\s+/g, "") : (formulaStr || "").replace(/\s+/g, "").toLowerCase();
  if (!clean) return;

  const regex = /^(\d*)d(\d+)([+-]\d+)?$/;
  const match = clean.match(regex);
  if (!match) {
    alert("Invalid dice formula. Use formats like: 2d6+4, 8d6, 1d8-1, or d20+5");
    return;
  }

  const count = Math.min(100, Math.max(1, parseInt(match[1] || "1", 10)));
  const sides = Math.max(2, parseInt(match[2], 10));
  const mod = match[3] ? parseInt(match[3], 10) : 0;

  if (count === 1 && sides === 20) {
    performD20Roll(mod, customLabel || clean);
    return;
  }

  const rolls = [];
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const r = Math.floor(Math.random() * sides) + 1;
    rolls.push(r);
    sum += r;
  }
  const total = sum + mod;
  const modText = mod !== 0 ? (mod > 0 ? `+${mod}` : `${mod}`) : "";
  const labelPrefix = customLabel ? `${customLabel}: ` : "";
  const detail = `${labelPrefix}${count}d${sides}${modText} [${rolls.join(", ")}]`;

  updateDiceBadgeDisplay(total, customLabel || `${count}d${sides}${modText}`);
  addDiceHistory(detail, total);
}

function addDiceHistory(desc, total) {
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const charName = document.getElementById("charName")?.value?.trim() || "Adventurer";

  diceRollHistory.unshift({ desc, total, time });
  if (diceRollHistory.length > 25) diceRollHistory.pop();
  renderDiceHistory();

  lastBroadcastRoll = {
    charName,
    desc,
    total: String(total),
    timestamp: Date.now()
  };

  if (db && connectedCampaignRoom && activeCharId) {
    db.collection("campaigns")
      .doc(connectedCampaignRoom)
      .collection("members")
      .doc(activeCharId)
      .set({ lastRoll: lastBroadcastRoll, updatedAt: Date.now() }, { merge: true })
      .catch(() => {});
  }
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

/* ==========================================================================
   ROSTER, LOCALSTORAGE & FIREBASE CLOUD SYNC
   ========================================================================== */

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

  const payload = {
    id: activeCharId,
    name: charData.name || "Unnamed Adventurer",
    charClass: f.charClass || "",
    charSubclass: f.charSubclass || "",
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
    customResources: myCustomResources || [],
    structuredInventory: myStructuredInventory || [],
    companions: myCompanions || [],
    conditions: myActiveConditions || [],
    concentration: (f.spellConcentration || "").trim(),
    otherProfs: f.otherProfs || "",
    passivePerception: parseInt(document.getElementById("passivePerception")?.textContent, 10) || 10,
    passiveInsight: parseInt(document.getElementById("passiveInsight")?.textContent, 10) || 10,
    passiveInvestigation: parseInt(document.getElementById("passiveInvestigation")?.textContent, 10) || 10,
    inspiration: f.charInspiration || "",
    heroicInspiration: !!f.heroicInspirationToggle,
    updatedAt: Date.now()
  };

  if (lastBroadcastRoll) {
    payload.lastRoll = lastBroadcastRoll;
  }

  return payload;
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
  try {
    localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(roster));
  } catch (err) {
    console.error("Local storage save error:", err);
    showStatus("Storage Full: Could not save locally!");
  }
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
  const subclass = fields.charSubclass?.trim() || "";
  const level = fields.charLevel || 1;

  const classLabel = subclass ? `${subclass} ${charClass}`.trim() : charClass;

  const charRecord = {
    id: activeCharId,
    name: name,
    summary: classLabel ? `${classLabel} (Lvl ${level})` : `Level ${level}`,
    updatedAt: Date.now(),
    avatar: myCharacterAvatar,
    fields: fields,
    spells: myCharacterSpells,
    traits: myCharacterTraits,
    weapons: myCharacterWeapons,
    customResources: myCustomResources,
    structuredInventory: myStructuredInventory,
    companions: myCompanions,
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

  renderSpellSlotGrid(fields);

  Object.keys(fields).forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      if (el.type === "checkbox") el.checked = !!fields[id];
      else el.value = fields[id];
    }
  });

  // Migrate legacy Hit Dice strings (e.g. "d10" or "2d10" in hitDiceMax) cleanly into #hitDieSize
  const hdMaxEl = document.getElementById("hitDiceMax");
  const hdSizeEl = document.getElementById("hitDieSize");
  if (hdMaxEl && typeof hdMaxEl.value === "string" && hdMaxEl.value.toLowerCase().includes("d")) {
    const match = hdMaxEl.value.toLowerCase().match(/(\d*)d(\d+)/);
    if (match) {
      const countPart = parseInt(match[1], 10) || parseInt(fields.charLevel, 10) || 1;
      const diePart = match[2];
      hdMaxEl.value = countPart;
      if (hdSizeEl && ["6", "8", "10", "12"].includes(diePart)) {
        hdSizeEl.value = diePart;
      }
    }
  }

  myCharacterAvatar = charData.avatar || "";
  myCharacterSpells = charData.spells || [];
  myCharacterTraits = charData.traits || [];
  myCustomResources = charData.customResources || [];
  myStructuredInventory = charData.structuredInventory || [];
  myCompanions = charData.companions || [];
  myActiveConditions = charData.conditions || [];
  myBlurredPills = charData.blurredPills || [];
  myCharacterWeapons = charData.weapons && charData.weapons.length >= 2 ? charData.weapons : [
    { name: "", atk: "", dmg: "", notes: "" },
    { name: "", atk: "", dmg: "", notes: "" }
  ];

  renderAvatar();
  renderWeapons();
  renderCustomResources();
  renderStructuredInventory();
  renderCompanions();
  renderMySpells();
  renderMyTraits();
  renderConditionChips();
  renderBlurredPills();
  recalculateAll();
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
      renderSpellSlotGrid();
      recalculateAll();
      renderAvatar();
      renderWeapons();
      renderCustomResources();
      renderStructuredInventory();
      renderCompanions();
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
    else if (field.id === "hitDieSize") field.value = 8;
    else if (
      field.classList.contains("hitdice-input") ||
      field.classList.contains("coin-input") ||
      field.classList.contains("slot-input") ||
      field.classList.contains("death-input") ||
      field.classList.contains("res-input") ||
      field.classList.contains("exhaustion-input") ||
      field.id === "tempHp" ||
      field.id === "initBonusMod"
    ) field.value = 0;
    else field.value = "";
  });

  myCharacterAvatar = "";
  myCharacterSpells = [];
  myCharacterTraits = [];
  myCustomResources = [];
  myStructuredInventory = [];
  myCompanions = [];
  myActiveConditions = [];
  myBlurredPills = [];
  myCharacterWeapons = [
    { name: "", atk: "", dmg: "", notes: "" },
    { name: "", atk: "", dmg: "", notes: "" }
  ];
  diceRollHistory = [];

  renderSpellSlotGrid();
  renderAvatar();
  renderDiceHistory();
  renderWeapons();
  renderCustomResources();
  renderStructuredInventory();
  renderCompanions();
  renderMySpells();
  renderMyTraits();
  renderConditionChips();
  renderBlurredPills();
  recalculateAll();
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
      const existing = new Set(allSpellsCache.map((s) => s.name.toLowerCase()));
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
            <span class="tag-pill ${isCantrip ? "tag-cantrip" : "tag-level"}">${escapeHtml(spell.levelTag || "Spell")}</span>
            ${spell.schoolTag ? `<span class="tag-pill ${getSchoolCssClass(spell.schoolTag)}">${escapeHtml(spell.schoolTag)}</span>` : ""}
            ${spell.classesTag ? `<span class="tag-pill ${getClassCssClass(spell.classesTag)}">${escapeHtml(spell.classesTag)}</span>` : ""}
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
      const existing = new Set(allTraitsCache.map((t) => t.name.toLowerCase()));
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
      (t.classes && t.classes.some((c) => c.toLowerCase().includes(q))) ||
      (t.races && t.races.some((r) => r.toLowerCase().includes(q)));
  });

  if (filtered.length === 0) {
    container.innerHTML = `<p class="loading-text">No features or traits found matching "${escapeHtml(query)}".</p>`;
    return;
  }

  container.innerHTML = filtered.slice(0, 100).map((trait) => {
    const classTag = trait.classes ? trait.classes.join(", ") : (trait.races ? trait.races.join(", ") : "");
    return `
      <div class="spell-option-item trait-pick-row" data-name="${escapeHtml(trait.name)}" data-url="${escapeHtml(trait.url || "")}" data-type="${escapeHtml(trait.type || "Feature")}">
        <div class="spell-option-details">
          <span class="spell-option-title">${escapeHtml(trait.name)}</span>
          <div class="spell-meta-tags">
            <span class="tag-pill tag-cantrip">${escapeHtml(trait.type || "Feature")}</span>
            ${classTag ? `<span class="tag-pill ${getClassCssClass(classTag)}">${escapeHtml(classTag)}</span>` : ""}
          </div>
        </div>
        <button type="button" class="spell-add-badge">+ Add</button>
      </div>
    `;
  }).join("");
}

/* ==========================================================================
   QUICK COMMAND PALETTE (CTRL+K / CMD+K)
   ========================================================================== */

function openCommandPalette() {
  const modal = document.getElementById("commandPaletteModal");
  const input = document.getElementById("commandPaletteInput");
  if (!modal || !input) return;
  input.value = "";
  renderCommandPaletteResults("");
  modal.classList.add("open");
  setTimeout(() => input.focus(), 50);
}

function renderCommandPaletteResults(query = "") {
  const container = document.getElementById("commandPaletteResults");
  if (!container) return;
  const q = query.toLowerCase().trim();

  const actions = [
    { title: "Switch to Sovereign VTT (Redesigned UI)", tag: "Layout", action: "set-theme", target: "theme-nexus" },
    { title: "Switch to Obsidian Dark (Classic Layout)", tag: "Layout", action: "set-theme", target: "theme-obsidian" },
    { title: "Roll Initiative", tag: "Combat", action: "roll-init" },
    { title: "Roll Death Saving Throw", tag: "Combat", action: "roll-death" },
    { title: "Take a Short Rest", tag: "Recovery", action: "short-rest" },
    { title: "Take a Long Rest", tag: "Recovery", action: "long-rest" },
    { title: "Open HP Damage / Heal Calculator", tag: "Vitality", action: "open-hp" },
    { title: "Open Party & DM Dashboard", tag: "Party", action: "open-party" },
    { title: "Reset Turn Economy (New Turn)", tag: "Combat", action: "reset-turn" },
    { title: "Go to Combat & Core Tab", tag: "Navigation", action: "tab", target: "tab-stats" },
    { title: "Go to Features & Traits Tab", tag: "Navigation", action: "tab", target: "tab-traits" },
    { title: "Go to Spells & Grimoire Tab", tag: "Navigation", action: "tab", target: "tab-spells" },
    { title: "Go to Inventory & Vault Tab", tag: "Navigation", action: "tab", target: "tab-inventory" },
    { title: "Go to Companions & Creatures Tab", tag: "Navigation", action: "tab", target: "tab-companions" },
    { title: "Go to Notes & Quests Tab", tag: "Navigation", action: "tab", target: "tab-journal" }
  ];

  // Add all 18 skills
  document.querySelectorAll(".skill-row").forEach((row) => {
    const label = row.querySelector(".skill-label")?.textContent?.trim() || "Skill";
    const val = row.querySelector(".skill-val")?.textContent?.trim() || "+0";
    actions.push({
      title: `Roll ${label} (${val})`,
      tag: "Skill Check",
      action: "roll-skill",
      rowId: row.id
    });
  });

  // Add 6 Saving Throws
  ["str", "dex", "con", "int", "wis", "cha"].forEach((s) => {
    const val = document.getElementById(`save_val_${s}`)?.textContent || "+0";
    actions.push({
      title: `Roll ${s.toUpperCase()} Saving Throw (${val})`,
      tag: "Saving Throw",
      action: "roll-save",
      attr: s
    });
  });

  // Add Character Spells
  myCharacterSpells.forEach((sp) => {
    if (sp && sp.name) {
      actions.push({
        title: `Concentrate / View Spell: ${sp.name}`,
        tag: sp.type || "Spell",
        action: "focus-spell",
        spellName: sp.name
      });
    }
  });

  const filtered = actions.filter((a) => !q || a.title.toLowerCase().includes(q) || a.tag.toLowerCase().includes(q));

  if (filtered.length === 0) {
    container.innerHTML = `<p class="loading-text">No matching commands or rolls found.</p>`;
    return;
  }

  container.innerHTML = filtered.slice(0, 20).map((item, idx) => `
    <div class="spell-option-item cmd-palette-item" data-idx="${idx}"
         data-action="${escapeHtml(item.action)}"
         data-target="${escapeHtml(item.target || "")}"
         data-row-id="${escapeHtml(item.rowId || "")}"
         data-attr="${escapeHtml(item.attr || "")}"
         data-spell-name="${escapeHtml(item.spellName || "")}">
      <div class="spell-option-details">
        <span class="spell-option-title">${escapeHtml(item.title)}</span>
      </div>
      <span class="tag-pill tag-cantrip">${escapeHtml(item.tag)}</span>
    </div>
  `).join("");
}

/* ==========================================================================
   PARTY & DM DASHBOARD (WITH ROOM CREATOR LOCK & PLAYER PRIVACY)
   ========================================================================== */

function getCreatedRooms() {
  try {
    return JSON.parse(localStorage.getItem(CREATED_ROOMS_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function addCreatedRoom(code) {
  if (!code) return;
  const clean = code.trim().toUpperCase();
  const list = getCreatedRooms().filter((r) => r !== clean);
  list.unshift(clean);
  localStorage.setItem(CREATED_ROOMS_KEY, JSON.stringify(list));
}

function isLocalRoomCreator(code) {
  if (!code) return false;
  return getCreatedRooms().includes(code.trim().toUpperCase());
}

function getRecentRooms() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_ROOMS_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function addRecentRoom(code) {
  if (!code) return;
  const clean = code.trim().toUpperCase();
  let list = getRecentRooms().filter((r) => r !== clean);
  list.unshift(clean);
  if (list.length > 6) list = list.slice(0, 6);
  localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(list));
  renderRecentRoomsBar();
}

function renderRecentRoomsBar() {
  const bar = document.getElementById("recentRoomsBar");
  const listEl = document.getElementById("recentRoomsList");
  if (!bar || !listEl) return;

  const rooms = getRecentRooms();
  if (rooms.length === 0) {
    bar.style.display = "none";
    return;
  }

  bar.style.display = "flex";
  listEl.innerHTML = rooms.map((code) => `
    <button type="button" class="recent-room-chip" data-room="${escapeHtml(code)}" title="Click to connect to ${escapeHtml(code)}">
      ${escapeHtml(code)}
    </button>
  `).join("");
}

function copyRoomInviteLink(roomCode) {
  const clean = (roomCode || connectedCampaignRoom || activeDMRoomCode || "").trim().toUpperCase();
  if (!clean || clean === "NONE") return;
  const url = new URL(window.location.href);
  url.searchParams.set("room", clean);
  navigator.clipboard.writeText(url.toString()).then(() => {
    showStatus(`Invite Link Copied for ${clean}!`);
  });
}

function renderLivePartyDock(members) {
  const dock = document.getElementById("livePartyDock");
  const dockCode = document.getElementById("dockRoomCodeText");
  const roleBadge = document.getElementById("dockRoleBadge");
  const dockBody = document.getElementById("livePartyDockBody");
  const lastRollEl = document.getElementById("livePartyLastRollText");

  const activeRoom = connectedCampaignRoom || activeDMRoomCode;
  if (!dock) return;

  if (!activeRoom) {
    dock.style.display = "none";
    return;
  }

  const isCreatorDM = Boolean(activeDMRoomCode && activeDMRoomCode === activeRoom);

  dock.style.display = "flex";
  if (dockCode) dockCode.textContent = activeRoom;
  if (roleBadge) {
    roleBadge.textContent = isCreatorDM ? "DM / Creator" : "Player";
    roleBadge.classList.toggle("is-dm", isCreatorDM);
  }
  if (dockBody) dockBody.style.display = isPartyDockCollapsed ? "none" : "flex";

  if (!Array.isArray(members) || members.length === 0) {
    if (dockBody) {
      dockBody.innerHTML = `<span style="font-size:0.78rem; color:var(--text-dim); font-style:italic;">Waiting for party members to join ${escapeHtml(activeRoom)}...</span>`;
    }
    return;
  }

  let latestRoll = null;
  members.forEach((m) => {
    if (m.lastRoll && m.lastRoll.timestamp) {
      if (!latestRoll || m.lastRoll.timestamp > latestRoll.timestamp) {
        latestRoll = { ...m.lastRoll, charName: m.name || m.lastRoll.charName || "Adventurer" };
      }
    }
  });

  if (lastRollEl) {
    if (latestRoll) {
      lastRollEl.textContent = `${latestRoll.charName}: ${latestRoll.desc} = ${latestRoll.total}`;
    } else {
      lastRollEl.textContent = "No party rolls yet";
    }
  }

  // Strictly render ONLY Name, AC, HP, Conditions, and Concentration in the dock
  if (dockBody) {
    dockBody.innerHTML = members.map((m) => {
      const hp = m.hp || { cur: 10, max: 10, temp: 0 };
      const pct = Math.min(100, Math.max(0, Math.round((hp.cur / (hp.max || 1)) * 100)));
      const conds = (m.conditions || []).join(", ");
      const conc = (m.concentration || "").trim();
      const isDead = hp.cur <= 0;

      return `
        <div class="dock-member-pill ${isDead ? "unconscious" : ""} ${isCreatorDM ? "dm-clickable" : ""}"
             ${isCreatorDM ? `data-member-id="${escapeHtml(m.id || "")}"` : ""}
             title="${isCreatorDM ? "Click to inspect full character sheet (DM Only)" : "Party Member Vitals"}">
          <div class="dock-member-top">
            <span class="dock-member-name">${escapeHtml(m.name || "Unnamed")}</span>
            <span class="dock-member-ac">AC ${m.ac || 10}</span>
          </div>
          <div class="dock-member-hp-row">
            <span>HP: ${hp.cur}/${hp.max}${hp.temp > 0 ? ` (+${hp.temp})` : ""}</span>
            <span>${pct}%</span>
          </div>
          <div class="dm-health-track">
            <div class="dm-health-fill" style="width: ${pct}%;"></div>
          </div>
          ${conds ? `<span class="dock-member-conds">Cond: ${escapeHtml(conds)}</span>` : ""}
          ${conc ? `<span class="dock-member-conc">Conc: ${escapeHtml(conc)}</span>` : ""}
        </div>
      `;
    }).join("");
  }
}

function updatePartyStatusUI() {
  const statusBox = document.getElementById("partyStatusBox");
  const statusText = document.getElementById("partyStatusText");
  const roomInput = document.getElementById("campaignRoomInput");
  const joinBtn = document.getElementById("joinCampaignBtn");
  const copyPlayerCodeBtn = document.getElementById("copyPlayerRoomCodeBtn");
  const copyInviteBtn = document.getElementById("copyInviteLinkBtn");
  const leaveBtn = document.getElementById("leaveCampaignBtn");
  const playerSection = document.getElementById("playerPartySection");
  const headerDot = document.getElementById("headerPartyDot");
  const headerBtnText = document.getElementById("headerPartyBtnText");

  const dot = statusBox?.querySelector(".status-dot");

  renderRecentRoomsBar();

  if (connectedCampaignRoom) {
    if (dot) { dot.classList.remove("disconnected"); dot.classList.add("connected"); }
    if (headerDot) headerDot.classList.add("connected");
    if (headerBtnText) headerBtnText.textContent = `Party: ${connectedCampaignRoom}`;
    if (statusText) statusText.textContent = `Connected to room: ${connectedCampaignRoom}`;
    if (roomInput) roomInput.value = connectedCampaignRoom;
    if (joinBtn) joinBtn.style.display = "none";
    if (copyPlayerCodeBtn) copyPlayerCodeBtn.style.display = "inline-flex";
    if (copyInviteBtn) copyInviteBtn.style.display = "inline-flex";
    if (leaveBtn) leaveBtn.style.display = "inline-flex";
    if (playerSection) playerSection.style.display = "block";
    startPlayerPartyListener();
  } else {
    if (dot) { dot.classList.remove("connected"); dot.classList.add("disconnected"); }
    if (headerDot) headerDot.classList.toggle("connected", !!activeDMRoomCode);
    if (headerBtnText) headerBtnText.textContent = activeDMRoomCode ? `DM: ${activeDMRoomCode}` : "Party";
    if (statusText) statusText.textContent = "Not connected to any campaign room.";
    if (joinBtn) joinBtn.style.display = "inline-flex";
    if (copyPlayerCodeBtn) copyPlayerCodeBtn.style.display = "none";
    if (copyInviteBtn) copyInviteBtn.style.display = "none";
    if (leaveBtn) leaveBtn.style.display = "none";
    if (playerSection) playerSection.style.display = "none";
    if (playerPartyListUnsubscribe) {
      playerPartyListUnsubscribe();
      playerPartyListUnsubscribe = null;
    }
    if (!activeDMRoomCode) renderLivePartyDock([]);
  }

  const dmCodeText = document.getElementById("dmActiveRoomCode");
  const dmInput = document.getElementById("dmRoomCodeInput");
  const copyBtn = document.getElementById("copyRoomCodeBtn");
  const copyDMInviteBtn = document.getElementById("copyDMInviteLinkBtn");
  const closeBtn = document.getElementById("closeCampaignBtn");

  if (activeDMRoomCode) {
    if (dmCodeText) dmCodeText.textContent = activeDMRoomCode;
    if (dmInput) dmInput.value = activeDMRoomCode;
    if (copyBtn) copyBtn.style.display = "inline-flex";
    if (copyDMInviteBtn) copyDMInviteBtn.style.display = "inline-flex";
    if (closeBtn) closeBtn.style.display = "inline-flex";
  } else {
    if (dmCodeText) dmCodeText.textContent = "NONE";
    if (copyBtn) copyBtn.style.display = "none";
    if (copyDMInviteBtn) copyDMInviteBtn.style.display = "none";
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
  addRecentRoom(cleanCode);

  updatePartyStatusUI();

  const roster = getRoster();
  if (roster[activeCharId]) {
    await syncToLiveCampaign(roster[activeCharId]);
  } else {
    saveSheet(true);
  }
  showStatus(`Connected to Room ${cleanCode}!`);
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
      snapshot.forEach((doc) => {
        const data = doc.data();
        members.push(data);

        // Apply remote DM adjustments to our own character if any
        if (data.id === activeCharId && data.dmAdjustedAt && data.dmAdjustedAt > (window._lastAppliedDmAdjust || 0)) {
          window._lastAppliedDmAdjust = data.dmAdjustedAt;
          const curHpEl = document.getElementById("curHp");
          const inspToggle = document.getElementById("heroicInspirationToggle");
          if (curHpEl && data.hp && typeof data.hp.cur === "number") {
            curHpEl.value = data.hp.cur;
          }
          if (inspToggle && typeof data.heroicInspiration === "boolean") {
            inspToggle.checked = data.heroicInspiration;
          }
          updateHealthBars();
          saveSheet(true);
        }
      });

      cachedRoomMembers = members;
      renderLivePartyDock(members);

      if (countEl) countEl.textContent = `${members.length} Active`;
      if (!grid) return;

      if (members.length === 0) {
        grid.innerHTML = `<p class="dm-empty-msg">No adventurers in this party yet.</p>`;
        return;
      }

      // Strictly display ONLY Name, Avatar, HP, AC, Conditions, and Concentration for players
      grid.innerHTML = members.map((m) => {
        const hp = m.hp || { cur: 10, max: 10, temp: 0 };
        const pct = Math.min(100, Math.max(0, Math.round((hp.cur / (hp.max || 1)) * 100)));
        const conds = (m.conditions || []).join(", ") || "None";
        const conc = (m.concentration || "").trim() || "None";
        const isDead = hp.cur <= 0;

        return `
          <div class="player-party-card ${isDead ? "unconscious" : ""}">
            <div class="dm-card-header">
              ${m.avatar ? `<img src="${m.avatar}" class="dm-player-avatar" alt="Avatar" />` : `<div class="dm-avatar-placeholder">&dagger;</div>`}
              <div class="dm-player-info">
                <span class="dm-player-name">${escapeHtml(m.name || "Unnamed")}</span>
              </div>
              <span class="dock-member-ac">AC ${m.ac || 10}</span>
            </div>
            <div class="dm-health-gauge">
              <div class="dm-health-labels">
                <span class="dm-hp-val">HP: ${hp.cur}/${hp.max} ${hp.temp > 0 ? `(+${hp.temp})` : ""}</span>
                <span>${pct}%</span>
              </div>
              <div class="dm-health-track">
                <div class="dm-health-fill" style="width: ${pct}%;"></div>
              </div>
            </div>
            <div style="font-size: 0.72rem; color: #94a3b8;"><strong>Conditions:</strong> ${escapeHtml(conds)}</div>
            <div style="font-size: 0.72rem; color: #d8b4fe;"><strong>Concentration:</strong> ${escapeHtml(conc)}</div>
          </div>
        `;
      }).join("");
    }, (err) => {
      console.warn("Party listener error:", err);
    });
}

async function createNewCampaignRoom() {
  if (!db) {
    alert("Firebase database connection is unavailable.");
    return;
  }
  await ensureAuthenticated();
  const code = "REALM-" + Math.floor(1000 + Math.random() * 9000);
  addCreatedRoom(code);

  try {
    await db.collection("campaigns").doc(code).set({
      creatorUid: auth?.currentUser?.uid || "local",
      createdAt: Date.now()
    }, { merge: true });
  } catch (err) {
    console.warn("Could not write room creator metadata:", err);
  }

  await startDMLiveListener(code, true);
}

async function startDMLiveListener(roomCode, isNewlyCreated = false) {
  if (!db) {
    alert("Firebase database connection is unavailable.");
    return;
  }
  const cleanCode = roomCode.trim().toUpperCase();
  if (!cleanCode) return;

  await ensureAuthenticated();

  // Verify that this user is actually the creator of the room before granting DM access
  if (!isNewlyCreated) {
    let isAuthorized = isLocalRoomCreator(cleanCode);
    try {
      const roomDoc = await db.collection("campaigns").doc(cleanCode).get();
      if (roomDoc.exists && roomDoc.data()?.creatorUid) {
        if (auth?.currentUser?.uid && roomDoc.data().creatorUid === auth.currentUser.uid) {
          isAuthorized = true;
          addCreatedRoom(cleanCode);
        }
      }
    } catch (e) {
      console.warn("Room creator check note:", e);
    }

    if (!isAuthorized) {
      alert("Access Denied: Only the DM who created this room can open the DM Live Dashboard and inspect full player character sheets.");
      return;
    }
  }

  if (dmListenerUnsubscribe) dmListenerUnsubscribe();

  activeDMRoomCode = cleanCode;
  addRecentRoom(activeDMRoomCode);
  updatePartyStatusUI();

  const grid = document.getElementById("dmPartyGrid");
  const countEl = document.getElementById("dmMemberCount");

  dmListenerUnsubscribe = db.collection("campaigns").doc(activeDMRoomCode).collection("members")
    .onSnapshot((snapshot) => {
      cachedRoomMembers = [];
      snapshot.forEach((doc) => cachedRoomMembers.push(doc.data()));
      if (countEl) countEl.textContent = `${cachedRoomMembers.length} Active`;

      renderLivePartyDock(cachedRoomMembers);

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
          <div class="dm-player-card ${isDead ? "unconscious" : ""}" data-member-id="${escapeHtml(m.id)}">
            <div class="dm-card-header">
              ${m.avatar ? `<img src="${m.avatar}" class="dm-player-avatar" alt="Avatar" />` : `<div class="dm-avatar-placeholder">&dagger;</div>`}
              <div class="dm-player-info">
                <span class="dm-player-name">${escapeHtml(m.name || "Unnamed")} ${m.heroicInspiration ? "&#10022;" : ""}</span>
                <span class="dm-player-sub">${escapeHtml(m.charRace || "")} ${escapeHtml(m.charClass || "")} (Lvl ${m.level || 1})</span>
              </div>
            </div>
            <div class="dm-health-gauge">
              <div class="dm-health-labels">
                <span class="dm-hp-val">HP: ${hp.cur} / ${hp.max}</span>
                ${hp.temp > 0 ? `<span class="dm-temp-val">+${hp.temp} Temp</span>` : ""}
              </div>
              <div class="dm-health-track">
                <div class="dm-health-fill" style="width: ${pct}%;"></div>
              </div>
            </div>
            <div class="dm-stats-strip">
              <span class="dm-stat-item">AC: <strong>${m.ac || 10}</strong></span>
              <span class="dm-stat-item">PP: <strong>${m.passivePerception || 10}</strong></span>
              <span class="dm-stat-item">PI: <strong>${m.passiveInsight || 10}</strong></span>
              <span class="dm-stat-item">Spd: <strong>${m.speed || 30}ft</strong></span>
            </div>
            <div class="dm-conditions-list">
              ${(m.conditions || []).map((c) => `<span class="dm-cond-badge">${escapeHtml(c)}</span>`).join("")}
              ${m.concentration ? `<span class="dm-cond-badge" style="background:rgba(192,132,252,0.2);color:#d8b4fe;">Conc: ${escapeHtml(m.concentration)}</span>` : ""}
            </div>
            <div class="dm-quick-actions">
              <button type="button" class="dm-quick-btn dmg" data-dm-act="hp" data-delta="-5" data-member-id="${escapeHtml(m.id)}" title="Deal 5 Damage">-5 HP</button>
              <button type="button" class="dm-quick-btn dmg" data-dm-act="hp" data-delta="-1" data-member-id="${escapeHtml(m.id)}" title="Deal 1 Damage">-1</button>
              <button type="button" class="dm-quick-btn heal" data-dm-act="hp" data-delta="1" data-member-id="${escapeHtml(m.id)}" title="Heal 1 HP">+1</button>
              <button type="button" class="dm-quick-btn heal" data-dm-act="hp" data-delta="5" data-member-id="${escapeHtml(m.id)}" title="Heal 5 HP">+5 HP</button>
              <button type="button" class="dm-quick-btn insp" data-dm-act="inspire" data-member-id="${escapeHtml(m.id)}" title="Toggle Heroic Inspiration">&#10022; Inspire</button>
            </div>
          </div>
        `;
      }).join("");
    }, (err) => {
      console.warn("DM listener error:", err);
    });

  showStatus(`DM Session Active: ${activeDMRoomCode}`);
}

async function dmQuickAdjustPlayer(memberId, actionType, delta = 0) {
  if (!activeDMRoomCode || !db || !memberId) return;
  const member = cachedRoomMembers.find((m) => m.id === memberId);
  if (!member) return;

  try {
    await ensureAuthenticated();
    if (actionType === "hp") {
      const cur = member.hp?.cur ?? 10;
      const max = member.hp?.max ?? 10;
      const temp = member.hp?.temp ?? 0;
      const nextCur = Math.min(max, Math.max(0, cur + delta));
      await db.collection("campaigns").doc(activeDMRoomCode).collection("members").doc(memberId).set({
        hp: { cur: nextCur, max, temp },
        dmAdjustedAt: Date.now()
      }, { merge: true });
      showStatus(`${member.name}: HP → ${nextCur}/${max}`);
    } else if (actionType === "inspire") {
      const nextInsp = !member.heroicInspiration;
      await db.collection("campaigns").doc(activeDMRoomCode).collection("members").doc(memberId).set({
        heroicInspiration: nextInsp,
        dmAdjustedAt: Date.now()
      }, { merge: true });
      showStatus(`${member.name}: ${nextInsp ? "Granted Inspiration!" : "Inspiration Removed"}`);
    }
  } catch (err) {
    console.error("DM quick adjust failed:", err);
  }
}

async function closeDMCampaignRoom() {
  if (dmListenerUnsubscribe) {
    dmListenerUnsubscribe();
    dmListenerUnsubscribe = null;
  }
  activeDMRoomCode = "";
  if (!connectedCampaignRoom) cachedRoomMembers = [];
  updatePartyStatusUI();
  if (connectedCampaignRoom) renderLivePartyDock(cachedRoomMembers);
  const grid = document.getElementById("dmPartyGrid");
  if (grid) grid.innerHTML = `<p class="dm-empty-msg">No DM session active. Click "+ New Room" or reopen a room you created to inspect your players live.</p>`;
  showStatus("DM Session Closed");
}

function openInspectModal(memberId) {
  if (!activeDMRoomCode) return;

  const member = cachedRoomMembers.find((m) => m.id === memberId);
  if (!member) return;
  currentInspectedMemberId = memberId;

  const content = document.getElementById("dmInspectContent");
  const title = document.getElementById("inspectCharTitle");
  if (title) title.textContent = `DM Inspection: ${member.name || "Adventurer"}`;

  const attrs = member.attributes || {};
  const hp = member.hp || { cur: 10, max: 10, temp: 0 };

  if (content) {
    content.innerHTML = `
      <div class="inspect-char-banner">
        ${member.avatar ? `<div class="inspect-avatar-wrap"><img src="${member.avatar}" class="inspect-avatar-img" alt="Avatar" /></div>` : ""}
        <div class="inspect-char-info">
          <span class="inspect-char-name">${escapeHtml(member.name || "Unnamed")}</span>
          <span class="inspect-char-meta-line">${escapeHtml(member.charRace || "")} ${escapeHtml(member.charSubclass || "")} ${escapeHtml(member.charClass || "")} &bull; Level ${member.level || 1} &bull; ${escapeHtml(member.charAlignment || "")}</span>
        </div>
      </div>

      <div class="inspect-vitals-ribbon">
        <div class="inspect-stat-card"><span class="inspect-stat-card-label">Hit Points</span><span class="inspect-stat-card-val">${hp.cur}/${hp.max} ${hp.temp > 0 ? `(+${hp.temp})` : ""}</span></div>
        <div class="inspect-stat-card"><span class="inspect-stat-card-label">Armor Class</span><span class="inspect-stat-card-val">${member.ac || 10}</span></div>
        <div class="inspect-stat-card"><span class="inspect-stat-card-label">Passive Perc</span><span class="inspect-stat-card-val">${member.passivePerception || 10}</span></div>
        <div class="inspect-stat-card"><span class="inspect-stat-card-label">Passive Ins</span><span class="inspect-stat-card-val">${member.passiveInsight || 10}</span></div>
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
                <span class="inspect-attr-mod">${formatSigned(a.mod)}</span>
                <span class="inspect-attr-score">(${a.score})</span>
                <span class="inspect-attr-save">Save: ${formatSigned(a.save)}</span>
              </div>
            `;
          }).join("")}
        </div>
      </div>

      <div class="inspect-section">
        <h4 class="inspect-section-title">Weapons &amp; Attacks</h4>
        <div class="inspect-weapons-list">
          ${(member.weapons || []).filter((w) => w.name).map((w) => `
            <div class="inspect-weapon-row">
              <span class="inspect-wpn-name">${escapeHtml(w.name)}</span>
              <span class="inspect-wpn-type">${escapeHtml(w.atk || "-")}</span>
              <span class="inspect-wpn-dmg">${escapeHtml(w.dmg || "-")}</span>
              <span class="inspect-wpn-notes">${escapeHtml(w.notes || "")}</span>
            </div>
          `).join("") || '<p class="loading-text">No weapons logged.</p>'}
        </div>
      </div>

      <div class="inspect-section">
        <h4 class="inspect-section-title">Abilities &amp; Traits</h4>
        <div class="inspect-grid-blocks">
          ${(member.traits || []).map((t) => `
            <div class="inspect-mini-card">
              <span class="inspect-mini-title">${escapeHtml(t.name)}</span>
              <span class="inspect-mini-tag">${escapeHtml(t.type || "Feature")}</span>
              <p class="inspect-mini-desc">${escapeHtml(t.desc || "")}</p>
            </div>
          `).join("") || '<p class="loading-text">No features listed.</p>'}
        </div>
      </div>
    `;
  }

  document.getElementById("dmInspectModal")?.classList.add("open");
}

async function kickPlayerFromRoom(memberId) {
  if (!activeDMRoomCode || !db || !memberId) return;
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
   HP CALCULATOR, INLINE STEPPERS & REST ACTIONS
   ========================================================================== */

function applyQuickHpStep(delta) {
  const curHpEl = document.getElementById("curHp");
  const maxHpEl = document.getElementById("maxHp");
  const tempHpEl = document.getElementById("tempHp");

  let curHp = parseInt(curHpEl?.value, 10) || 0;
  const maxHp = parseInt(maxHpEl?.value, 10) || 10;
  let tempHp = parseInt(tempHpEl?.value, 10) || 0;

  if (delta < 0) {
    const dmg = Math.abs(delta);
    if (tempHp > 0) {
      if (dmg <= tempHp) tempHp -= dmg;
      else {
        const rem = dmg - tempHp;
        tempHp = 0;
        curHp = Math.max(0, curHp - rem);
      }
    } else {
      curHp = Math.max(0, curHp - dmg);
    }

    const concSpell = document.getElementById("spellConcentration")?.value?.trim();
    if (concSpell) {
      showStatus(`-1 HP! Roll CON Save (DC 10) for ${concSpell}!`);
    }
  } else if (delta > 0) {
    curHp = Math.min(maxHp, curHp + delta);
  }

  if (curHpEl) curHpEl.value = curHp;
  if (tempHpEl) tempHpEl.value = tempHp;
  recalculateAll();
  saveSheet(true);
}

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

    const concSpell = document.getElementById("spellConcentration")?.value?.trim();
    if (concSpell) {
      const dc = Math.max(10, Math.floor(amt / 2));
      showStatus(`Took ${amt} dmg! Roll CON Save (DC ${dc}) for ${concSpell}!`);
    } else {
      showStatus(`Took ${amt} damage!`);
    }
  } else if (type === "heal") {
    curHp = Math.min(maxHp, curHp + amt);
    showStatus(`Healed for ${amt} HP!`);
  } else if (type === "temp") {
    tempHp = Math.max(tempHp, amt);
    showStatus(`Set Temp HP to ${tempHp}!`);
  }

  if (curHpEl) curHpEl.value = curHp;
  if (tempHpEl) tempHpEl.value = tempHp;

  recalculateAll();
  saveSheet(false);
  closeModal("hpModal");
}

function applyShortRest() {
  const curHDEl = document.getElementById("hitDiceCur");
  const curHpEl = document.getElementById("curHp");
  const maxHpEl = document.getElementById("maxHp");
  const dieSides = parseInt(document.getElementById("hitDieSize")?.value, 10) || 8;

  let curHD = parseInt(curHDEl?.value, 10) || 0;
  let curHp = parseInt(curHpEl?.value, 10) || 0;
  const maxHp = parseInt(maxHpEl?.value, 10) || 10;
  const conMod = getModifier(parseInt(document.getElementById("attr_con")?.value, 10) || 10);

  if (curHD <= 0) {
    alert("You have no Hit Dice left to spend during this Short Rest.");
    return;
  }

  const spend = prompt(`Short Rest: You have ${curHD}d${dieSides} Hit Dice available.\nHow many would you like to spend to recover HP?`, "1");
  const count = parseInt(spend, 10);
  if (!count || isNaN(count) || count <= 0) return;

  const toSpend = Math.min(curHD, count);
  let totalHealed = 0;
  for (let i = 0; i < toSpend; i++) {
    const roll = Math.floor(Math.random() * dieSides) + 1;
    totalHealed += Math.max(1, roll + conMod);
  }

  curHD -= toSpend;
  curHp = Math.min(maxHp, curHp + totalHealed);

  if (curHDEl) curHDEl.value = curHD;
  if (curHpEl) curHpEl.value = curHp;

  const pactMax = parseInt(document.getElementById("pactSlotsMax")?.value, 10) || 0;
  const pactCurEl = document.getElementById("pactSlotsCur");
  if (pactCurEl && pactMax > 0) pactCurEl.value = pactMax;

  addDiceHistory(`Short Rest (${toSpend}d${dieSides})`, `+${totalHealed} HP`);
  recalculateAll();
  saveSheet(false);
  showStatus(`Short Rest: Spent ${toSpend}d${dieSides}, healed ${totalHealed} HP!`);
}

function applyLongRest() {
  if (!confirm("Take a Long Rest? This will restore all HP, reset spell slots, restore class points, and recover half your Hit Dice.")) return;

  const maxHp = parseInt(document.getElementById("maxHp")?.value, 10) || 10;
  const curHpEl = document.getElementById("curHp");
  if (curHpEl) curHpEl.value = maxHp;

  const tempHpEl = document.getElementById("tempHp");
  if (tempHpEl) tempHpEl.value = 0;

  const maxHD = parseInt(document.getElementById("hitDiceMax")?.value, 10) || 1;
  const curHDEl = document.getElementById("hitDiceCur");
  if (curHDEl) {
    let curHD = parseInt(curHDEl.value, 10) || 0;
    curHD = Math.min(maxHD, curHD + Math.max(1, Math.floor(maxHD / 2)));
    curHDEl.value = curHD;
  }

  for (let lvl = 1; lvl <= 9; lvl++) {
    const maxVal = parseInt(document.getElementById(`slot${lvl}_max`)?.value, 10) || 0;
    const curEl = document.getElementById(`slot${lvl}_cur`);
    if (curEl) curEl.value = maxVal;
    updateSlotPips(lvl);
  }

  const pactMax = parseInt(document.getElementById("pactSlotsMax")?.value, 10) || 0;
  const pactCurEl = document.getElementById("pactSlotsCur");
  if (pactCurEl) pactCurEl.value = pactMax;

  const dSucc = document.getElementById("deathSucc");
  const dFail = document.getElementById("deathFail");
  if (dSucc) dSucc.value = 0;
  if (dFail) dFail.value = 0;

  const classPtsMax = parseInt(document.getElementById("classPtsMax")?.value, 10) || 0;
  const curClassPts = document.getElementById("classPtsCur");
  if (curClassPts) curClassPts.value = classPtsMax;

  myCustomResources.forEach((r) => {
    if (r.max) r.cur = r.max;
  });
  renderCustomResources();

  const exEl = document.getElementById("exhaustionLevel");
  if (exEl) {
    const curEx = parseInt(exEl.value, 10) || 0;
    if (curEx > 0) exEl.value = curEx - 1;
  }

  recalculateAll();
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
  if (d.race?.fullName) document.getElementById("charRace").value = d.race.fullName;

  if (Array.isArray(d.classes) && d.classes.length > 0) {
    const primary = d.classes[0];
    document.getElementById("charClass").value = primary.definition?.name || "";
    document.getElementById("charSubclass").value = primary.subclassDefinition?.name || "";
    document.getElementById("charLevel").value = primary.level || 1;
  }

  const statMap = ["str", "dex", "con", "int", "wis", "cha"];
  if (Array.isArray(d.stats)) {
    d.stats.forEach((s, idx) => {
      const statCode = statMap[idx];
      const el = document.getElementById(`attr_${statCode}`);
      if (el) el.value = s.value || 10;
    });
  }

  const baseHp = d.baseHitPoints || 10;
  const bonusHp = d.bonusHitPoints || 0;
  const totalMax = baseHp + bonusHp;
  document.getElementById("maxHp").value = totalMax;
  document.getElementById("curHp").value = totalMax - (d.removedHitPoints || 0);

  if (Array.isArray(d.inventory)) {
    myCharacterWeapons = [];
    myStructuredInventory = [];
    const lvl = parseInt(d.classes?.[0]?.level, 10) || 1;
    const prof = getProfBonus(lvl);
    const strVal = d.stats?.[0]?.value || 10;
    const dexVal = d.stats?.[1]?.value || 10;
    const strMod = getModifier(strVal);
    const dexMod = getModifier(dexVal);

    d.inventory.forEach((item) => {
      if (item.definition?.filterType === "Weapon" && item.equipped) {
        const isRanged = item.definition.attackType === 2;
        const hasFinesse = Array.isArray(item.definition.properties) && item.definition.properties.some((p) => (p.name || "").toLowerCase().includes("finesse"));
        const chosenMod = isRanged ? dexMod : (hasFinesse ? Math.max(strMod, dexMod) : strMod);
        const calcAtk = formatSigned(prof + chosenMod);
        const attackCategory = isRanged ? "Ranged" : "Melee";

        myCharacterWeapons.push({
          name: item.definition.name || "Weapon",
          atk: calcAtk,
          dmg: item.definition.damage?.diceString || "1d6",
          notes: `${attackCategory}${item.definition.snippet ? " • " + item.definition.snippet : ""}`
        });
      }
      if (item.definition?.name) {
        myStructuredInventory.push({
          equipped: !!item.equipped,
          name: item.definition.name,
          qty: item.quantity || 1,
          weight: item.definition.weight || 0
        });
      }
    });
  }

  recalculateAll();
  renderWeapons();
  renderStructuredInventory();
  saveSheet(false);
  showStatus("Imported from D&D Beyond!");
}

function importFromGenericOrRoll20(parsed) {
  resetSheet();
  const d = parsed.character || parsed.data || parsed;

  if (d.name) document.getElementById("charName").value = d.name;

  if (Array.isArray(d.attribs)) {
    const getAttr = (name) => d.attribs.find((a) => a.name === name)?.current;
    if (getAttr("class")) document.getElementById("charClass").value = getAttr("class");
    if (getAttr("race")) document.getElementById("charRace").value = getAttr("race");
    if (getAttr("level")) document.getElementById("charLevel").value = parseInt(getAttr("level"), 10) || 1;
    if (getAttr("ac")) document.getElementById("ac").value = parseInt(getAttr("ac"), 10) || 10;
    if (getAttr("hp")) {
      document.getElementById("curHp").value = parseInt(getAttr("hp"), 10) || 10;
      const max = d.attribs.find((a) => a.name === "hp")?.max;
      document.getElementById("maxHp").value = parseInt(max || getAttr("hp"), 10) || 10;
    }
    const statNames = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" };
    Object.keys(statNames).forEach((short) => {
      const v = getAttr(statNames[short]);
      if (v) document.getElementById(`attr_${short}`).value = parseInt(v, 10) || 10;
    });
  } else {
    importFromPconParchment(d);
    return;
  }

  recalculateAll();
  saveSheet(false);
  showStatus("Imported Character JSON!");
}

/* ==========================================================================
   DIRECT MODAL OPEN HANDLERS
   ========================================================================== */

function openPartyModal() {
  updatePartyStatusUI();
  const modal = document.getElementById("partyModal");
  if (modal) {
    modal.classList.add("open");
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

/* ==========================================================================
   MASTER CLICK EVENT DELEGATION
   ========================================================================== */

document.addEventListener("click", async (e) => {
  // 1. MAIN WORKSPACE TABS ROUTING
  const mainTab = e.target.closest(".main-tab");
  if (mainTab && mainTab.dataset.target) {
    e.preventDefault();
    switchMainTab(mainTab.dataset.target);
    return;
  }

  // 2. SUBTABS ROUTING
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

  // 3. TRAIT & SPELL CATEGORY FILTER PILLS
  const catPill = e.target.closest(".cat-pill");
  if (catPill) {
    const bar = catPill.parentElement;
    bar.querySelectorAll(".cat-pill").forEach((p) => p.classList.remove("active"));
    catPill.classList.add("active");

    if (bar.id === "traitCategoryFilterBar") {
      activeTraitCategoryFilter = catPill.dataset.filter || "all";
      renderMyTraits();
    } else if (bar.id === "spellLevelFilterBar") {
      activeSpellLevelFilter = catPill.dataset.lvl || "all";
      renderMySpells();
    }
    return;
  }

  // Proficient-Only Skills Filter Button
  if (e.target.id === "filterProficientSkillsBtn") {
    filterProficientSkillsOnly = !filterProficientSkillsOnly;
    e.target.classList.toggle("active", filterProficientSkillsOnly);
    filterSkillsMatrix();
    return;
  }

  // 4. FOOTER QUICKNAV
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

  // Command Palette Trigger & Items
  if (e.target.id === "commandPaletteBtn" || e.target.closest("#commandPaletteBtn")) {
    e.preventDefault();
    openCommandPalette();
    return;
  }

  const cmdItem = e.target.closest(".cmd-palette-item");
  if (cmdItem) {
    const act = cmdItem.dataset.action;
    closeModal("commandPaletteModal");
    if (act === "tab") switchMainTab(cmdItem.dataset.target);
    else if (act === "set-theme") applyTheme(cmdItem.dataset.target);
    else if (act === "roll-init") document.getElementById("rollInitiativeOrb")?.click();
    else if (act === "roll-death") document.getElementById("rollDeathSaveBtn")?.click();
    else if (act === "short-rest") applyShortRest();
    else if (act === "long-rest") applyLongRest();
    else if (act === "open-hp") document.getElementById("openHpModalBtn")?.click();
    else if (act === "open-party") openPartyModal();
    else if (act === "reset-turn") document.getElementById("resetTurnEconomyBtn")?.click();
    else if (act === "roll-skill") {
      const row = document.getElementById(cmdItem.dataset.rowId);
      row?.querySelector(".roll-btn")?.click();
    } else if (act === "roll-save") {
      document.querySelector(`.roll-btn[data-type="save"][data-attr="${cmdItem.dataset.attr}"]`)?.click();
    } else if (act === "focus-spell") {
      switchMainTab("tab-spells");
      const concEl = document.getElementById("spellConcentration");
      if (concEl) {
        concEl.value = cmdItem.dataset.spellName;
        updateConcentrationBanner();
        renderMySpells();
        saveSheet(false);
        showStatus(`Concentrating on ${cmdItem.dataset.spellName}`);
      }
    }
    return;
  }

  // Global Concentration Clear Button
  if (e.target.id === "clearConcentrationBtn" || e.target.closest("#globalConcentrationBanner")) {
    const concEl = document.getElementById("spellConcentration");
    if (concEl) {
      concEl.value = "";
      updateConcentrationBanner();
      renderMySpells();
      saveSheet(false);
      showStatus("Concentration Ended");
    }
    return;
  }

  // Spell Card Concentration Toggle Button
  const spellConcBtn = e.target.closest(".spell-conc-btn");
  if (spellConcBtn) {
    const sName = spellConcBtn.dataset.spellName || "";
    const concEl = document.getElementById("spellConcentration");
    if (concEl) {
      if (concEl.value.trim().toLowerCase() === sName.toLowerCase()) {
        concEl.value = "";
        showStatus("Concentration Ended");
      } else {
        concEl.value = sName;
        showStatus(`Concentrating on ${sName}!`);
      }
      updateConcentrationBanner();
      renderMySpells();
      saveSheet(false);
    }
    return;
  }

  // Auto-Calculate Spell Save DC & Spell Attack Bonus
  if (e.target.id === "autoCalcSpellStatsBtn") {
    const abilRaw = (document.getElementById("spellAbility")?.value || "int").toLowerCase().trim();
    const statKey = ["str", "dex", "con", "int", "wis", "cha"].find((k) => abilRaw.includes(k)) || "int";
    const score = parseInt(document.getElementById(`attr_${statKey}`)?.value, 10) || 10;
    const mod = getModifier(score);
    const level = parseInt(document.getElementById("charLevel")?.value, 10) || 1;
    const prof = getProfBonus(level);

    const dcEl = document.getElementById("spellDc");
    const atkEl = document.getElementById("spellAtkBonus");
    const abilEl = document.getElementById("spellAbility");
    if (abilEl && !abilEl.value.trim()) abilEl.value = statKey.toUpperCase();
    if (dcEl) dcEl.value = 8 + prof + mod;
    if (atkEl) atkEl.value = formatSigned(prof + mod);
    saveSheet(false);
    showStatus(`Synced Spell Stats from ${statKey.toUpperCase()}!`);
    return;
  }

  // Roll Spell Attack Button
  if (e.target.id === "rollSpellAttackBtn") {
    const bonus = parseInt(document.getElementById("spellAtkBonus")?.value, 10) || 0;
    performD20Roll(bonus, "Spell Attack");
    return;
  }

  // 1-Click Weapon Attack Roll & Damage Roll Buttons
  const wpnAtkBtn = e.target.closest(".wpn-roll-atk-btn");
  if (wpnAtkBtn) {
    const idx = parseInt(wpnAtkBtn.dataset.index, 10);
    const wpn = myCharacterWeapons[idx] || {};
    const name = wpn.name?.trim() || "Weapon";
    const numMatch = String(wpn.atk || "").match(/[+-]?\d+/);
    const bonus = numMatch ? parseInt(numMatch[0], 10) : 0;
    performD20Roll(bonus, `${name} Atk`);
    return;
  }

  const wpnDmgBtn = e.target.closest(".wpn-roll-dmg-btn");
  if (wpnDmgBtn) {
    const idx = parseInt(wpnDmgBtn.dataset.index, 10);
    const wpn = myCharacterWeapons[idx] || {};
    const name = wpn.name?.trim() || "Weapon";
    const rawDmg = (wpn.dmg || "1d6").trim();
    rollCustomFormula(rawDmg, `${name} Dmg`);
    return;
  }

  // TOP BAR COMMAND BUTTONS & LIVE PARTY DOCK ACTIONS
  if (e.target.id === "partyModalBtn" || e.target.closest("#partyModalBtn") || e.target.id === "dockOpenFullPartyBtn") {
    e.preventDefault();
    openPartyModal();
    return;
  }

  if (e.target.id === "dockCopyCodeBtn" || e.target.id === "copyPlayerRoomCodeBtn") {
    const code = connectedCampaignRoom || activeDMRoomCode;
    if (code) {
      navigator.clipboard.writeText(code).then(() => showStatus(`Room Code ${code} Copied!`));
    }
    return;
  }

  if (e.target.id === "dockCopyLinkBtn" || e.target.id === "copyInviteLinkBtn" || e.target.id === "copyDMInviteLinkBtn") {
    copyRoomInviteLink(connectedCampaignRoom || activeDMRoomCode);
    return;
  }

  if (e.target.id === "dockToggleCollapseBtn") {
    isPartyDockCollapsed = !isPartyDockCollapsed;
    e.target.innerHTML = isPartyDockCollapsed ? "&#9660;" : "&#9650;";
    const body = document.getElementById("livePartyDockBody");
    if (body) body.style.display = isPartyDockCollapsed ? "none" : "flex";
    return;
  }

  if (e.target.id === "dockLeaveRoomBtn") {
    if (connectedCampaignRoom) await leaveCampaignRoom();
    if (activeDMRoomCode) await closeDMCampaignRoom();
    return;
  }

  // Dock member pill click: ONLY opens inspect modal if user is the verified DM of the room
  const dockPill = e.target.closest(".dock-member-pill.dm-clickable");
  if (dockPill && activeDMRoomCode) {
    const memberId = dockPill.dataset.memberId;
    if (memberId) openInspectModal(memberId);
    return;
  }

  // Recent Room Chips (1-Click Rejoin)
  const recentChip = e.target.closest(".recent-room-chip");
  if (recentChip && recentChip.dataset.room) {
    const code = recentChip.dataset.room;
    const dmTabActive = document.getElementById("party-dm-view")?.classList.contains("active");
    if (dmTabActive) {
      await startDMLiveListener(code, false);
    } else {
      await joinCampaignRoom(code);
    }
    return;
  }

  // DM Quick-Adjust Buttons on Player Cards
  const dmQuickBtn = e.target.closest(".dm-quick-btn");
  if (dmQuickBtn) {
    e.stopPropagation();
    const memberId = dmQuickBtn.dataset.memberId;
    const act = dmQuickBtn.dataset.dmAct;
    const delta = parseInt(dmQuickBtn.dataset.delta, 10) || 0;
    await dmQuickAdjustPlayer(memberId, act, delta);
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

  if (e.target.id === "printSheetBtn" || e.target.closest("#printSheetBtn")) {
    window.print();
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
      customResources: myCustomResources,
      structuredInventory: myStructuredInventory,
      companions: myCompanions,
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
    const rTxt = document.getElementById("roll20JsonInput");
    if (pTxt) pTxt.value = "";
    if (dTxt) dTxt.value = "";
    if (rTxt) rTxt.value = "";
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
    if (!txt) return alert("Please paste the character JSON or select a file first.");
    try {
      importFromPconParchment(JSON.parse(txt));
      closeModal("importHubModal");
    } catch (err) {
      alert("Invalid JSON format. Please verify the copied text.");
    }
    return;
  }

  if (e.target.id === "parseDnDBeyondBtn") {
    const txt = document.getElementById("dndbeyondJsonInput")?.value.trim();
    if (!txt) return alert("Please paste the D&D Beyond character JSON or select a file first.");
    try {
      importFromDnDBeyond(JSON.parse(txt));
      closeModal("importHubModal");
    } catch (err) {
      alert("Invalid D&D Beyond JSON format. Please verify the copied text.");
    }
    return;
  }

  if (e.target.id === "parseRoll20Btn") {
    const txt = document.getElementById("roll20JsonInput")?.value.trim();
    if (!txt) return alert("Please paste the JSON first.");
    try {
      importFromGenericOrRoll20(JSON.parse(txt));
      closeModal("importHubModal");
    } catch (err) {
      alert("Invalid JSON format.");
    }
    return;
  }

  // Compendium & Custom Additions
  if (e.target.id === "addSpellBtn" || e.target.closest("#addSpellBtn") || e.target.closest(".btn-add-spell")) {
    e.preventDefault();
    openSpellModal();
    return;
  }

  if (e.target.id === "addTraitBtn" || e.target.closest("#addTraitBtn")) {
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
      type: "Class Feature",
      desc: "",
      isExpanded: true
    });
    saveSheet(false);
    renderMyTraits();
    closeModal("traitModal");
    return;
  }

  // Custom Resource Counter Add / Delete
  if (e.target.id === "addCustomResourceBtn") {
    myCustomResources.push({ name: "Counter", cur: 3, max: 3 });
    renderCustomResources();
    saveSheet(false);
    return;
  }
  if (e.target.classList.contains("custom-res-del")) {
    const idx = parseInt(e.target.dataset.index, 10);
    myCustomResources.splice(idx, 1);
    renderCustomResources();
    saveSheet(false);
    return;
  }

  // Structured Inventory Add / Delete
  if (e.target.id === "addInventoryItemBtn") {
    myStructuredInventory.push({ equipped: true, name: "", qty: 1, weight: 1 });
    renderStructuredInventory();
    saveSheet(false);
    return;
  }
  if (e.target.classList.contains("inv-item-delete")) {
    const idx = parseInt(e.target.dataset.index, 10);
    myStructuredInventory.splice(idx, 1);
    renderStructuredInventory();
    saveSheet(false);
    return;
  }

  // Companions Add / Delete
  if (e.target.id === "addCompanionBtn") {
    myCompanions.push({
      name: "New Companion / Creature",
      type: "Beast (CR 1/4)",
      ac: 13,
      hp: "15 / 15",
      speed: "40 ft.",
      notes: "STR 12 (+1) DEX 15 (+2) CON 12 (+1)\nKeen Hearing and Smell. Bite: +4 to hit, 1d6+2 piercing."
    });
    renderCompanions();
    saveSheet(false);
    showStatus("Creature Added!");
    return;
  }
  if (e.target.classList.contains("companion-delete-btn")) {
    const idx = parseInt(e.target.dataset.index, 10);
    myCompanions.splice(idx, 1);
    renderCompanions();
    saveSheet(false);
    return;
  }

  // Turn Economy Reset
  if (e.target.id === "resetTurnEconomyBtn") {
    ["econ_action", "econ_bonus", "econ_reaction", "econ_move"].forEach((id) => {
      const cb = document.getElementById(id);
      if (cb) cb.checked = false;
    });
    saveSheet(true);
    showStatus("New Turn Started!");
    return;
  }

  // Pick Spell from Compendium
  const spellRow = e.target.closest(".spell-pick-row");
  if (spellRow) {
    const name = spellRow.dataset.name;
    const url = spellRow.dataset.url;
    const detail = allSpellsCache.find((s) => s.name.toLowerCase() === name.toLowerCase());

    const newSpell = {
      name: detail?.name || name,
      type: detail?.type || detail?.levelTag || "Cantrip",
      casting_time: detail?.casting_time || "1 Action",
      range: detail?.range || "30 ft",
      duration: detail?.duration || "Instantaneous",
      desc: detail?.desc || ""
    };
    myCharacterSpells.push(newSpell);

    saveSheet(false);
    renderMySpells();
    closeModal("spellModal");
    showStatus(`Added ${name}!`);

    if (url && (!detail || !detail.desc)) {
      fetchAPI("https://www.dnd5eapi.co" + url).then((fetched) => {
        if (fetched && fetched.desc && !newSpell.desc) {
          newSpell.desc = Array.isArray(fetched.desc) ? fetched.desc.join("\n\n") : (fetched.desc || "");
          if (fetched.casting_time) newSpell.casting_time = fetched.casting_time;
          if (fetched.range) newSpell.range = fetched.range;
          if (fetched.duration) newSpell.duration = fetched.duration;
          saveSheet(true);
          renderMySpells();
        }
      }).catch(() => {});
    }
    return;
  }

  // Pick Trait from Compendium
  const traitRow = e.target.closest(".trait-pick-row");
  if (traitRow) {
    const name = traitRow.dataset.name;
    const url = traitRow.dataset.url;
    const detail = allTraitsCache.find((t) => t.name.toLowerCase() === name.toLowerCase());

    const newTrait = {
      name: detail?.name || name,
      type: detail?.type || traitRow.dataset.type || "Feature",
      desc: detail?.desc || "",
      isExpanded: false
    };
    myCharacterTraits.push(newTrait);

    saveSheet(false);
    renderMyTraits();
    closeModal("traitModal");
    showStatus(`Added ${name}!`);

    if (url && (!detail || !detail.desc)) {
      fetchAPI("https://www.dnd5eapi.co" + url).then((fetched) => {
        if (fetched && fetched.desc && !newTrait.desc) {
          newTrait.desc = Array.isArray(fetched.desc) ? fetched.desc.join("\n\n") : (fetched.desc || "");
          saveSheet(true);
          renderMyTraits();
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
      alert("Please enter a room code (e.g. REALM-4200).");
    }
    return;
  }

  if (e.target.id === "leaveCampaignBtn") {
    await leaveCampaignRoom();
    return;
  }

  if (e.target.id === "createCampaignBtn") {
    await createNewCampaignRoom();
    return;
  }

  if (e.target.id === "openDMRoomBtn") {
    const input = document.getElementById("dmRoomCodeInput");
    const codeToOpen = input?.value?.trim();
    if (codeToOpen) {
      await startDMLiveListener(codeToOpen.toUpperCase(), false);
    } else {
      alert("Please enter the room code you created, or click '+ New Room' to start a new DM session.");
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
  if (dmPlayerCard && activeDMRoomCode) {
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

  // Quick Inline HP Steppers (-1 / +1)
  if (e.target.id === "quickHpMinusBtn") {
    applyQuickHpStep(-1);
    return;
  }
  if (e.target.id === "quickHpPlusBtn") {
    applyQuickHpStep(1);
    return;
  }

  // HP Calculator Modal Actions
  if (
    e.target.id === "openHpModalBtn" ||
    e.target.closest("#openHpModalBtn") ||
    e.target.id === "hpTitleClick" ||
    e.target.closest("#hpTitleClick") ||
    e.target.id === "heroHealthStrip" ||
    e.target.closest("#heroHealthStrip") ||
    e.target.classList.contains("hp-corner-btn") ||
    e.target.closest(".hp-corner-btn")
  ) {
    const amtInput = document.getElementById("hpModalAmount");
    if (amtInput) amtInput.value = "";
    document.getElementById("hpModal")?.classList.add("open");
    setTimeout(() => amtInput?.focus(), 50);
    return;
  }

  const hpPresetBtn = e.target.closest(".hp-preset-btn");
  if (hpPresetBtn) {
    const addVal = parseInt(hpPresetBtn.dataset.val, 10) || 0;
    const amtInput = document.getElementById("hpModalAmount");
    if (amtInput) {
      const cur = parseInt(amtInput.value, 10) || 0;
      amtInput.value = cur + addVal;
    }
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
        wrapper.querySelectorAll(".dropdown-menu").forEach((d) => d.classList.remove("open"));
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

  // Conditions Chips & Clear All
  if (e.target.id === "clearConditionsBtn") {
    myActiveConditions = [];
    renderConditionChips();
    saveSheet(false);
    showStatus("All Conditions Cleared");
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

  // Dice Mode Toggle (ADV / NORM / DIS)
  const modeBtn = e.target.closest(".dice-mode-btn");
  if (modeBtn) {
    currentDiceMode = modeBtn.dataset.mode || "norm";
    document.querySelectorAll(".dice-mode-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.mode === currentDiceMode);
    });
    return;
  }

  // Clear Dice History
  if (e.target.id === "clearDiceHistoryBtn") {
    diceRollHistory = [];
    renderDiceHistory();
    return;
  }

  // Roll Custom Formula Button
  if (e.target.id === "rollFormulaBtn") {
    const input = document.getElementById("customDiceFormulaInput");
    if (input && input.value.trim()) {
      rollCustomFormula(input.value.trim());
    }
    return;
  }

  // Roll Initiative Orb
  if (e.target.id === "rollInitiativeOrb" || e.target.closest("#rollInitiativeOrb")) {
    if (e.target.id === "initBonusMod") return;
    const bonus = parseInt(document.getElementById("initiativeDisplay")?.textContent, 10) || 0;
    performD20Roll(bonus, "Initiative");
    return;
  }

  // Roll Death Save Button
  if (e.target.id === "rollDeathSaveBtn") {
    const { chosen } = performD20Roll(0, "Death Save");
    const succEl = document.getElementById("deathSucc");
    const failEl = document.getElementById("deathFail");
    if (chosen === 20) {
      const curHpEl = document.getElementById("curHp");
      if (curHpEl && parseInt(curHpEl.value, 10) <= 0) curHpEl.value = 1;
      if (succEl) succEl.value = 0;
      if (failEl) failEl.value = 0;
      showStatus("NATURAL 20! You regain 1 HP!");
    } else if (chosen === 1) {
      if (failEl) failEl.value = Math.min(3, (parseInt(failEl.value, 10) || 0) + 2);
      showStatus("Natural 1! 2 Death Save Failures!");
    } else if (chosen >= 10) {
      if (succEl) succEl.value = Math.min(3, (parseInt(succEl.value, 10) || 0) + 1);
    } else {
      if (failEl) failEl.value = Math.min(3, (parseInt(failEl.value, 10) || 0) + 1);
    }
    recalculateAll();
    saveSheet(true);
    return;
  }

  // Standard Dice Rack Buttons
  if (e.target.classList.contains("dice-btn")) {
    const sides = parseInt(e.target.dataset.sides, 10);
    if (sides === 20) {
      performD20Roll(0, "1d20");
    } else {
      const roll = Math.floor(Math.random() * sides) + 1;
      updateDiceBadgeDisplay(roll, `1d${sides}`);
      addDiceHistory(`1d${sides}`, roll);
    }
    return;
  }

  // Skill, Save, and Ability Check Roll Buttons
  const rollTrigger = e.target.closest(".roll-btn");
  if (rollTrigger) {
    let bonus = 0;
    let label = "Check";

    if (rollTrigger.dataset.type === "save") {
      const attr = rollTrigger.dataset.attr;
      bonus = parseInt(document.getElementById(`save_val_${attr}`)?.textContent, 10) || 0;
      label = `${attr.toUpperCase()} Save`;
    } else if (rollTrigger.dataset.type === "check") {
      const attr = rollTrigger.dataset.attr;
      bonus = parseInt(document.getElementById(`mod_${attr}`)?.textContent, 10) || 0;
      label = `${attr.toUpperCase()} Check`;
    } else if (rollTrigger.dataset.type === "skill") {
      const row = rollTrigger.closest(".skill-row");
      bonus = parseInt(row?.querySelector(".skill-val")?.textContent, 10) || 0;
      label = row?.querySelector(".skill-label")?.textContent.trim() || "Skill";
    }

    performD20Roll(bonus, label);
    return;
  }

  // Weapons Add / Delete
  if (e.target.id === "addWeaponBtn" || e.target.closest("#addWeaponBtn") || e.target.closest(".btn-add-weapon")) {
    if (!Array.isArray(myCharacterWeapons)) myCharacterWeapons = [];
    myCharacterWeapons.push({ name: "", atk: "", dmg: "", notes: "" });
    saveSheet(false);
    renderWeapons();
    showStatus("Weapon Added!");
    return;
  }

  if (e.target.classList.contains("weapon-delete-btn") && !e.target.classList.contains("inv-item-delete")) {
    const idx = parseInt(e.target.dataset.index, 10);
    myCharacterWeapons.splice(idx, 1);
    while (myCharacterWeapons.length < 2) {
      myCharacterWeapons.push({ name: "", atk: "", dmg: "", notes: "" });
    }
    saveSheet(false);
    renderWeapons();
    return;
  }

  if (e.target.classList.contains("trait-card-delete") && !e.target.classList.contains("companion-delete-btn")) {
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
    btn.innerHTML = `${isExp ? "Collapse" : "Expand"} <span class="trait-expand-icon">&blacktriangledown;</span>`;
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

  if (e.target.closest(".char-item-info") || e.target.classList.contains("char-select-btn")) {
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

/* ==========================================================================
   INPUT, CHANGE & KEYBOARD LISTENERS
   ========================================================================== */

document.getElementById("themeSelect")?.addEventListener("change", (e) => {
  applyTheme(e.target.value);
});

document.getElementById("quickSkillSearch")?.addEventListener("input", () => {
  filterSkillsMatrix();
});

document.getElementById("avatarFileInput")?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    const rawData = evt.target.result;
    const img = new Image();
    img.onload = () => {
      const maxDim = 320;
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      myCharacterAvatar = canvas.toDataURL("image/jpeg", 0.82);
      renderAvatar();
      saveSheet(false);
      showStatus("Avatar Updated!");
    };
    img.onerror = () => {
      myCharacterAvatar = rawData;
      renderAvatar();
      saveSheet(false);
      showStatus("Avatar Updated!");
    };
    img.src = rawData;
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

document.getElementById("commandPaletteInput")?.addEventListener("input", (e) => {
  renderCommandPaletteResults(e.target.value);
});

document.getElementById("filterSpellbookInput")?.addEventListener("input", () => {
  renderMySpells();
});

document.getElementById("filterTraitsInput")?.addEventListener("input", () => {
  renderMyTraits();
});

document.getElementById("customDiceFormulaInput")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    rollCustomFormula(e.target.value.trim());
  }
});

document.getElementById("campaignRoomInput")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("joinCampaignBtn")?.click();
  }
});

document.getElementById("dmRoomCodeInput")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("openDMRoomBtn")?.click();
  }
});

document.getElementById("hpModalAmount")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    applyHpAdjustment("damage");
  }
});

document.addEventListener("change", (e) => {
  if (e.target.type === "checkbox" && e.target.classList.contains("save-field")) {
    recalculateAll();
    saveSheet(false);
  }
  if (e.target.id === "hitDieSize") {
    saveSheet(true);
  }
  if (e.target.classList.contains("inv-item-field") && e.target.type === "checkbox") {
    const row = e.target.closest(".inv-item-row");
    if (row) {
      const idx = parseInt(row.dataset.index, 10);
      if (myStructuredInventory[idx]) {
        myStructuredInventory[idx].equipped = e.target.checked;
        saveSheet(true);
      }
    }
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
        if (e.target.dataset.prop === "name") {
          const concBtn = card.querySelector(".spell-conc-btn");
          if (concBtn) concBtn.dataset.spellName = e.target.value;
        }
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

  if (e.target.classList.contains("custom-res-field")) {
    const card = e.target.closest(".custom-res-card");
    if (card) {
      const idx = parseInt(card.dataset.index, 10);
      if (myCustomResources[idx]) {
        const prop = e.target.dataset.prop;
        myCustomResources[idx][prop] = prop === "name" ? e.target.value : (parseInt(e.target.value, 10) || 0);
        saveSheet(true);
      }
    }
  }

  if (e.target.classList.contains("inv-item-field") && e.target.type !== "checkbox") {
    const row = e.target.closest(".inv-item-row");
    if (row) {
      const idx = parseInt(row.dataset.index, 10);
      if (myStructuredInventory[idx]) {
        const prop = e.target.dataset.prop;
        myStructuredInventory[idx][prop] = prop === "name" ? e.target.value : (parseFloat(e.target.value) || 0);
        updateWealthAndEncumbrance();
        saveSheet(true);
      }
    }
  }

  if (e.target.classList.contains("companion-field")) {
    const card = e.target.closest(".companion-card");
    if (card) {
      const idx = parseInt(card.dataset.index, 10);
      if (myCompanions[idx]) {
        myCompanions[idx][e.target.dataset.prop] = e.target.value;
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
    e.target.classList.contains("wpn-field") ||
    e.target.classList.contains("custom-res-field") ||
    e.target.classList.contains("inv-item-field") ||
    e.target.classList.contains("companion-field")
  ) {
    if (e.target.type !== "checkbox") saveSheet(true);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeAllModals();
    currentInspectedMemberId = null;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    openCommandPalette();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    saveSheet(false);
  }
});

/* ==========================================================================
   FILE RESTORE & IMPORTER LISTENERS
   ========================================================================== */

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

/* ==========================================================================
   INITIALIZATION & URL INVITE LINK CHECK
   ========================================================================== */

detectOSAndSetShortcut();
applyTheme(localStorage.getItem(THEME_STORAGE_KEY) || "theme-nexus");
loadSheet();
loadAllSpells();
loadAllTraits();

// Check if user opened a 1-click ?room=CODE invite link
const urlParams = new URLSearchParams(window.location.search);
const invitedRoom = urlParams.get("room");
if (invitedRoom && invitedRoom.trim()) {
  const cleanInvite = invitedRoom.trim().toUpperCase();
  window.history.replaceState({}, document.title, window.location.pathname);
  joinCampaignRoom(cleanInvite);
} else {
  updatePartyStatusUI();
}
