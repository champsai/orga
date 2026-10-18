// Thai wording for the customer site: style words, suggestion lines, package names and match
// reasons. The engine (offline rules or Claude) works in English; this turns its output into
// Thai a customer reads at a glance. Anything not in the dictionary falls back to the English.

const TAG = {
  // client style words
  elegant: "หรูหรา", romantic: "โรแมนติก", warm: "อบอุ่น", cozy: "อบอุ่นสบาย", playful: "ขี้เล่น", fun: "สนุก",
  luxurious: "หรูอลังการ", professional: "มืออาชีพ", inspiring: "สร้างแรงบันดาลใจ", calm: "สงบ", joyful: "สดใส",
  formal: "ทางการ", personal: "มีความเป็นเรา", intimate: "ใกล้ชิด", lively: "มีชีวิตชีวา", energetic: "มีชีวิตชีวา",
  relaxed: "สบาย ๆ", social: "ได้พูดคุยกัน", spacious: "ไม่อึดอัด", memorable: "น่าจดจำ", organised: "เป๊ะ ตรงเวลา",
  modern: "โมเดิร์น", minimal: "มินิมอล", "high fashion": "ไฮแฟชั่น", garden: "สวน", rooftop: "ดาดฟ้า", rustic: "รัสติก",
  boho: "โบฮีเมียน", beach: "ชายหาด", industrial: "ลอฟต์", vintage: "วินเทจ", "y2k retro": "ย้อนยุค Y2K", tech: "เทค",
  floral: "ดอกไม้", "soft muted palette": "โทนสีอ่อนนุ่ม", gold: "ทอง", "warm lighting": "ไฟโทนอุ่น", natural: "ธรรมชาติ",
  classic: "คลาสสิก", traditional: "แบบประเพณี", "old-fashioned": "เชย", "over-the-top": "อลังการเกินไป",
  "too simple": "เรียบเกินไป", stuffy: "นิ่งเกินไป",
  // vendor style words
  "modern romantic": "โมเดิร์นโรแมนติก", greenery: "ต้นไม้เขียว", glass: "กระจก", airy: "โปร่ง", "natural wood": "ไม้ธรรมชาติ",
  tropical: "ทรอปิคอล", crystal: "คริสตัล", ballroom: "บอลรูม", grand: "ยิ่งใหญ่", ceremonial: "เป็นพิธีการ",
  "raw concrete": "ปูนเปลือย", creative: "สร้างสรรค์", bold: "จัดจ้าน", open: "เปิดโล่ง", rattan: "หวาย",
  "free-spirited": "อิสระ", breezy: "ลมเย็นสบาย", casual: "สบาย ๆ", corporate: "องค์กร", clean: "คลีน", polished: "เนี้ยบ",
  "modern thai": "ไทยร่วมสมัย", "family style": "แชร์กันทั้งโต๊ะ", generous: "ให้เยอะ", banquet: "โต๊ะจีน",
  "red & gold": "แดง-ทอง", abundant: "จัดเต็มจาน", copper: "ทองแดง", botanical: "พฤกษา", friendly: "เป็นกันเอง",
  soulful: "มีอารมณ์", party: "ปาร์ตี้", neon: "นีออน", "minimal floral": "ดอกไม้มินิมอล", soft: "นุ่มนวล",
  dramatic: "ดราม่า", festoon: "ไฟระย้า", candlelight: "แสงเทียน", glowing: "เรืองรอง", documentary: "แนวสารคดี",
  "film tones": "โทนฟิล์ม", "natural light": "แสงธรรมชาติ", honest: "เป็นธรรมชาติ", candid: "แคนดิด",
  editorial: "แนวนิตยสาร", "high contrast": "คอนทราสต์สูง", studio: "สตูดิโอ", glamorous: "แกลมอรัส", posed: "จัดท่า",
  interactive: "มีส่วนร่วม", "vintage touch": "กลิ่นวินเทจ", handwritten: "ลายมือ", sentimental: "ซึ้ง",
  discreet: "ไม่รบกวนแขก", reliable: "ไว้ใจได้",
  // photographer styles
  "behind the scenes": "เบื้องหลัง", bts: "เบื้องหลัง", unposed: "ไม่จัดท่า", atmosphere: "เก็บบรรยากาศ", details: "รายละเอียด",
  moody: "อารมณ์หม่น", portrait: "พอร์ตเทรต", "soft light": "แสงนุ่ม", ceremony: "พิธีการ", photobooth: "โฟโต้บูธ",
  flash: "แฟลช", "instant prints": "ปริ้นต์รูปทันที",
  // launch & production
  futuristic: "ล้ำสมัย", mysterious: "ลึกลับ", premium: "พรีเมียม", immersive: "พาเข้าไปในโลกของงาน", dramatic: "ว้าว น่าตื่นเต้น",
  "sci-fi": "ไซไฟ", "black box": "แบล็กบ็อกซ์", flexible: "ปรับผังได้", led: "จอ LED", "show lighting": "แสงโชว์", "high-tech": "ไฮเทค",
  reflective: "พื้นผิวสะท้อนแสง", sculptural: "งานประติมากรรม", installation: "อินสตอลเลชัน", standing: "แบบยืน", black: "โทนดำ",
  performance: "โชว์", choreography: "ท่าเต้น", reels: "คลิปสั้น", shareable: "แชร์ต่อได้",
};
export const tagTh = (t) => TAG[String(t).toLowerCase()] || t;

