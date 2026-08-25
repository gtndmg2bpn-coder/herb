// app/api/intent/route.js
// Server-side text/voice intent route — the twin of app/api/receipt/route.js.
// A model turns one free-text utterance ("add 2 chicken breasts to the freezer",
// "spent a tenner at Tesco", "I weigh 82.4kg") into HERB's structured raw guess,
// then interpretIntent (lib/parseIntent) does the deterministic part: validate
// against the fixed action vocabulary, resolve the ingredient, normalise money /
// weight / location, score confidence, and decide PROPOSE / FALLBACK / REJECT.
//
// This route NEVER writes. It only proposes. The commit is a deliberate user tap
// in the confirm card, which routes through commitProposal -> the action layer.
//
// Setup (owner): needs ANTHROPIC_API_KEY in the Vercel project env — the SAME key
// the receipt route already uses. The master ingredient list is passed in from
// the client (already loaded for the picker); the route needs no Supabase access,
// and the commit RPCs still validate every ingredientId under RLS.

import { NextResponse } from 'next/server';
import { interpretIntent } from '../../../lib/parseIntent';

export const runtime = 'nodejs';        // CommonJS brain + no edge limits
export const dynamic = 'force-dynamic';

const MODEL = 'claude-sonnet-5';        // swap to claude-haiku-4-5 for cheaper, claude-opus-5 for stronger
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// The model's only job: classify ONE utterance into HERB's fixed intents and pull
// out the fields. It must NOT match ingredients to our catalogue, invent ids, or
// convert units — the brain owns all of that. Output is the exact raw-guess shape
// interpretIntent expects (all fields optional except intent).
const INTENT_PROMPT = [
  'You convert a single spoken/typed note about food, shopping, spend or weight',
  'into ONE structured intent. Return ONLY a JSON object, no prose, no markdown',
  'fences, with EXACTLY these keys (use null when a field is absent):',
  '{',
  '  "intent": "add_stock" | "bin_stock" | "log_spend" | "log_weight" | "log_off_plan" | null,',
  '  "ingredient": string|null,   // for add_stock/bin_stock, plain name e.g. "chicken breast"',
  '  "quantity": number|null,     // count of items/packs',
  '  "unit": string|null,         // e.g. "g", "pack", null if none',
  '  "location": string|null,     // fridge | freezer | cupboard (map "pantry"/"larder"->cupboard, "frozen"->freezer)',
  '  "amount": string|null,       // money for log_spend, as spoken e.g. "£10", "a tenner"->"£10"',
  '  "category": string|null,     // spend category: grocery | eating_out | sundry',
  '  "weight": string|null,       // body weight for log_weight e.g. "82.4kg", "13 stone"',
  '  "description": string|null,  // for log_off_plan, the thing eaten e.g. "pizza and a beer"',
  '  "kcal": number|null,         // for log_off_plan, only if the user states calories',
  '  "cost": string|null,         // money spent on an added/off-plan item e.g. "£3.90"',
  '  "date": "YYYY-MM-DD"|null,   // only if a specific date is stated',
  '  "note": string|null,',
  '  "modelConfidence": number    // 0..1, YOUR confidence in the intent + fields',
  '}',
  'Intent guide:',
  '- add_stock: putting food INTO the kitchen ("add", "bought", "put ... in the fridge").',
  '- bin_stock: throwing food away ("bin", "threw out", "chucked", "gone off").',
  '- log_spend: money spent, no specific item ("spent £X", "£X at <shop>").',
  '- log_weight: the user\'s body weight.',
  '- log_off_plan: something eaten that is not a planned HERB meal.',
  'If the note fits none, or is empty/unclear, set intent to null and',
  'modelConfidence low. Never guess ingredient ids. Return ONLY the JSON object.',
].join('\n');

function extractJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ status: 'REJECT', reason: 'server missing ANTHROPIC_API_KEY' }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: 'REJECT', reason: 'invalid request body' }, { status: 400 });
  }

  const { utterance, ingredients = [] } = body || {};
  if (!utterance || typeof utterance !== 'string' || !utterance.trim()) {
    return NextResponse.json({ status: 'REJECT', reason: 'no utterance supplied' }, { status: 400 });
  }

  // 1) Model: utterance -> structured raw guess
  let raw;
  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        messages: [
          { role: 'user', content: `${INTENT_PROMPT}\n\nNOTE:\n${utterance.trim()}` },
        ],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      return NextResponse.json(
        { status: 'REJECT', reason: `intent model error (${resp.status})`, detail: detail.slice(0, 500) },
        { status: 502 },
      );
    }

    const data = await resp.json();
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    raw = extractJson(text);
  } catch (e) {
    return NextResponse.json({ status: 'REJECT', reason: 'intent request failed', detail: String(e?.message || e) }, { status: 502 });
  }

  if (!raw) {
    return NextResponse.json({ status: 'REJECT', reason: 'could not understand that' }, { status: 200 });
  }

  // 2) Brain: validate + resolve + normalise + score -> proposal (never commits)
  const proposal = interpretIntent(raw, ingredients);
  return NextResponse.json(proposal, { status: 200 });
}
