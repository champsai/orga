// Creative read of a launch brief (artist debut, brand launch): what a creative director would
// pull out of the client's words before anyone books a vendor.
//   themes   the client's phrases → what ORCA reads into them (DNA extraction)
//   core / experience / musts   the Event DNA
//   ideas    suggestions the client may not have thought of, each tied to a service
//   budget   a split of the client's budget that protects the hero moment
// Rule-based and deterministic, so the demo works without an API key.

const T = (re, show = null) => ({ re, show });
const THEMES = [
  { key: "visual", label: "VISUAL IDENTITY", min: 2,
    triggers: [T(/แฟชั่นสูง|ไฮแฟชั่น|high.?fashion/i), T(/ลึกลับ|mysterious/i), T(/futuristic|ล้ำสมัย/i)],
    en: "Modern, editorial, futuristic aesthetic", th: "ภาพลักษณ์โมเดิร์น ล้ำสมัย มีความแฟชั่นและน่าค้นหา" },
  { key: "balance", label: "BRAND BALANCE", min: 1,
    triggers: [T(/ไม่อยากให้?(?:ดู)?(?:เป็น)?ไซไฟ\S*|not too sci.?fi[^.,]*/i)],
    en: "Futuristic but approachable", th: "ล้ำสมัยแต่ไม่เย็นชา ไม่ซับซ้อนจนคนดูรู้สึกห่างเหิน" },
  { key: "experience", label: "EXPERIENCE", min: 1,
    triggers: [T(/พาคน\S*โลกของ ?[A-Za-z0-9]+|โลกของ ?[A-Za-z0-9]+|immersive[^.,]*/i)],
    en: "Immersive artist universe", th: "ออกแบบงานให้เหมือนพาผู้ร่วมงานเข้าไปอยู่ในโลกของศิลปิน" },
  { key: "hero", label: "HERO MOMENT", min: 1,
    triggers: [T(/มีช่วงเปิดตัวที่ว้าว|\S*ว้าว|big reveal|wow moment/i), T(/มีโชว์\S*|memorable show/i)],
    en: "High-impact reveal and performance", th: "ต้องมีช่วงเปิดตัวและการแสดงที่เป็นภาพจำหลักของงาน" },
  { key: "fan", label: "FAN ENGAGEMENT", min: 1,
    triggers: [T(/มีส่วนร่วม|interactive/i), T(/ถ่ายรูปแชร์\S*|แชร์ลงโซเชียล|share (?:it )?on social/i)],
    en: "Interactive and shareable moments", th: "มีกิจกรรมให้แฟนคลับมีส่วนร่วมและสร้างคอนเทนต์ต่อได้" },
  { key: "budget", label: "BUDGET PHILOSOPHY", min: 2,
    triggers: [T(/ดูแพง|premium/i), T(/มีรสนิยม|tasteful/i), T(/ไม่(?:จำเป็น)?ต้อง(?:ใหญ่|อลังการ)\S*|not the biggest/i, "ไม่ต้องใหญ่ที่สุด")],
    en: "Premium impact, not maximum scale", th: "ลงทุนกับจุดที่สร้างความรู้สึกพรีเมียมและภาพจำ มากกว่าความอลังการโดยรวม" },
];

const CORE = [
  [/futur|ล้ำสมัย/i, "Futuristic"], [/แฟชั่นสูง|ไฮแฟชั่น|high.?fashion/i, "High Fashion"],
  [/ลึกลับ|mysterious/i, "Mysterious"], [/ดูแพง|premium|มีรสนิยม/i, "Premium"],
  [/minimal|มินิมอล/i, "Minimal"], [/elegan|หรูหรา/i, "Elegant"],
];
const EXPERIENCE = [
  [/โลกของ|immersive/i, "Immersive"], [/ว้าว|reveal/i, "Dramatic Reveal"],
  [/โชว์|performance|\bshow\b/i, "Memorable Performance"], [/แชร์|โซเชียล|social|share/i, "Social Sharing"],
];