// "Elegant", "150 PAX" → "หรูหรา", "150 คน"
export function chipTh(c) {
  const m = String(c).match(/^(\d+) PAX$/i);
  return m ? `${m[1]} คน` : tagTh(c);
}
// "too formal" → "ทางการเกินไป"
export function avoidTh(a) {
  const m = String(a).match(/^too (.+)$/i);
  if (m && !TAG[a.toLowerCase()]) return `${tagTh(m[1])}เกินไป`;
  return tagTh(a);
}

const REQ = {
  "Live band": "วงดนตรีสด", DJ: "ดีเจ", "MC / host": "พิธีกร", "String quartet": "วงเครื่องสาย",
  "Photo booth": "ซุ้มถ่ายรูป (photo booth)", "Guestbook / message station": "มุมเขียนคำอวยพร",
  "Event photography": "ช่างภาพประจำงาน", "Headshot corner": "มุมถ่ายรูปโปรไฟล์",
  "Cocktail bar with signature drinks": "บาร์ค็อกเทล + เมนูซิกเนเจอร์", "Long shared table, sharing menu": "โต๊ะยาว อาหารแชร์กัน",
  "Dinner service": "อาหารมื้อค่ำ", "Coffee breaks": "coffee break", Lunch: "อาหารกลางวัน", "LED wall / screens": "จอ LED",
  "Live stream": "ถ่ายทอดสด", "Sound system + mics": "ระบบเสียง + ไมค์", "Guest shuttle": "รถรับส่งแขก",
  "Floral design": "จัดดอกไม้", "Warm lighting": "ไฟโทนอุ่น", "Breakout rooms": "ห้องย่อย",
  "Garden / rooftop / modern event space": "สวน ดาดฟ้า หรือสถานที่โมเดิร์น", "Spacious seating, room to mingle": "ที่นั่งไม่แน่น มีที่เดินคุยกัน",
  "Indoor + outdoor areas": "มีทั้งโซนในร่มและกลางแจ้ง", "Dinner reception": "งานเลี้ยงมื้อค่ำ",
  "Cocktail bar + signature drinks": "บาร์ค็อกเทล + เมนูซิกเนเจอร์", "Social dining setup": "จัดโต๊ะให้แขกได้คุยกัน",
  "Live band / DJ": "วงดนตรีสด / ดีเจ", "Interactive moments": "กิจกรรมให้แขกร่วมสนุก", "Entertaining MC": "พิธีกรที่ชวนสนุก",
  "Personalized guest activities": "กิจกรรมที่เล่าเรื่องของคุณสองคน", "Modern romantic styling": "ตกแต่งโมเดิร์นโรแมนติก",
  "Minimal floral": "ดอกไม้แบบมินิมอล", "Candid photography": "ช่างภาพแนวธรรมชาติ (candid)",
  "Ceremony + reception decor": "ตกแต่งพิธีและงานเลี้ยง", "Stage, LED wall and sound": "เวที จอ LED และระบบเสียง",
  "Coffee breaks + lunch": "coffee break + อาหารกลางวัน", "Bilingual MC": "พิธีกรสองภาษา", "Dinner, sharing style": "อาหารค่ำแบบแชร์",
  "Something interactive (photo booth?)": "กิจกรรมสนุก ๆ เช่น ซุ้มถ่ายรูป", "Canapés + cocktail bar": "ออเดิร์ฟ + บาร์ค็อกเทล",
  "Food & drinks": "อาหารและเครื่องดื่ม", Decor: "ตกแต่ง", Entertainment: "ความบันเทิง",
  "Main hall with stage": "ห้องหลักพร้อมเวที", "Modern event space": "สถานที่สไตล์โมเดิร์น",
  // extra photographers (lib/slots.js)
  "Photobooth photographer (instant prints)": "ช่างภาพโฟโต้บูธ ปริ้นต์รูปให้แขก",
  "Behind-the-scenes photographer (unposed, atmosphere)": "ช่างภาพเบื้องหลัง ถ่ายทีเผลอ เก็บบรรยากาศจริง",
  "Portrait photographer (couple + guests)": "ช่างภาพบุคคล ถ่ายพอร์ตเทรตคู่บ่าวสาวและแขก",
  "Ceremony photographer (formal + family photos)": "ช่างภาพพิธีการ ถ่ายพิธีและรูปหมู่ครอบครัว",
  // launch briefs (lib/creative.js)
  "Black-box event space with production power": "พื้นที่ Black Box รองรับงานโปรดักชัน",
  "Stage, LED, sound and show lighting (the reveal)": "เวที จอ LED เสียง และแสงโชว์ (ช่วงเปิดตัว)",
  "Hero set + photo portal installation": "ฉากหลัก + จุดถ่ายรูป Portal", "Show direction + performance": "ผู้กำกับโชว์ + การแสดง",
  "Standing canapés + drinks": "อาหารว่างแบบยืน + เครื่องดื่ม", "Photo, video + fan content": "ภาพ วิดีโอ + คอนเทนต์แฟนคลับ",
};
export function reqTh(text) {
  if (REQ[text]) return REQ[text];
  let m = text.match(/^(\d+) seated guests$/i);
  if (m) return `รองรับแขก ${m[1]} ที่นั่ง`;
  if ((m = text.match(/^(\d+) attendees$/i))) return `ผู้เข้าร่วม ${m[1]} คน`;
  if ((m = text.match(/^(.+) venue$/i))) return `สถานที่สไตล์${m[1].split(" / ").map(tagTh).join(" / ")}`;
  // a list of style words ("Garden, Floral, Warm lighting")
  const parts = text.split(/,\s*/);
  if (parts.every((p) => TAG[p.toLowerCase()])) return parts.map(tagTh).join(", ");
  return text;
}

