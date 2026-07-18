# LM Studio Chat

A web interface to chat with your local LM Studio AI from anywhere. Features login authentication, streaming responses, conversation history, and Cloudflare Tunnel support for remote access.

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **Login Authentication** — Scrypt-hashed passwords, JWT sessions (30-day expiry)
- **Streaming Chat** — Real-time streaming responses from LM Studio's OpenAI-compatible API
- **Conversation History** — Save, rename, and delete conversations (SQLite/Prisma)
- **Model Selection** — Pick models loaded in LM Studio, adjust temperature and max tokens
- **Remote Access** — Use Cloudflare Tunnel to access from anywhere with internet
- **Mobile Responsive** — Works on phones and tablets
- **Dark Mode** — Automatic system theme detection

## Prerequisites

Before you start, make sure you have:

1. **[Node.js](https://nodejs.org/)** version 18 or newer installed
   - Download from https://nodejs.org/ (pick the LTS version)
   - Verify: open a terminal and run `node --version`
2. **[LM Studio](https://lmstudio.ai/)** installed with a model loaded
   - Open LM Studio → load any model → click the **Local Server** icon (the arrow/serve button on the left)
   - Make sure it says **Status: Running** on port `1234`
3. (Optional) **[cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)** for remote access

---

## Installation

### Option A: Automatic Setup (Windows)

1. Download or clone this repository:
   ```
   git clone https://github.com/Hudson191-max/lm-studio-chat.git
   cd lm-studio-chat
   ```

2. Double-click **`START.bat`** — it does everything automatically:
   - Installs all dependencies (`npm install`)
   - Creates the database (`prisma db push`)
   - Builds the production server (`next build`)
   - Starts the server (`next start -p 3000`)

3. Open **http://localhost:3000** in your browser and create your account

### Option B: Manual Setup (Windows / Mac / Linux)

1. Clone the repository:
   ```
   git clone https://github.com/Hudson191-max/lm-studio-chat.git
   cd lm-studio-chat
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create the `.env` file by copying the example:
   ```
   copy .env.example .env
   ```
   Then open `.env` in a text editor and change the `NEXTAUTH_SECRET` to a random string. Generate one with:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. Set up the database:
   ```
   mkdir db
   npx prisma db push
   ```

5. Build and start:
   ```
   npx next build
   npx next start -p 3000
   ```

6. Open **http://localhost:3000** in your browser

---

## Accessing From Anywhere (Cloudflare Tunnel)

This lets you use your LM Studio chat from your phone, another computer, or anywhere with internet — as long as your PC is on and the server is running.

### One-Time Setup

1. Download **cloudflared** from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
   - **Windows:** Download the `.msi` installer and run it
   - **Mac:** `brew install cloudflared`
   - **Linux:** `sudo apt install cloudflared`

### Every Time You Want Remote Access

1. Start the chat server (if not already running):
   ```
   npx next start -p 3000
   ```

2. Open a **second** terminal and run:
   ```
   cloudflared tunnel --url http://localhost:3000
   ```

3. It will print a URL like:
   ```
   https://random-words-here.trycloudflare.com
   ```
   Open that URL on **any device** — phone, tablet, another computer, etc.

4. The URL changes every time you restart cloudflared (free tunnels are temporary). To get a **permanent** URL, create a free Cloudflare account and set up a named tunnel.

### Important Notes
- Make sure LM Studio is running with the local server started **before** you chat
- Your PC must stay on and both terminals must stay open
- The free tunnel URL changes each time — bookmark it while it lasts

---

## Usage

### First Visit
When you first open the app, you'll see a **"Create Account"** screen. Pick a username (3+ characters) and password (6+ characters). This is your only account — the app is single-user.

### Chatting
- Click **New Chat** in the sidebar to start a conversation
- Type your message and press **Enter** to send (Shift+Enter for a new line)
- The AI response streams in real-time with markdown formatting
- Conversations are automatically saved and titled

### Settings
Click the **Settings** button in the sidebar to:
- Change the LM Studio server URL (default: `http://localhost:1234/v1`)
- Select which model to use
- Adjust temperature (0 = precise, 2 = creative)
- Adjust max tokens (response length limit)

### Sign Out
Click **Sign Out** in the sidebar or the logout icon in the top-right corner.

---

## Development

```bash
npm run dev          # Start dev server on port 3000 (with hot reload)
npm run build        # Build for production
npm run start        # Start production server
npm run db:push      # Push Prisma schema changes to database
npm run db:generate  # Regenerate Prisma client
```

---

## Project Structure

```
lm-studio-chat/
├── prisma/
│   └── schema.prisma        # Database models (SQLite)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/        # NextAuth login + setup
│   │   │   ├── chat/        # Streaming proxy to LM Studio
│   │   │   ├── conversations/# CRUD for chat history
│   │   │   ├── settings/    # LM Studio config
│   │   │   └── status/      # Connection health check
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── chat/            # Auth, sidebar, messages, input, settings
│   │   └── ui/              # shadcn/ui components
│   ├── hooks/
│   ├── lib/
│   │   ├── auth.ts          # Password hashing (scrypt)
│   │   ├── auth-guard.ts    # Route protection
│   │   └── db.ts            # Prisma client
│   ├── store/
│   │   └── chat-store.ts    # Zustand state
│   └── types/
├── .env.example
├── .gitignore
├── START.bat                # One-click Windows setup
├── next.config.js
├── package.json
├── postcss.config.mjs
└── tsconfig.json
```

## Tech Stack

- **[Next.js 15](https://nextjs.org/)** — React framework (App Router)
- **[NextAuth.js v4](https://next-auth.js.org/)** — Authentication (Credentials + JWT)
- **[Prisma](https://www.prisma.io/)** — Database ORM
- **[SQLite](https://sqlite.org/)** — Embedded database (zero config)
- **[Zustand](https://zustand-demo.pmnd.rs/)** — Client state management
- **[shadcn/ui](https://ui.shadcn.com/)** — UI component library
- **[Tailwind CSS](https://tailwindcss.com/)** — Utility-first CSS
- **[react-markdown](https://github.com/remarkjs/react-markdown)** — Markdown rendering

## Disclaimer

> **This project was generated entirely by AI (GLM / Z.ai).** The code is provided as-is for educational and personal use.
>
> - **No warranty** — This software is provided "as is" without warranty of any kind, express or implied. Use at your own risk.
> - **Security** — While basic security measures are in place (scrypt password hashing, JWT sessions), this is a personal project, not a production-hardened application. The author assumes no responsibility for data breaches, unauthorized access, or any security incidents.
> - **Data privacy** — All data (messages, account credentials, conversations) is stored **locally on your machine** in a SQLite database. No data is sent to any third-party server except LM Studio running on your own PC. However, if you expose the server via Cloudflare Tunnel, you are responsible for securing access.
> - **No liability** — The author is not responsible for any leaks, data loss, system damage, or any other issues arising from the use of this software. You are solely responsible for how you deploy, configure, and use this tool.
> - **Not audited** — This code has not been professionally security-audited. If you plan to expose it to the internet, consider additional security measures (HTTPS, rate limiting, fail2ban, etc.).
>
> By using this software, you accept full responsibility for any consequences.

## License

MIT