// a launch spends on the stage and the show, not on the room
const SPLIT = [
  ["venue", 0.15, "สถานที่", "Venue"],
  ["av", 0.3125, "เวที แสง สี เสียง และจอ", "Stage, light, sound & screens"],
  ["decor", 0.15, "ฉากและ Installation", "Set & installation"],
  ["entertainment", 0.1875, "ศิลปินและการแสดง", "Artist & performance"],
  ["catering", 0.09375, "อาหารและเครื่องดื่ม", "Food & drinks"],
  ["photography", 0.05625, "ภาพถ่าย วิดีโอ และกิจกรรมแฟนคลับ", "Photo, video & fan activities"],
];
export const RESERVE = { th: "เงินสำรอง", en: "Contingency" };
export const HERO_CATS = ["av", "entertainment"]; // never trimmed to save money

// what each partner does in the set, and why it fits the concept
const ROLES = (name) => ({
  venue: { role: "Venue Partner", catEn: "Venue", catTh: "สถานที่", th: "เหมาะกับคอนเซปต์ Black Box และควบคุมบรรยากาศของงานได้", en: "Fits the black-box concept and keeps full control of the mood" },
  av: { role: "Production Partner", catEn: "Stage & AV", catTh: "เวทีและแสงเสียง", th: "รองรับ Hero Moment และสร้างความต่อเนื่องของภาพ แสง และเสียง", en: "Carries the hero moment: screen, light and sound as one" },
  decor: { role: "Creative Partner", catEn: "Set & Installation", catTh: "ฉากและ Installation", th: `ช่วยสร้างโลกของ ${name} โดยใช้ชิ้นงานที่เป็นจุดเด่น แทนการตกแต่งเต็มพื้นที่`, en: `Builds ${name}'s world with a few strong pieces instead of decorating everything` },
  catering: { role: "Catering Partner", catEn: "Food & Beverage", catTh: "อาหารและเครื่องดื่ม", th: "ช่วยให้ผู้ร่วมงานเคลื่อนไหวและพูดคุยได้ โดยไม่รบกวนช่วงการแสดง", en: "Keeps guests moving and talking without interrupting the show" },
  entertainment: { role: "Show Partner", catEn: "Show & Performance", catTh: "โชว์และการแสดง", th: "วางช่วงเปิดตัวและโชว์แรกให้เป็นภาพจำ", en: "Stages the reveal and the first performance" },
  photography: { role: "Content Partner", catEn: "Photo, Video & Fan content", catTh: "ภาพ วิดีโอ และคอนเทนต์", th: "เก็บภาพและคลิปให้แฟน ๆ แชร์ต่อได้ในคืนงาน", en: "Photos and reels fans can share the same night" },
});
export const ROLE_ORDER = ["venue", "av", "decor", "catering", "entertainment", "photography"];

