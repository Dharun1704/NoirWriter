// Style check: finds adverbs, words repeated close together and very long sentences, and returns
// them as live Ranges so the editor can mark them with CSS highlights (the text is never changed).

import { $$ } from "../../ui.js";

const STYLE_STOP = new Set(("about above after again against also always another around because been before being below between both " +
  "came come could does doing down during each even ever every from further have having here herself himself into itself just know " +
  "like little made make many more most much must myself never only other over said same says should since some something still such " +
  "than that their theirs them themselves then there these they thing things this those through under until very want were what when " +
  "where which while whom will with would your yours yourself back could didn doesn wasn weren don't didn't can't won't it's that's " +
  "there's i'm you're he's she's we're they're i've i'll i'd").split(" "));
const NOT_ADVERBS = /^(only|family|early|reply|holy|ugly|belly|bully|rally|silly|lily|jelly|supply|apply|daily|likely|lonely|friendly|lovely|ally|rely|imply|multiply|comply|curly|holly|melancholy|assembly|anomaly|monopoly|italy|july|elderly|costly|deadly|ghostly|godly|homely|kindly|lively|manly|orderly|smelly|wobbly|woolly|chilly|hilly|jolly|oily|wily|sly|fly|reply|butterfly|dragonfly)$/i;
const LONG_SENTENCE = 35;      // words
const REPEAT_WINDOW = 40;      // content words: a repeat closer than this is flagged

/** Find adverbs, close repeats and long sentences in the editor; returns live Ranges. */
export function analyseStyle(root, names = new Set()) {
  const adverbs = [], repeats = [], longs = [];
  const recent = [];
  const repeated = new Set();
  const blocks = $$("p, h1, h2, h3, li, pre", root);
  for (const block of (blocks.length ? blocks : [root])) {
    const nodes = [];
    let text = "";
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) { nodes.push({ n, start: text.length }); text += n.textContent; }
    if (!text.trim()) continue;
    const loc = i => {
      for (let k = nodes.length - 1; k >= 0; k--) if (nodes[k].start <= i) return [nodes[k].n, Math.min(i - nodes[k].start, nodes[k].n.length)];
      return [nodes[0].n, 0];
    };
    const range = (a, b) => { const r = document.createRange(); r.setStart(...loc(a)); r.setEnd(...loc(b)); return r; };
    for (const m of text.matchAll(/[\p{L}'’]+/gu)) {
      const lw = m[0].toLowerCase().replace(/’/g, "'");
      if (lw.length > 4 && lw.endsWith("ly") && !NOT_ADVERBS.test(lw)) adverbs.push(range(m.index, m.index + m[0].length));
      if (lw.length >= 4 && !STYLE_STOP.has(lw) && !names.has(lw)) {
        const r = range(m.index, m.index + m[0].length);
        const hit = recent.find(x => x.w === lw);
        if (hit) {
          if (!hit.marked) { repeats.push(hit.r); hit.marked = true; }
          repeats.push(r);
          repeated.add(lw);
        }
        recent.push({ w: lw, r, marked: !!hit });
        if (recent.length > REPEAT_WINDOW) recent.shift();
      }
    }
    for (const m of text.matchAll(/[^.!?…]+[.!?…]*["”’)]*/g)) {
      const count = (m[0].match(/[\p{L}\p{N}'’-]+/gu) || []).length;
      if (count > LONG_SENTENCE) longs.push(range(m.index, m.index + m[0].length));
    }
  }
  return { adverbs, repeats, longs, repeatWords: repeated.size };
}
