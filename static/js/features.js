// Genres, optional feature modules, and the schemas behind the generic "codex" modules.
//
// Field types used by codex schemas and character sections:
//   text, textarea (rows), select (options), ref (to: collection key, multi), parent (same collection),
//   table (columns)
// A ref/parent pointing at a feature that is switched off is simply hidden.

export const GENRES = {
  thriller: {
    kind: "fiction",
    label: "Thriller / Crime",
    blurb: "Mysteries, noir, crime and suspense. Track clues, red herrings, suspects and the hidden timeline.",
    icon: "magnifier",
    defaults: ["plot", "locations", "clues", "suspects"],
    roles: ["Protagonist", "Detective", "Antagonist", "Suspect", "Victim", "Witness",
      "Femme / Homme fatale", "Ally", "Informant", "Minor"],
    placeholder: "It was raining. It always is, in this town...",
  },
  fantasy: {
    kind: "fiction",
    label: "Fantasy",
    blurb: "High fantasy and epic worlds. Build maps, magic systems, races, realms, languages and lore.",
    icon: "sparkles",
    defaults: ["plot", "locations", "maps", "magic", "species", "factions", "cultures", "languages", "artifacts", "lore"],
    roles: ["Protagonist", "Hero", "Mentor", "Villain", "Dark lord", "Ally", "Rival",
      "Love interest", "Ruler", "Trickster", "Guardian", "Minor"],
    placeholder: "In the age before the sundering, when the old roads still remembered their names...",
  },
  nonfiction: {
    kind: "nonfiction",
    label: "Non-fiction",
    blurb: "Memoir, biography, history, essays, self-help. Organise chapters, people, sources and research.",
    icon: "notebook",
    defaults: ["plot", "sources"],
    roles: ["Subject", "Author / narrator", "Interviewee", "Expert", "Family", "Friend", "Historical figure", "Minor"],
    placeholder: "Start with the moment that made you want to write this...",
    people: { plural: "People", singular: "person" },
    overview: "Project file",
  },
};

/** Top-level choice in the New project dialog. */
export const KINDS = {
  fiction: { label: "Fiction", blurb: "Novels and stories: plot, characters, worlds and mysteries.", icon: "bookOpen", genres: ["thriller", "fantasy"] },
  nonfiction: { label: "Non-fiction", blurb: "Memoir, biography, history, essays and guides built on real people and sources.", icon: "notebook", genres: ["nonfiction"] },
};

/** What to call the people in this project ("Characters" for fiction, "People" for non-fiction). */
export const peopleLabel = genre => GENRES[genre]?.people || { plural: "Characters", singular: "character" };

export const GROUPS = {
  story: "Story structure",
  thriller: "Thriller & crime",
  fantasy: "Fantasy worldbuilding",
  nonfiction: "Non-fiction",
};