const tidy = (s) => s.replace(/^(อยากให้|อยากได้|แต่|และ|ก็)+/, "").replace(/(ค่ะ|ครับ|นะ)+$/, "").trim();
const andTh = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} และ ${xs.at(-1)}` : xs[0] || "");
const andEn = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0] || "");
const round5k = (n) => Math.round(n / 5000) * 5000;

export function isLaunch(text, eventType) {
  return eventType === "launch" || /เปิดตัว|debut|launch/i.test(text);
}

export function creativeRead(text, dna) {
  if (!isLaunch(text, dna.eventType)) return null;
  const spans = [];
  const themes = [];
  for (const t of THEMES) {
    const quotes = [];
    for (const tr of t.triggers) {
      const m = text.match(tr.re);
      if (!m) continue;
      spans.push([m.index, m.index + m[0].length]);
      quotes.push(tr.show || tidy(m[0]));
    }
    if (quotes.length >= t.min) themes.push({ key: t.key, label: t.label, quotes, en: t.en, th: t.th });
  }
  if (themes.length < 3) return null; // not enough to read creatively: the normal reply is better
  const has = (k) => themes.some((t) => t.key === k);

  const name = (text.match(/ชื่อ\s*([A-Z][A-Z0-9-]{1,})/) || text.match(/\b(?!(?:[TKJ]-?POP)\b)([A-Z]{3,})\b/) || [])[1] || null;
  const genre = (text.match(/\b([TKJ])-?POP\b/i) || [])[0]?.toUpperCase().replace(/^([TKJ])-?/, "$1-") || null;
  const artist = /ศิลปิน|artist|debut/i.test(text);
  const type = artist
    ? { en: `${genre ? `${genre} ` : ""}Artist Debut`, th: `เปิดตัวศิลปิน${genre ? ` ${genre}` : ""}` }
    : { en: "Brand Launch", th: "งานเปิดตัว" };
  const who = name || (artist ? "the artist" : "the brand");
  const whoTh = name || (artist ? "ศิลปิน" : "แบรนด์");

  const core = CORE.filter(([re]) => re.test(text)).map(([, w]) => w).slice(0, 4);
  const experience = EXPERIENCE.filter(([re]) => re.test(text)).map(([, w]) => w);
  const musts = [
    has("hero") && { th: "ต้องมีช่วงเปิดตัวที่น่าจดจำ", en: "A reveal people remember" },
    has("fan") && { th: "ต้องมีพื้นที่ให้แฟนคลับมีส่วนร่วม", en: "Room for fans to take part" },
    has("budget") && { th: "ภาพรวมดูพรีเมียมโดยไม่ใช้งบเกินจำเป็น", en: "Premium overall without overspending" },
    /ภาพจำ|รู้ทันทีว่า|ตัวตน|signature|recogni/i.test(text) && { th: `งานต้องสะท้อนตัวตนของ ${whoTh} อย่างชัดเจน`, en: `Unmistakably ${who}` },
  ].filter(Boolean);

  const futuristic = core.includes("Futuristic");
  const palette = futuristic ? { th: "โทนสีเงิน ดำ และแสงสะท้อน", en: "silver, black and reflected light" } : { th: "สีและแสงที่เป็นเอกลักษณ์ของศิลปิน", en: "the artist's own colours and light" };
  const fits = [...core.filter((w) => w !== "Premium" && w !== "Mysterious").slice(0, 2), ...(has("experience") ? ["Immersive"] : [])];
  const fewActivities = /ไม่อยากให้กิจกรรมเยอะ|not too many activities/i.test(text);
  const guests = dna.basics?.guests;
  const ideas = [
    has("experience") && {
      category: "decor", kicker: "CONCEPT", title: `ENTER THE ${(name || "ARTIST").toUpperCase()} UNIVERSE`,
      th: `เปลี่ยนงานเปิดตัวจากเวทีแถลงข่าวทั่วไป ให้เป็นการเดินทางเข้าสู่โลกของ${artist ? "ศิลปิน" : "แบรนด์"} โดยใช้${palette.th}เป็นองค์ประกอบหลัก`,
      en: `Turn the launch from a press stage into a journey into ${who}'s world, built on ${palette.en}.`,
      whyLabel: ["เหตุผล", "Why"], whyTh: `ตอบโจทย์ ${andTh(fits)} โดยไม่ต้องสร้างฉากขนาดใหญ่ทั้งงาน`, whyEn: `Answers ${andEn(fits)} without building a huge set everywhere`,
    },
    (has("hero") || /โปรดักชัน|production/i.test(text)) && {
      category: "venue", kicker: "VENUE", title: "BLACK-BOX EVENT SPACE",
      th: "แนะนำพื้นที่จัดงานแบบ Black Box หรือสตูดิโออีเวนต์ที่ควบคุมแสงได้ แทนห้องบอลรูมแบบดั้งเดิม เพื่อให้ช่วงเปิดตัวและแสงบนเวทีโดดเด่น",
      en: "A black-box or event studio with full light control instead of a classic ballroom, so the reveal and the stage light stand out.",
      whyLabel: ["เกณฑ์คัดเลือก", "Criteria"],
      whyTh: `รองรับ ${guests || "จำนวนแขกที่ต้องการ"} คน มีพื้นที่เวที ระบบไฟฟ้าและเสียงเหมาะสม${/เดินทางสะดวก/.test(text) ? " เดินทางสะดวก" : ""} และอยู่ในงบ`,
      whyEn: `Fits ${guests || "the"} guests, has a stage, power and sound for production${/เดินทางสะดวก|easy to get/i.test(text) ? ", easy to reach" : ""} and stays in budget`,
    },
    has("fan") && {
      category: "decor", kicker: "FAN EXPERIENCE", title: `THE ${(name || "FAN").toUpperCase()} PORTAL`,
      th: `สร้างจุดถ่ายภาพหรือ Interactive Installation ที่ใช้แสงและพื้นผิวสะท้อน ให้แฟนคลับรู้สึกเหมือนกำลังเข้าสู่โลกของ ${whoTh} และได้ภาพที่นำไปแชร์ต่อได้`,
      en: `A photo spot / interactive installation of light and reflective surfaces: fans feel they're stepping into ${who}'s world and leave with a shareable shot.`,
      whyLabel: ["เหตุผล", "Why"], whyTh: `ตอบโจทย์การมีส่วนร่วมและ Social Sharing${fewActivities ? " โดยไม่ต้องเพิ่มกิจกรรมหลายจุดจนงานเสียจังหวะ" : ""}`,
      whyEn: `Covers fan participation and social sharing${fewActivities ? " without adding activities that break the flow" : ""}`,
    },
    has("hero") && {
      category: "av", kicker: "HERO MOMENT", title: "THE REVEAL",
      th: "ให้การเปิดตัวเป็นช่วงไฮไลต์ที่เชื่อมภาพบนจอ แสง เสียง และการปรากฏตัวของศิลปินเข้าด้วยกัน เพื่อสร้างภาพจำที่ชัดเจนกว่าการเปิดตัวด้วยการพูดบนเวทีเพียงอย่างเดียว",
      en: "Make the reveal the highlight: screen, light, sound and the artist's entrance as one moment, far stronger than a speech on stage.",
      whyLabel: ["เหตุผล", "Why"], whyTh: "ใช้งบกับช่วงเวลาที่มีผลต่อความรู้สึกและภาพจำของผู้ชมมากที่สุด", whyEn: "Spends where it moves people and sticks in memory most",
    },
  ].filter(Boolean);

  const budget = dna.basics?.budget;
  const shares = Object.fromEntries(SPLIT.map(([k, s]) => [k, s]));
  const plan = budget ? SPLIT.map(([category, share, th, en]) => ({ category, th, en, amount: round5k(budget * share), hero: HERO_CATS.includes(category) })) : [];
  if (budget) plan.push({ category: "reserve", ...RESERVE, amount: budget - plan.reduce((t, r) => t + r.amount, 0) });

  // what to book, in the words the matcher understands
  const requirements = [
    { category: "venue", text: "Black-box event space with production power" },
    { category: "av", text: "Stage, LED, sound and show lighting (the reveal)" },
    { category: "decor", text: "Hero set + photo portal installation" },
    { category: "entertainment", text: "Show direction + performance" },
    { category: "catering", text: "Standing canapés + drinks" },
    { category: "photography", text: "Photo, video + fan content" },
  ].map((r) => ({ ...r, kind: "requirement", source: "interpreted", quote: null }));

  return {
    name, type, themes, core, experience, musts, ideas, shares, budget: plan,
    roles: ROLES(name || (artist ? "the artist" : "the brand")), spans, requirements,
    styleTags: { look: ["futuristic", "high fashion", "black box", "installation"], feel: ["immersive", "dramatic", "performance", "social"] },
  };
}
