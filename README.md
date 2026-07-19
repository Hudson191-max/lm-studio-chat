# LM Studio Chat

A full-featured web interface to chat with your local LM Studio AI from anywhere. Features authentication, streaming responses, conversation history, MCP tool support, and Cloudflare Tunnel access.

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

### Core
- **Streaming Chat** — Real-time streaming responses from LM Studio's OpenAI-compatible API
- **Conversation History** — Save, rename, delete, and search conversations (SQLite/Prisma)
- **Model Selection** — Pick models loaded in LM Studio, adjust temperature and max tokens
- **Remote Access** — Use Cloudflare Tunnel to access from anywhere with internet
- **Mobile Responsive** — Works on phones and tablets, PWA installable

### Security
- **Login Authentication** — Scrypt-hashed passwords, JWT sessions (30-day expiry)
- **Rate Limiting** — 5 attempts per 15 minutes, automatic lockout on failed logins
- **Security Headers** — X-Frame-Options, CSP, X-Content-Type-Options, Referrer-Policy
- **Password Management** — Change your password from within the app
- **Login Tracking** — Failed and successful login attempts are logged

### AI Features
- **System Prompts** — Set custom system prompts per conversation (e.g., "Answer in Dutch")
- **Message Editing** — Edit your sent messages and get a fresh AI response
- **Response Regeneration** — Regenerate the last AI response with one click
- **MCP Tool Support** — Connect to Model Context Protocol servers to give the AI access to external tools
- **Conversation Export** — Download any conversation as a Markdown file

### Organization
- **Model Profiles** — Save different LM Studio configurations and switch between them
- **Chat Search** — Full-text search across all your conversations
- **Dark/Light/System Theme** — Manual theme toggle or follow system preference
- **PWA Support** — Install as an app on your phone's home screen

### Deployment
- **Docker Support** — One-command deploy with Docker Compose
- **Windows Batch Setup** — Double-click `START.bat` to install, build, and run

---

## Prerequisites

Before you start, make sure you have:

