// app/api/receipt/route.js
// Server-side receipt vision route. Takes a receipt photo + the ingredient master,
// asks a vision model to read each line into a clean canonical guess, then runs the
// result through the receipt brain (lib/matchReceipt) to produce the Contract B
// proposal the confirm card renders.
//
// This route NEVER writes anything. It only proposes. The commit is a deliberate
// user action in ReceiptConfirmCard, which routes through the action layer / RPCs.
//
// Setup (owner): add ANTHROPIC_API_KEY to the Vercel project env. Nothing else.
// The master is passed in from the client (already loaded for the confirm-card
// picker), so the route needs no Supabase access and no service-role key — and the
// commit RPC still validates every ingredientId under RLS, so client-supplied
// master is safe for matching only.

import { NextResponse } from 'next/server';
import { interpretReceipt } from '../../../lib/matchReceipt';

export const runtime = 'nodejs';       // CommonJS brain + no edge limits
export const dynamic = 'force-dynamic';

const MODEL = 'claude-sonnet-5';       // current vision-capable Sonnet (swap to claude-haiku-4-5 for cheaper, claude-opus-5 for stronger)
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// The model's only job: turn the photo into structured lines with a plain-English
// canonical_guess per item. The brain does all validation/matching/normalisation —
// the model must NOT try to match against our catalogue or invent ids.
const VISION_PROMPT = [
  'You are reading a UK supermarket receipt from the image.',
  'Return ONLY a JSON object, no prose, no markdown fences, with this exact shape:',
  '{',
  '  "store": string|null,',
  '  "purchase_date": "YYYY-MM-DD"|null,',
  '  "currency": "GBP",',
  '  "total": string|null,',
  '  "lines": [',
  '    {',
  '      "raw_text": string,           // the line exactly as printed',
  '      "canonical_guess": string|null, // plain-English ingredient name, e.g. "chicken breast"; null if not a food ingredient',
  '      "quantity": number,           // count of packs/items on the line, default 1',
  '      "pack_size": string|null,     // e.g. "650g", "2L", null if absent',
  '      "price": string|null          // line price as printed, e.g. "£3.90"',
  '    }',
  '  ]',
  '}',
  'Rules: expand abbreviations into a normal ingredient name for canonical_guess',
  '(e.g. "CKN BRST" -> "chicken breast"). Set canonical_guess to null for non-food',
  'lines (bags, offers, totals, loyalty). Do not guess ingredient ids. Do not add',
  'fields. If you cannot read the receipt at all, return {"lines": []}.',
].join('\n');

function extractJson(text) {
  if (!text) return null;
  // tolerate accidental ```json fences or leading prose
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

  const { imageBase64, mediaType = 'image/jpeg', ingredients = [] } = body || {};
  if (!imageBase64) {
    return NextResponse.json({ status: 'REJECT', reason: 'no image supplied' }, { status: 400 });
  }

  // 1) Vision read → structured lines
  let visionJson;
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
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
              { type: 'text', text: VISION_PROMPT },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      return NextResponse.json(
        { status: 'REJECT', reason: `vision model error (${resp.status})`, detail: detail.slice(0, 500) },
        { status: 502 },
      );
    }

    const data = await resp.json();
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    visionJson = extractJson(text);
  } catch (e) {
    return NextResponse.json({ status: 'REJECT', reason: 'vision request failed', detail: String(e?.message || e) }, { status: 502 });
  }

  if (!visionJson) {
    return NextResponse.json({ status: 'REJECT', reason: 'could not read the receipt' }, { status: 200 });
  }

  // 2) Brain: validate + match + normalise → Contract B proposal (never commits)
  const proposal = interpretReceipt(visionJson, ingredients);
  return NextResponse.json(proposal, { status: 200 });
}
