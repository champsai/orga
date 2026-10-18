// Reviews and trust signals customers see before they pick a vendor. Built deterministically
// for the demo vendors (fictional reviewers and events); new shops start with none.

const NAMES = ["คุณแพร", "คุณต้น", "คุณมายด์", "คุณบีม", "คุณฝน", "Sarah K.", "คุณปอนด์", "คุณนุ่น", "คุณเจ", "Daniel W.", "คุณโบว์", "คุณกิ๊ฟ", "คุณภูมิ", "คุณแนน", "คุณอาร์ม"];
const EVENTS = { venue: ["งานแต่ง", "งานเลี้ยงบริษัท", "งานวันเกิด"], catering: ["งานแต่ง", "สัมมนา", "งานเลี้ยงครอบครัว"], entertainment: ["งานแต่ง", "ปาร์ตี้บริษัท", "งานเปิดตัวสินค้า"], decor: ["งานแต่ง", "งานวันเกิด", "งานหมั้น"], photography: ["งานแต่ง", "สัมมนา", "งานวันเกิด"], experience: ["งานแต่ง", "ปาร์ตี้", "งานบริษัท"], av: ["สัมมนา", "คอนเสิร์ตบริษัท", "งานเปิดตัวสินค้า"], transport: ["สัมมนา", "งานแต่ง", "ทริปบริษัท"] };
const TEXT = {
  venue: ["สถานที่สวยกว่ารูปอีก ทีมงานดูแลดีมาก แขกชมกันทั้งงาน", "วิวดีมาก ไฟสวย ตอนพระอาทิตย์ตกคือที่สุด จองเวลาให้ตรงช่วงนั้น", "ประสานงานง่าย มีผังให้ล่วงหน้า แต่ที่จอดรถค่อนข้างน้อย"],
  catering: ["อาหารอร่อยทุกจาน เสิร์ฟตรงเวลา แขกขอสูตรกันเลย", "ทีมเสิร์ฟสุภาพ มีเมนูมังสวิรัติให้แขกที่แพ้อาหารด้วย", "รสชาติดี ปริมาณเยอะ ราคาคุ้ม จะใช้อีกแน่นอน"],
  entertainment: ["เปิดฟลอร์ได้ตั้งแต่เพลงแรก แขกเต้นกันถึงเที่ยงคืน", "อ่านบรรยากาศเก่ง ช่วงพิธีเพลงเบาๆ ช่วงปาร์ตี้จัดเต็ม", "มาตรงเวลา ซาวด์เช็คเรียบร้อย มืออาชีพมาก"],
  decor: ["ดอกไม้สวยตรงมู้ดบอร์ดเป๊ะ ไม่เยอะเกิน ดูแพงแบบเรียบๆ", "ทีมจัดเร็วมาก เก็บงานเรียบร้อย ปรับแบบให้ตามที่ขอได้", "ซุ้มดอกไม้คือไฮไลต์ของงาน แขกถ่ายรูปกันไม่หยุด"],
  photography: ["ได้รูปแคนดิดสวยมาก จับโมเมนต์เล็กๆ ได้หมด", "ส่งไฮไลต์ภายในคืนเดียว อัลบั้มเต็มได้ภายในสัปดาห์", "ช่างภาพเป็นกันเอง ทำให้ทุกคนไม่เกร็ง"],
  experience: ["บูธเป็นจุดที่คนต่อคิวยาวที่สุดในงาน", "พรินต์รูปเร็ว กรอบรูปออกแบบให้เข้ากับธีมงาน", "แขกผู้ใหญ่ก็สนุก ได้ของที่ระลึกกลับบ้าน"],
  av: ["เสียงชัดทั้งฮอลล์ ไลฟ์สตรีมไม่สะดุดเลย", "ทีมเทคนิคแก้ปัญหาไว ซ้อมกับพิธีกรให้ก่อนงาน", "จอ LED สวยมาก ภาพคมชัดแม้นั่งแถวหลัง"],
  transport: ["คนขับตรงเวลา รถสะอาด แอร์เย็น", "ประสานงานรับส่งวิทยากรได้ไม่มีพลาด", "ราคาชัดเจน ไม่มีค่าใช้จ่ายแอบแฝง"],
};

// stable pseudo-random per vendor so reset always gives the same numbers
function hash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return Math.abs(h); }

export function trustFor(v) {
  const h = hash(v.id);
  const rating = v.rating || 4.6;
  const pool = TEXT[v.category] || TEXT.venue;
  const evs = EVENTS[v.category] || EVENTS.venue;
  const reviews = pool.map((text, i) => {
    const stars = i === 2 && rating < 4.7 ? 4 : 5;
    const month = 1 + ((h >> (i * 3)) % 9);
    return { name: NAMES[(h + i * 7) % NAMES.length], stars, text, event: evs[i % evs.length], date: `2026-${String(month).padStart(2, "0")}-${String(5 + ((h >> i) % 20)).padStart(2, "0")}` };
  });
  return {
    reviews,
    reviewCount: Math.max(reviews.length, Math.round((v.eventsDone || 10) * 0.6)),
    trust: {
      completion: Math.min(100, Math.round(93 + (rating - 4.3) * 10 + (h % 3))),
      repeat: 18 + (h % 27),
      cancellations: rating >= 4.8 ? 0 : h % 2,
      onTime: Math.min(100, 94 + (h % 6)),
      sinceYear: 2016 + (h % 8),
      docs: v.verified ? ["Business registration", "ID checked", "Bank account verified"] : [],
    },
  };
}

// Extra portfolio titles so every demo shop has three photos to show
const MORE = {
  catering: ["Plated main course", "Dessert table"], entertainment: ["Crowd on the dance floor", "Ceremony set"], decor: ["Table styling"],
  photography: ["Golden-hour portrait"], experience: ["Guests in the booth", "Custom print frame"], av: ["Stage in action"], transport: ["Guest pick-up", "Coach interior"], venue: ["Evening set-up"],
};
export function fillPortfolio(v) {
  const p = [...(v.portfolio || [])];
  for (const t of MORE[v.category] || []) if (p.length < 3) p.push({ title: t });
  while (p.length < 3) p.push({ title: `${v.shopName} at work` });
  return p;
}