// kind: "view" has a custom page; "codex" uses the generic encyclopedia page with `schema`.
export const FEATURES = [
  { key: "plot", kind: "view", group: "story", label: "Plot & Timeline", icon: "plot",
    desc: "Colour-coded plot arcs and a chronological timeline of what really happened, including off-page events." },
  { key: "locations", kind: "codex", group: "story", label: "Locations", singular: "Location", icon: "mapPin",
    desc: "Places nested inside places, from continents to the back booth of a bar." },

  { key: "clues", kind: "view", group: "thriller", label: "Clues", icon: "magnifier",
    desc: "Track each clue, red herring and twist from planted to revealed to paid off, with continuity warnings." },
  { key: "suspects", kind: "view", group: "thriller", label: "Suspects & Solution", icon: "users",
    desc: "A suspects board (motive, alibi, secret) and a private page for the real solution. Adds case fields to characters." },

  { key: "maps", kind: "view", group: "fantasy", label: "Maps", icon: "map",
    desc: "Upload map images, zoom in and pin locations, realms and landmarks." },
  { key: "magic", kind: "codex", group: "fantasy", label: "Magic Systems", singular: "Magic system", icon: "sparkles",
    desc: "Sources, rules, costs and limits, practitioners, spells and abilities." },
  { key: "species", kind: "codex", group: "fantasy", label: "Races & Creatures", singular: "Race / creature", icon: "paw",
    desc: "Sentient races, beasts, monsters, spirits and gods." },
  { key: "factions", kind: "codex", group: "fantasy", label: "Factions & Realms", singular: "Faction / realm", icon: "flag",
    desc: "Kingdoms, empires, guilds, orders and houses, with leaders, allies and enemies." },
  { key: "cultures", kind: "codex", group: "fantasy", label: "Cultures & Religions", singular: "Culture / religion", icon: "sun",
    desc: "Beliefs, customs, taboos, rituals, gods and festivals." },
  { key: "languages", kind: "codex", group: "fantasy", label: "Languages", singular: "Language", icon: "languages",
    desc: "Constructed languages with a lexicon, grammar notes and sample phrases." },
  { key: "artifacts", kind: "codex", group: "fantasy", label: "Artifacts & Items", singular: "Artifact / item", icon: "sword",
    desc: "Weapons, relics, heirlooms and McGuffins — who holds them and what they do." },
  { key: "sources", kind: "codex", group: "nonfiction", label: "Sources", singular: "Source", icon: "link",
    desc: "Books, articles, interviews and archives you draw on, with citations and key quotes." },
  { key: "lore", kind: "codex", group: "fantasy", label: "Lore & History", singular: "Lore entry", icon: "scroll",
    desc: "Eras, wars, legends, prophecies and creation myths." },
];

// Notes & Research is a core (always-on) codex module.
export const NOTES_FEATURE = {
  key: "notes", kind: "codex", group: "core", label: "Notes & Research", singular: "Note", icon: "notebook",
};

export const featureByKey = key => (key === "notes" ? NOTES_FEATURE : FEATURES.find(f => f.key === key));

const notesField = { key: "notes", label: "Notes", type: "textarea", rows: 4 };

