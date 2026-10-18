// AI layer. Uses Claude when ANTHROPIC_API_KEY is set; otherwise (or if a call
// fails) falls back to the offline engine so the demo never dead-ends.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import * as offline from "./offline-ai.js";
import { CATEGORIES, templateWhy } from "./matching.js";

const MODEL = process.env.ORCA_MODEL || "claude-opus-5-5";
const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const client = hasKey ? new Anthropic() : null;
let useFallbacks = true; // server-side refusal fallback; switched off if the API rejects it

export const aiStatus = () => ({ mode: client ? "claude" : "offline", model: client ? MODEL : null });

const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

const DNASchema = z.object({
  summary: z.string(),
  eventType: z.string(),
  chips: z.array(z.string()),
  basics: z.object({
    guests: z.number().nullable(),
    date: z.string().nullable(),
    location: z.string().nullable(),
    budget: z.number().nullable(),
    setting: z.string().nullable(),
  }),
  style: z.object({
    mood: z.array(z.string()),
    feel: z.array(z.string()),
    look: z.array(z.string()),
    avoid: z.array(z.string()),
  }),
  requirements: z.array(
    z.object({
      id: z.string(),
      category: z.enum(CATEGORY_KEYS),
      text: z.string(),
      kind: z.enum(["requirement", "preference"]),
      source: z.enum(["client", "interpreted", "suggested"]),
      quote: z.string().nullable(),
    }),
  ),
  openQuestions: z.array(z.object({ field: z.string(), question: z.string() })),
});