const PKG = {
  "Evening reception (6 hrs)": "งานเลี้ยงช่วงเย็น (6 ชม.)", "Full day (12 hrs)": "เต็มวัน (12 ชม.)", "Garden evening": "งานเย็นในสวน",
  "Wedding banquet": "โต๊ะจีนงานแต่ง", "Conference day": "สัมมนา 1 วัน", "Full day hire": "เช่าเต็มวัน",
  "Sunset beach reception": "งานเลี้ยงริมหาดยามเย็น", "Conference day (hall + 4 breakouts)": "สัมมนา 1 วัน (ห้องหลัก + ห้องย่อย 4 ห้อง)",
  "Social sharing dinner": "ดินเนอร์แชร์ร่วมโต๊ะ", "Cocktail canapés": "ค็อกเทลและออเดิร์ฟ", "9-course Chinese banquet": "โต๊ะจีน 9 อย่าง",
  "4-hour cocktail bar": "บาร์ค็อกเทล 4 ชม.", "Coffee break station": "มุม coffee break", "3 sets + DJ playlist": "เล่นสด 3 เซ็ต + เพลย์ลิสต์ดีเจ",
  "4-hour set": "เล่น 4 ชม.", "Ceremony + cocktail hour": "ช่วงพิธี + ค็อกเทล", "Event MC (5 hrs)": "พิธีกร (5 ชม.)",
  "Reception florals (150 guests)": "ดอกไม้งานเลี้ยง (แขก 150 คน)", "Ballroom stage + tables": "เวทีบอลรูม + โต๊ะ",
  "Warm ambience package": "แพ็กเกจไฟโทนอุ่น", "Full day, 2 photographers": "เต็มวัน ช่างภาพ 2 คน", "Corporate event day": "งานองค์กร 1 วัน",
  "4-hour booth + unlimited prints": "ซุ้ม 4 ชม. + ปริ้นต์รูปไม่จำกัด", "Audio guestbook + message wall": "สมุดอวยพรแบบเสียง + กำแพงข้อความ",
  "Conference stage kit": "ชุดเวทีสัมมนา", "Wedding sound + mics": "ระบบเสียงงานแต่ง + ไมค์", "40-seat coach, 10 hrs": "รถบัส 40 ที่นั่ง 10 ชม.",
  "Behind-the-scenes coverage (8 hrs)": "ถ่ายเบื้องหลังทั้งงาน (8 ชม.)", "Atmosphere & details (6 hrs)": "เก็บบรรยากาศและรายละเอียด (6 ชม.)",
  "Guest portrait station (4 hrs)": "มุมถ่ายพอร์ตเทรตแขก (4 ชม.)", "Ceremony + family formals": "พิธีการ + รูปหมู่ครอบครัว",
  "Roaming booth + instant prints (4 hrs)": "โฟโต้บูธเดินถ่าย + ปริ้นต์รูปทันที (4 ชม.)",
  "Black-box hall, full day": "ฮอลล์แบล็กบ็อกซ์ เต็มวัน", "Show production: stage, LED, sound, light": "โปรดักชันโชว์: เวที จอ LED เสียง แสง",
  "Hero set + photo portal installation": "ฉากหลัก + Photo Portal", "Standing canapés + drinks": "อาหารว่างแบบยืน + เครื่องดื่ม",
  "Show direction + 6 dancers": "ผู้กำกับโชว์ + นักเต้น 6 คน", "Photo + reels + fan content": "ภาพนิ่ง + คลิปสั้น + คอนเทนต์แฟนคลับ",
};
export const pkgTh = (name) => (name && PKG[name]) || name;

