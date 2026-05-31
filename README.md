# My App

Zero-cost mobile-first web app starter: React + Vite + Tailwind + Supabase + Vercel.

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set up Supabase
1. Create a free project at https://supabase.com
2. Go to Project Settings → API
3. Copy your Project URL and anon public key

### 3. Configure environment
```bash
cp .env.example .env
```
Fill in your Supabase URL and anon key in `.env`.

### 4. Run locally
```bash
npm run dev
```
Open http://localhost:5173

## Deploy to Vercel (free)

1. Push this repo to GitHub
2. Go to https://vercel.com → New Project → Import from GitHub
3. Add your env vars (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) in Vercel settings
4. Deploy — every push to main auto-deploys

## Project Structure

```
src/
├── lib/
│   ├── supabase.js       # Supabase client
│   └── AuthContext.jsx   # Auth state & helpers
├── pages/
│   ├── Login.jsx         # Sign in / Sign up
│   └── Dashboard.jsx     # Protected home page
├── App.jsx               # Routes
└── main.jsx              # Entry point
```

## Stack
- **React 18** + **Vite 5** — frontend
- **Tailwind CSS** — styling
- **Supabase** — database, auth, storage (free tier)
- **Vercel** — hosting (free tier)
