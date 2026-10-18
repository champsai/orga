// Writes public/vendors/PROMPTS.md: one image prompt per portfolio photo for every demo vendor,
// ready to paste into ChatGPT or Gemini. `node scripts/vendor-prompts.js`
import fs from "node:fs";
import { buildSeed } from "../lib/seed.js";

const SUBJECT = {
  venue: "the event venue itself, wide shot showing the space set up for an event",
  catering: "food and drink styling at an event, close to medium shot",
  entertainment: "live performance at an event, performers and audience",
  decor: "event decor and floral design, styled details",
  photography: "a candid event photo in this photographer's signature style",
  experience: "a guest experience station at an event, guests enjoying it",
  av: "event stage production: sound, lighting and LED screens in action",
  transport: "event guest transport: vehicles and pick-up, clean and professional",
};
const STYLE = "Editorial event photography, realistic, Thailand setting, warm natural light, shallow depth of field, no text, no logos, no watermark, landscape 16:10.";

const { vendors } = buildSeed();
let md = `# Vendor photos: prompts for ChatGPT or Gemini

Every shop shows three portfolio photos. Generate them, save into this folder with the file name in the
table (e.g. \`v_glasshouse-1.jpg\`), and refresh. The site swaps the mood-board tile for the photo within
a few seconds; no restart needed. Start with \`-1\` (the cover) for each shop; \`-2\` and \`-3\` are optional.

Add this style line to every prompt so the set looks consistent:

> ${STYLE}

`;
for (const v of vendors) {
  const style = [...(v.dna?.mood || []), ...(v.dna?.look || [])].slice(0, 5).join(", ");
  md += `## ${v.shopName} (${v.category}, ${v.area || v.location})\n\n${v.description}\n\n| File | Prompt |\n|---|---|\n`;
  v.portfolio.forEach((p, i) => {
    md += `| \`${v.id}-${i + 1}.jpg\` | “${p.title}”: ${SUBJECT[v.category] || "an event"} for ${v.shopName}. ${v.description} Mood and look: ${style}. |\n`;
  });
  md += "\n";
}
fs.writeFileSync("public/vendors/PROMPTS.md", md);
console.log(`Wrote prompts for ${vendors.length} vendors (${vendors.reduce((n, v) => n + v.portfolio.length, 0)} photos).`);