async function ask(schema, system, user, effort = "low") {
  const params = {
    model: MODEL,
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { effort, format: betaZodOutputFormat(schema) },
  };
  if (useFallbacks) Object.assign(params, { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
  let res;
  try {
    res = await client.beta.messages.parse(params);
  } catch (err) {
    if (useFallbacks && err instanceof Anthropic.BadRequestError && /fallback/i.test(err.message)) {
      useFallbacks = false;
      return ask(schema, system, user, effort);
    }
    throw err;
  }
  if (res.stop_reason === "refusal") throw new Error("Claude declined this request");
  if (!res.parsed_output) throw new Error(`No structured output (stop_reason: ${res.stop_reason})`);
  return res.parsed_output;
}

// Run with Claude, fall back to the offline engine on any failure.
async function withFallback(label, claudeFn, offlineFn) {
  if (!client) return { ...(await offlineFn()), _ai: "offline" };
  try {
    return { ...(await claudeFn()), _ai: "claude" };
  } catch (err) {
    console.warn(`[ai] ${label} failed, using offline engine:`, err.message);
    return { ...(await offlineFn()), _ai: "offline", _aiError: err.message };
  }
}

const today = () => new Date().toISOString().slice(0, 10);

const DECODE_SYSTEM = `You are ORCA, an AI concierge for Thai event organizers. You turn a client's vague words into "Event DNA": a precise spec vendors can act on. A human understands the intention; a vendor needs the specification.

Rules:
- Read every client message in order. Later messages refine or override earlier ones.
- basics: guests (number), date (YYYY-MM-DD; if no year, use the next upcoming one after ${"{TODAY}"}), location (city), budget (total THB as a number), setting ("indoor", "outdoor" or "indoor + outdoor"). Use null when not given. Never invent basics.
- style: short lowercase tags. mood = emotional tone, feel = how it feels to be there, look = visual style, avoid = what the client does not want (keep their wording, e.g. "too formal").
- requirements: concrete needs per category (${CATEGORY_KEYS.join(", ")}). kind "requirement" = must-have or hard number (e.g. "150 seated guests"); "preference" = taste (e.g. "warm lighting"). source "client" = they said it, "interpreted" = you inferred it from their words, "suggested" = your professional suggestion they never mentioned. Include sensible suggestions for the event type, marked "suggested".
- quote: the exact words from the client message that support the item (verbatim substring, original language), or null for suggestions. Every requirement should trace back to the client's own words when possible.
- chips: 4-6 short headline chips like "150 PAX", "Elegant · Romantic", "Personal".
- openQuestions: at most 4, only for missing information that changes vendor choice (date, guests, location, budget, rain plan...).
- If a PREVIOUS DNA is given: keep everything that the new message does not change. LOCKED items must appear unchanged (same id, text, tags). REJECTED items must not appear anywhere. Keep requirement ids stable; new ones get new ids.
- Tags and requirement text in English; quotes stay in the client's language (Thai is common).`;

export async function decode({ texts, previous }) {
  return withFallback(
    "decode",
    async () => {
      const prev = previous
        ? `\n\nPREVIOUS DNA (JSON):\n${JSON.stringify({ ...previous, locked: undefined, rejected: undefined })}\n\nLOCKED (keep exactly): ${JSON.stringify(previous.locked || [])}\nREJECTED (never include): ${JSON.stringify(previous.rejected || [])}`
        : "";
      const msgs = texts.map((t, i) => `Message ${i + 1}:\n${t}`).join("\n\n");
      const out = await ask(DNASchema, DECODE_SYSTEM.replace("{TODAY}", today()), `CLIENT MESSAGES:\n${msgs}${prev}`, "medium");
      return { ...out, locked: previous?.locked || [], rejected: previous?.rejected || [] };
    },
    () => offline.decode({ texts, previous }),
  );
}

const ExplainSchema = z.object({
  matches: z.array(z.object({ vendorId: z.string(), why: z.string() })),
  setNote: z.string(),
});

export async function explainMatches({ event, ranked, vendorsById }) {
  return withFallback(
    "explain",
    async () => {
      const compact = Object.fromEntries(
        Object.entries(ranked).map(([cat, list]) => [
          cat,
          list.map((m) => {
            const v = vendorsById[m.vendorId];
            return { vendorId: m.vendorId, name: v.shopName, score: m.score, vendorDNA: v.dna, tags: v.tags, evidence: m.evidence, needsConfirmation: m.needsConfirmation };
          }),
        ]),
      );
      const out = await ask(
        ExplainSchema,
        "You are ORCA. For each vendor, write one short 'why it fits' line (max 18 words) an event organizer can read at a glance. Ground it in the evidence: name the matching mood/feel/look and practical fits; if the vendor leans toward something the client wants to avoid, say so plainly. Then write setNote: 1-2 sentences on whether the top pick in each category fit together as one story (look, mood), naming any clash.",
        `CLIENT EVENT DNA:\n${JSON.stringify(event.dna)}\n\nRANKED VENDORS BY CATEGORY:\n${JSON.stringify(compact)}`,
      );
      return { why: Object.fromEntries(out.matches.map((m) => [m.vendorId, m.why])), setNote: out.setNote };
    },
    () => offline.explainMatches({ ranked, vendorsById, templateWhy }),
  );
}

const LearnSchema = z.object({
  learned: z.string(),
  terms: z.array(z.object({ term: z.string(), weight: z.number() })),
  addAvoid: z.array(z.string()),
  addLook: z.array(z.string()),
});

export async function learnFromFeedback({ event, text }) {
  return withFallback(
    "learn",
    () =>
      ask(
        LearnSchema,
        "You are ORCA. A client reacted to proposed vendors. Extract what ORCA should remember for every future search: learned = one short sentence in the style 'Reduces strict classic styles' or 'Soft, muted palettes are a keeper'. terms = style tags to boost (weight 1) or reduce (weight -1). addAvoid = tags to add to the avoid list. addLook = look tags to add. Only use what the reaction actually says.",
        `CURRENT DNA STYLE: ${JSON.stringify(event.dna?.style)}\n\nCLIENT REACTION: ${text}`,
      ),
    () => offline.learnFromFeedback({ text }),
  );
}

const DraftSchema = z.object({ text: z.string() });

export async function draftVendorMessage({ event, vendor, questions }) {
  return withFallback(
    "draft",
    () =>
      ask(
        DraftSchema,
        "You are ORCA writing to a Thai event vendor on behalf of an organizer. Write a short, polite message in Thai (use ครับ), the way organizers message vendors on LINE: greet the shop by name, give the event name, date, location, guest count and style in one or two lines, then ask the numbered questions. No marketing fluff. Under 120 words.",
        `EVENT: ${JSON.stringify({ name: event.name, basics: event.dna?.basics, style: event.dna?.style })}\nVENDOR: ${vendor.shopName} (${vendor.category})\nQUESTIONS: ${JSON.stringify(questions)}`,
      ),
    () => offline.draftVendorMessage({ event, vendor, questions }),
  );
}

const ReplySchema = z.object({
  available: z.boolean().nullable(),
  price: z.number().nullable(),
  notes: z.string(),
});

export async function parseVendorReply({ text, questions }) {
  return withFallback(
    "parse-reply",
    () =>
      ask(
        ReplySchema,
        "Extract facts from a vendor's reply (often Thai, LINE style). available = true/false/null if not stated. price = total quoted THB for this event as a number, or null. notes = one English line with exclusions, validity and conditions.",
        `QUESTIONS WE ASKED: ${JSON.stringify(questions || [])}\n\nVENDOR REPLY:\n${text}`,
      ),
    () => offline.parseVendorReply({ text }),
  );
}