export const SCHEMAS = {
  notes: [
    { key: "type", label: "Type", type: "select", options: ["Note", "Research", "Idea", "Reference", "To-do"] },
    { key: "source", label: "Source / link", type: "text" },
    { key: "body", label: "Content", type: "textarea", rows: 18, wide: true },
  ],
  locations: [
    { key: "type", label: "Type", type: "select", options: ["Continent", "Region", "Kingdom / country", "City", "Town / village",
      "District / neighbourhood", "Building", "Room", "Landmark", "Wilderness", "Crime scene", "Other"] },
    { key: "parentId", label: "Located in", type: "parent" },
    { key: "description", label: "Description", type: "textarea", rows: 4 },
    { key: "atmosphere", label: "Atmosphere (sights, sounds, smells)", type: "textarea", rows: 3 },
    { key: "history", label: "History", type: "textarea", rows: 3 },
    { key: "inhabitants", label: "Notable people", type: "ref", to: "characters", multi: true },
    { key: "factions", label: "Controlled by", type: "ref", to: "factions", multi: true },
    notesField,
  ],
  magic: [
    { key: "type", label: "Type", type: "select", options: ["Hard magic", "Soft magic", "Divine", "Elemental", "Blood / life",
      "Runic / written", "Arcane study", "Innate gift", "Other"] },
    { key: "source", label: "Source of power", type: "textarea", rows: 2 },
    { key: "rules", label: "How it works (rules)", type: "textarea", rows: 4 },
    { key: "cost", label: "Cost & limitations", type: "textarea", rows: 3 },
    { key: "weaknesses", label: "Weaknesses & counters", type: "textarea", rows: 2 },
    { key: "manifestation", label: "How it looks & feels", type: "textarea", rows: 2 },
    { key: "society", label: "How society views it", type: "textarea", rows: 2 },
    { key: "practitioners", label: "Practitioners", type: "ref", to: "characters", multi: true },
    { key: "spells", label: "Spells & abilities", type: "table", columns: ["Name", "Effect", "Cost / limit"] },
    notesField,
  ],
  species: [
    { key: "type", label: "Type", type: "select", options: ["Sentient race", "Creature", "Monster", "Spirit", "Deity", "Undead", "Other"] },
    { key: "appearance", label: "Appearance", type: "textarea", rows: 3 },
    { key: "lifespan", label: "Lifespan", type: "text" },
    { key: "abilities", label: "Abilities & traits", type: "textarea", rows: 3 },
    { key: "society", label: "Society & temperament", type: "textarea", rows: 3 },
    { key: "weaknesses", label: "Weaknesses", type: "textarea", rows: 2 },
    { key: "habitat", label: "Habitat", type: "ref", to: "locations", multi: true },
    notesField,
  ],
  factions: [
    { key: "type", label: "Type", type: "select", options: ["Kingdom", "Empire", "Republic", "Guild", "Order", "Cult",
      "House / dynasty", "Rebellion", "Tribe / clan", "Company", "Other"] },
    { key: "motto", label: "Motto, symbol & colours", type: "text" },
    { key: "goals", label: "Goals", type: "textarea", rows: 3 },
    { key: "power", label: "Power & resources", type: "textarea", rows: 2 },
    { key: "structure", label: "Government / hierarchy", type: "textarea", rows: 2 },
    { key: "history", label: "History", type: "textarea", rows: 3 },
    { key: "leaders", label: "Leaders", type: "ref", to: "characters", multi: true },
    { key: "members", label: "Notable members", type: "ref", to: "characters", multi: true },
    { key: "seat", label: "Seat / territory", type: "ref", to: "locations", multi: true },
    { key: "allies", label: "Allies", type: "ref", to: "factions", multi: true },
    { key: "enemies", label: "Enemies", type: "ref", to: "factions", multi: true },
    notesField,
  ],
  cultures: [
    { key: "type", label: "Type", type: "select", options: ["Culture", "Religion", "Cult", "Philosophy", "Tradition"] },
    { key: "beliefs", label: "Core beliefs", type: "textarea", rows: 3 },
    { key: "deities", label: "Gods, saints & figures", type: "textarea", rows: 2 },
    { key: "values", label: "Values & taboos", type: "textarea", rows: 2 },
    { key: "customs", label: "Customs, rituals & festivals", type: "textarea", rows: 3 },
    { key: "places", label: "Practised in", type: "ref", to: "locations", multi: true },
    { key: "peoples", label: "Followed by", type: "ref", to: "species", multi: true },
    { key: "factions", label: "Associated factions", type: "ref", to: "factions", multi: true },
    notesField,
  ],
  languages: [
    { key: "type", label: "Type", type: "select", options: ["Spoken", "Written only", "Dead / ancient", "Sign", "Secret / code"] },
    { key: "speakers", label: "Spoken by", type: "ref", to: "species", multi: true },
    { key: "regions", label: "Spoken in", type: "ref", to: "locations", multi: true },
    { key: "sound", label: "Sound & phonology", type: "textarea", rows: 2 },
    { key: "grammar", label: "Grammar notes", type: "textarea", rows: 3 },
    { key: "script", label: "Writing system", type: "textarea", rows: 2 },
    { key: "lexicon", label: "Lexicon", type: "table", columns: ["Word", "Meaning", "Notes"] },
    { key: "phrases", label: "Sample phrases", type: "textarea", rows: 3 },
    notesField,
  ],
  artifacts: [
    { key: "type", label: "Type", type: "select", options: ["Weapon", "Armour", "Relic", "Jewellery", "Tool", "Book / scroll",
      "Treasure", "Key item", "Evidence", "Other"] },
    { key: "appearance", label: "Appearance", type: "textarea", rows: 2 },
    { key: "powers", label: "Powers & properties", type: "textarea", rows: 3 },
    { key: "origin", label: "Origin & history", type: "textarea", rows: 3 },
    { key: "owner", label: "Held by", type: "ref", to: "characters", multi: true },
    { key: "location", label: "Kept at", type: "ref", to: "locations", multi: true },
    notesField,
  ],
  sources: [
    { key: "type", label: "Type", type: "select", options: ["Book", "Article", "Website", "Interview", "Archive / document", "Video / podcast", "Personal record", "Other"] },
    { key: "author", label: "Author / speaker", type: "text" },
    { key: "year", label: "Date / year", type: "text" },
    { key: "publisher", label: "Publisher, outlet or link", type: "text" },
    { key: "citation", label: "Full citation", type: "textarea", rows: 2, wide: true },
    { key: "quotes", label: "Key quotes & facts", type: "table", columns: ["Quote / fact", "Page / timestamp", "Use in"] },
    { key: "summary", label: "Summary", type: "textarea", rows: 3 },
    { key: "reliability", label: "Reliability & caveats", type: "textarea", rows: 3 },
    { key: "people", label: "People mentioned", type: "ref", to: "characters", multi: true },
    notesField,
  ],
  lore: [
    { key: "type", label: "Type", type: "select", options: ["Era / age", "Historical event", "War", "Legend", "Myth",
      "Prophecy", "Cosmology", "Other"] },
    { key: "when", label: "When", type: "text" },
    { key: "summary", label: "Summary", type: "textarea", rows: 3 },
    { key: "details", label: "The full story", type: "textarea", rows: 6 },
    { key: "truth", label: "The truth (what really happened)", type: "textarea", rows: 3 },
    { key: "people", label: "Figures involved", type: "ref", to: "characters", multi: true },
    { key: "places", label: "Places", type: "ref", to: "locations", multi: true },
    { key: "factions", label: "Factions", type: "ref", to: "factions", multi: true },
    notesField,
  ],
};