const PLACE = { Bangkok: "กรุงเทพฯ", "Hua Hin": "หัวหิน", "Chiang Mai": "เชียงใหม่", Phuket: "ภูเก็ต", Pattaya: "พัทยา", "Khao Yai": "เขาใหญ่", Krabi: "กระบี่", "Koh Samui": "เกาะสมุย" };
const SETTING = { "indoor + outdoor": "มีทั้งในร่มและกลางแจ้ง", indoor: "ในร่ม", outdoor: "กลางแจ้ง" };
// one item of match evidence: "150 guests", "Bangkok", "Max 120 guests", "Booked on 2026-12-12"…
export function fitTh(s) {
  if (PLACE[s]) return PLACE[s];
  if (SETTING[s]) return SETTING[s];
  let m;
  if ((m = s.match(/^(\d+) guests$/))) return `รับแขก ${m[1]} คนได้`;
  if ((m = s.match(/^Max (\d+) guests$/))) return `รับได้สูงสุด ${m[1]} คน`;
  if ((m = s.match(/^Built for (\d+)\+ guests$/))) return `เหมาะกับงาน ${m[1]} คนขึ้นไป`;
  if ((m = s.match(/^Based in (.+)$/))) return `ร้านอยู่ที่${PLACE[m[1]] || m[1]}`;
  if ((m = s.match(/^Booked on (.+)$/))) return `ไม่ว่างวันที่ ${m[1]}`;
  if ((m = s.match(/^Specialises in (\w+) events$/))) return `ถนัดงาน${{ launch: "เปิดตัว", wedding: "แต่งงาน", conference: "สัมมนา" }[m[1]] || m[1]}มากกว่า`;
  return { "Indoor only": "ในร่มเท่านั้น", "Outdoor only": "กลางแจ้งเท่านั้น", "Within budget": "อยู่ในงบ", "Above budget share": "เกินงบของหมวดนี้" }[s] || s;
}
