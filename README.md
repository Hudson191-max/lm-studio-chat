# LM Studio Chat

A web interface to chat with your local LM Studio AI from anywhere. Features login authentication, streaming responses, conversation history, and Cloudflare Tunnel support for remote access.

## Features

- **Login Authentication** — Scrypt-hashed passwords, JWT sessions (30-day expiry)
- **Streaming Chat** — Real-time streaming responses from LM Studio's OpenAI-compatible API
- **Conversation History** — Save, rename, and delete conversations (SQLite/Prisma)
- **Model Selection** — Pick models loaded in LM Studio, adjust temperature and max tokens
- **Remote Access** — Use Cloudflare Tunnel to access from anywhere with internet
- **Mobile Responsive** — Works on phones and tablets

## Quick Start (Windows)

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [LM Studio](https://lmstudio.ai/) with a model loaded and local server running

### Setup

1. **Clone or download this repo**, then open a terminal in the project folder

2. **Install dependencies:**
   ```
   npm install
   ```

3. **Set up the database:**
   ```
   mkdir db
   npx prisma db push
   ```

4. **Create `.env` file** (copy from `.env.example`):
   ```
   DATABASE_URL="file:./db/custom.db"
   NEXTAUTH_SECRET="change-me-to-a-random-string"
   ```
   Generate a secret with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

5. **Start the production server:**
   ```
   npx next build
   npx next start -p 3000
   ```
   Or use the batch file: `START.bat`

6. **Open** [http://localhost:3000](http://localhost:3000) — create your account on first visit

## Remote Access (Cloudflare Tunnel)

1. Download [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
2. Start the tunnel:
   ```
   cloudflared tunnel --url http://localhost:3000
   ```
3. Use the `https://xxxx.trycloudflare.com` URL from any device

## Development

```
npm run dev          # Start dev server on port 3000
npm run build        # Build for production
npm run start        # Start production server
npm run db:push      # Push schema changes to database
npm run db:generate  # Generate Prisma client
```

## Tech Stack

- **Next.js 15** (App Router)
- **NextAuth.js v4** (Credentials + JWT)
- **Prisma** + SQLite
- **Zustand** (state management)
- **shadcn/ui** + Tailwind CSS
- **react-markdown** (AI response rendering)