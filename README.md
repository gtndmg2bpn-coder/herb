# HERB — Gate D front end

Minimal Next.js app proving the full stack end to end: Supabase → anon key → live recipe data. Two screens: recipe list and recipe detail (per-portion macros + cost).

Styling is deliberately plain — brand styling (Dishoom golden-night) is Gate E.

## Deploy

1. Push this folder to a GitHub repo.
2. In Vercel: **Add New → Project → Import** the repo.
3. Add two Environment Variables before deploying:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy. Open the live URL.

Both env vars are public values. The service-role / secret key must never be added.

## Local dev (optional)

```
npm install
cp .env.local.example .env.local   # then fill in real values
npm run dev
```