1. **[Node.js](https://nodejs.org/)** version 18 or newer installed
   - Download from https://nodejs.org/ (pick the LTS version)
   - Verify: open a terminal and run `node --version`
2. **[LM Studio](https://lmstudio.ai/)** installed with a model loaded
   - Open LM Studio → load any model → click the **Local Server** icon (arrow/serve button on the left)
   - Make sure it says **Status: Running** on port `1234`
3. (Optional) **[cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)** for remote access
4. (Optional) **[Docker](https://docs.docker.com/get-docker/)** for containerized deployment

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
   Then open `.env` and change `NEXTAUTH_SECRET` to a random string:
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

### Option C: Docker

1. Clone the repo and create `.env`:
   ```
   git clone https://github.com/Hudson191-max/lm-studio-chat.git
   cd lm-studio-chat
   cp .env.example .env
   # Edit .env and set NEXTAUTH_SECRET
   ```

2. Build and run:
   ```
   docker compose up -d --build
   ```

3. Open **http://localhost:3000** — your data is persisted in a Docker volume

---

## Accessing From Anywhere (Cloudflare Tunnel)

1. Download **cloudflared** from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
2. Start the chat server first (if not already running)
3. Open a second terminal and run:
   ```
   cloudflared tunnel --url http://localhost:3000
   ```
4. Open the `https://xxxx.trycloudflare.com` URL on any device

For a **permanent** URL, create a free Cloudflare account and set up a named tunnel.

---

## Usage

### First Visit
The app detects if no account exists and shows a "Create Account" screen. Pick a username (3+ chars) and password (6+ chars). After 5 failed login attempts, you'll be locked out for 15 minutes.

### Chatting
- Click **New Chat** in the sidebar to start a conversation
- Use the **System Prompt** bar at the top to set a custom system prompt for the conversation
- Type your message and press **Enter** to send (Shift+Enter for new line)
- Click the **pencil icon** on your messages to edit them
- Click the **refresh icon** on AI responses to regenerate
- Click the **download icon** to export the conversation as Markdown

### Settings (Sidebar)
- **Search Chats** — Full-text search across all conversations
- **Model Profiles** — Save and switch between different LM Studio configurations
- **MCP Tools** — Connect to MCP servers for tool-using AI
- **Settings** — LM Studio URL, model, temperature, max tokens, theme
- **Change Password** — Update your account password
- **Sign Out** — End your session

### MCP (Model Context Protocol)
MCP lets you give your AI access to external tools (web search, file system, APIs, etc.):

1. Click **MCP Tools** in the sidebar
2. Click **Add Server** and enter the MCP server's SSE URL
3. The app will automatically discover available tools
4. Toggle servers on/off to enable/disable their tools
5. Tools are automatically included in chat requests to LM Studio

---

## Development

```bash
npm run dev          # Start dev server on port 3000
npm run build        # Build for production
npm run start        # Start production server
npm run db:push      # Push Prisma schema changes to database
npm run db:generate  # Regenerate Prisma client
npm run db:reset     # Reset database (deletes all data)
```

---

## Project Structure

```
lm-studio-chat/
├── prisma/
│   └── schema.prisma           # Database models
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/           # Login, setup, password change
│   │   │   ├── chat/           # Streaming proxy with MCP tools
│   │   │   ├── conversations/  # CRUD + export
│   │   │   ├── messages/       # Edit/delete messages
│   │   │   ├── mcp/            # MCP server management
│   │   │   ├── profiles/       # Model profiles
│   │   │   ├── search/         # Full-text search
│   │   │   ├── settings/       # App settings
│   │   │   └── status/         # LM Studio health check
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── chat/               # Auth, sidebar, messages, input, all dialogs
│   │   └── ui/                 # shadcn/ui components
│   ├── lib/
│   │   ├── auth.ts             # Scrypt password hashing
│   │   ├── auth-guard.ts       # Route protection
│   │   ├── db.ts               # Prisma client
│   │   └── rate-limit.ts       # Login rate limiter
│   ├── store/
│   │   └── chat-store.ts       # Zustand state management
│   └── types/
├── public/
│   ├── manifest.json           # PWA manifest
│   ├── sw.js                   # Service worker
│   └── logo.svg
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── START.bat
└── package.json
```

## Tech Stack

- **[Next.js 15](https://nextjs.org/)** — React framework (App Router)
- **[NextAuth.js v4](https://next-auth.js.org/)** — Authentication (Credentials + JWT)
- **[Prisma](https://www.prisma.io/)** — Database ORM
- **[SQLite](https://sqlite.org/)** — Embedded database (zero config)
- **[Zustand](https://zustand-demo.pmnd.rs/)** — Client state management
- **[shadcn/ui](https://ui.shadcn.com/)** — UI component library
- **[Tailwind CSS](https://tailwindcss.com/)** — Utility-first CSS
- **[next-themes](https://github.com/pacocoursey/next-themes)** — Dark/light mode
- **[react-markdown](https://github.com/remarkjs/react-markdown)** — Markdown rendering
- **[MCP](https://modelcontextprotocol.io/)** — Model Context Protocol support

## Disclaimer

> **This project was generated entirely by AI (GLM / Z.ai).** The code is provided as-is for educational and personal use.
>
> - **No warranty** — This software is provided "as is" without warranty of any kind, express or implied. Use at your own risk.
> - **Security** — While basic security measures are in place (scrypt password hashing, JWT sessions, rate limiting, security headers), this is a personal project, not a production-hardened application. The author assumes no responsibility for data breaches, unauthorized access, or any security incidents.
> - **Data privacy** — All data (messages, account credentials, conversations) is stored **locally on your machine** in a SQLite database. No data is sent to any third-party server except LM Studio running on your own PC. However, if you expose the server via Cloudflare Tunnel, you are responsible for securing access.
> - **No liability** — The author is not responsible for any leaks, data loss, system damage, or any other issues arising from the use of this software. You are solely responsible for how you deploy, configure, and use this tool.
> - **Not audited** — This code has not been professionally security-audited. If you plan to expose it to the internet, consider additional security measures (HTTPS, rate limiting, fail2ban, etc.).
>
> By using this software, you accept full responsibility for any consequences.

## License

MIT