// Character sheet sections. `feature` = only shown when that feature is enabled.
export const CHARACTER_SECTIONS = [
  { title: "", fields: [
    { key: "age", label: "Age", type: "text" },
    { key: "occupation", label: "Occupation / title", type: "text" },
  ] },
  { title: "Surface", fields: [
    { key: "appearance", label: "Appearance", type: "textarea", rows: 3 },
    { key: "voice", label: "Voice & mannerisms", type: "textarea", rows: 3 },
  ] },
  { title: "Inner life", fields: [
    { key: "wants", label: "Wants", type: "textarea", rows: 2 },
    { key: "fears", label: "Fears", type: "textarea", rows: 2 },
    { key: "flaw", label: "Flaw", type: "textarea", rows: 2 },
    { key: "arc", label: "Character arc", type: "textarea", rows: 2 },
  ] },
  { title: "The case", feature: "suspects", fields: [
    { key: "motive", label: "Motive", type: "textarea", rows: 3 },
    { key: "alibi", label: "Alibi", type: "textarea", rows: 3 },
    { key: "secret", label: "Secret (what they're hiding)", type: "textarea", rows: 2, wide: true },
  ] },
  { title: "Origins & allegiances", fields: [
    { key: "species", label: "Race / species", type: "ref", to: "species", multi: true },
    { key: "homeland", label: "Homeland", type: "ref", to: "locations", multi: true },
    { key: "factions", label: "Allegiances", type: "ref", to: "factions", multi: true },
    { key: "magic", label: "Magic", type: "ref", to: "magic", multi: true },
    { key: "abilities", label: "Abilities & skills", type: "textarea", rows: 2, feature: "magic" },
  ] },
  { title: "", fields: [
    { key: "backstory", label: "Backstory", type: "textarea", rows: 6, wide: true },
    { key: "notes", label: "Notes", type: "textarea", rows: 4, wide: true },
  ] },
];

export const allCharacterFields = () => CHARACTER_SECTIONS.flatMap(s => s.fields);
