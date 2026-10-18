// Extra slots within one service: the client keeps their main photographer and adds a second one
// for a specific job ("ช่างภาพ behind the scene เพิ่ม"). A slot key is "<category>+<job>";
// the plain category key is the main slot. Orders, proposals and selections are keyed by slot.

export const SLOTS = {
  "photography+booth": {
    th: "ช่างภาพโฟโต้บูธ", en: "Photobooth photographer",
    re: /photo ?booth|โฟโต้บูธ|โฟโต้บูท|ซุ้มถ่ายรูป|instant print|ปริ้นต์รูป|ปรินท์รูป/i,
    prefer: ["photobooth", "photo booth", "instant prints", "flash", "interactive"],
    reqEn: "Photobooth photographer (instant prints)", reqTh: "ช่างภาพโฟโต้บูธ ปริ้นต์รูปให้แขก",
    whyTh: "ถนัดถ่ายแบบโฟโต้บูธ ปริ้นต์รูปให้แขกทันที", whyEn: "Photobooth style with instant prints",
  },
  "photography+bts": {
    th: "ช่างภาพเบื้องหลัง (BTS)", en: "Behind-the-scenes photographer",
    re: /behind.?the.?scenes?|\bbts\b|เบื้องหลัง|ทีเผลอ|เผลอ|atmosphere|บรรยากาศ|candid|แคนดิด|ไม่จัดท่า|สารคดี|documentary/i,
    prefer: ["behind the scenes", "bts", "unposed", "atmosphere", "documentary", "candid", "film tones"],
    reqEn: "Behind-the-scenes photographer (unposed, atmosphere)", reqTh: "ช่างภาพเบื้องหลัง ถ่ายทีเผลอ เก็บบรรยากาศจริง",
    whyTh: "ถนัดถ่ายเบื้องหลังและทีเผลอ เก็บบรรยากาศจริงโดยไม่ต้องจัดท่า", whyEn: "Shoots behind the scenes and off-guard moments, no posing",
  },
  "photography+portrait": {
    th: "ช่างภาพบุคคล", en: "Portrait photographer",
    re: /portrait|ถ่ายคน|ถ่ายบุคคล|พอร์ตเทรต|พอทเทรต|ถ่ายแขก|people photo/i,
    prefer: ["portrait", "guest portraits", "people", "soft light", "editorial"],
    reqEn: "Portrait photographer (couple + guests)", reqTh: "ช่างภาพบุคคล ถ่ายพอร์ตเทรตคู่บ่าวสาวและแขก",
    whyTh: "ถนัดถ่ายบุคคล ตั้งมุมพอร์ตเทรตให้แขกในงาน", whyEn: "People photographer with a guest portrait station",
  },
  "photography+formal": {
    th: "ช่างภาพพิธีการ", en: "Ceremony photographer",
    re: /ถ่ายจริงจัง|จริงจัง|ถ่ายพิธี|พิธีการ|formal photo|ceremony (coverage|photo)|family formals?|รูปหมู่/i,
    prefer: ["ceremony", "formal", "family photos", "classic", "organised"],
    reqEn: "Ceremony photographer (formal + family photos)", reqTh: "ช่างภาพพิธีการ ถ่ายพิธีและรูปหมู่ครอบครัวครบทุกช่วง",
    whyTh: "ถ่ายพิธีการแบบจริงจัง เก็บครบทุกช่วงและรูปหมู่ครอบครัว", whyEn: "Serious ceremony coverage, every ritual and family group",
  },
};

export const baseOf = (key) => String(key).split("+")[0];
export const slotInfo = (key) => SLOTS[key] || null;

const SHOOTER = /ช่างภาพ|ตากล้อง|photograph|ถ่าย|photo ?booth|โฟโต้บูธ|โฟโต้บูท|ซุ้มถ่ายรูป/i;
// "อยากได้ช่างภาพถ่าย behind the scene เพิ่ม" → "photography+bts"
export function detectSlot(text) {
  if (!SHOOTER.test(text)) return null;
  for (const [key, s] of Object.entries(SLOTS)) if (s.re.test(text)) return key;
  return null;
}

// How well a vendor fits the slot's job (added to the match score, capped).
export function slotFit(key, v) {
  const s = SLOTS[key];
  if (!s || !v) return 0;
  const own = [...(v.tags || []), ...(v.dna?.look || []), ...(v.dna?.feel || []), ...(v.dna?.mood || [])].map((t) => t.toLowerCase());
  const hits = s.prefer.filter((p) => own.includes(p)).length;
  return Math.min(1.6, hits * 0.6);
}
