# LM Studio Chat

A full-featured web interface to chat with your local LM Studio AI from anywhere. Features multi-user authentication, streaming responses, conversation history, MCP tool execution with web search, LaTeX math rendering, document upload, and per-user rate limiting.

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

### Rich Content Rendering
- **LaTeX Math** — Inline (`$E=mc^2$`) and display (`$$...$$`) math rendered via KaTeX (works in both messages and reasoning/thinking fields)
- **Syntax-Highlighted Code** — Fenced code blocks with automatic language detection, GitHub Dark theme, and one-click copy button
- **Reasoning Display** — DeepSeek R1-style `reasoning_content` shown in a collapsible block with full math + code support
- **Document Upload** — Attach PDF, DOCX, TXT, MD, or CSV files; text is extracted and sent to the AI as context (10 MB cap, auto-truncates at 50k chars)

### Security & Multi-User
- **Login Authentication** — Scrypt-hashed passwords, JWT sessions (30-day expiry)
- **Per-User Data Isolation** — Every user has their own private conversations, settings, profiles, and MCP servers. No user can access another's data.
- **Per-User Rate Limiting** — Admin can set daily message and/or token limits per user (resets at midnight UTC). Admins are exempt.
- **Login Rate Limiting** — 5 attempts per 15 minutes, automatic lockout on failed logins
- **Security Headers** — X-Frame-Options, CSP, X-Content-Type-Options, Referrer-Policy
- **Password Management** — Change your password from within the app
- **Login Tracking** — Failed and successful login attempts are logged

### Admin Panel
- **User Management** — Create users, delete users, view conversation/message counts
- **Dashboard Stats** — Total users, conversations, messages, logins, messages today, active users today
- **Login Log** — Recent login attempts with IP, username, success/failure status
- **Rate Limit Management** — Set daily message and token limits per user with inline editing and live usage bars
- **Server Control** — Stop the server (Next.js + Hound) directly from the admin panel

### AI Features
- **System Prompts** — Set custom system prompts per conversation (e.g., "Answer in Dutch")
- **Message Editing** — Edit your sent messages and get a fresh AI response
- **Response Regeneration** — Regenerate the last AI response with one click
- **Conversation Branching** — Branch from any message to explore alternative reasoning paths without losing the original conversation
- **MCP Tool Execution** — Full tool-calling loop: when the AI requests a tool, it's executed via MCP and the result is fed back (up to 5 rounds)
- **Web Search (Hound MCP)** — Bundled free local web search with no API keys — search, fetch, crawl, and PDF/OCR
- **Conversation Export** — Download any conversation as a Markdown file

### Context & Usage
- **Token Usage Indicator** — Real-time progress bar showing what percentage of the model's context window is being used (green < 50%, yellow 50-80%, red > 80%)
- **Auto Model Detection** — Fetches available models and context window sizes from LM Studio on startup

### Organization
- **Model Profiles** — Save different LM Studio configurations and switch between them
- **Chat Search** — Full-text search across all your conversations
- **Dark/Light/System Theme** — Manual theme toggle or follow system preference
- **PWA Support** — Install as an app on your phone's home screen

### Deployment
- **One-Command Startup** — `START.bat` (Windows) or `npm run start:all` launches both Next.js and Hound MCP together
- **One-Click Stop** — `STOP.bat` or the admin panel stop button kills both services
- **Docker Support** — One-command deploy with Docker Compose
- **Cross-Platform** — Works on Windows, macOS, and Linux

---

## Prerequisites

Before you start, make sure you have:

1. **[Node.js](https://nodejs.org/)** version 18 or newer installed
   - Download from https://nodejs.org/ (pick the LTS version)
   - Verify: open a terminal and run `node --version`
2. **[LM Studio](https://lmstudio.ai/)** installed with a model loaded
   - Open LM Studio → load any model → click the **Local Server** icon (arrow/serve button on the left)
   - Make sure it says **Status: Running** on port `1234`
3. (Optional) **[Python 3.9+](https://www.python.org/downloads/)** for Hound web search
   - During install on Windows, check **"Add Python to PATH"**
   - Required only if you want the AI to have web search/fetch/crawl capabilities
4. (Optional) **[cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)** for remote access
5. (Optional) **[Docker](https://docs.docker.com/get-docker/)** for containerized deployment

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
   - Auto-installs Hound MCP if Python is available (`npm run install:hound`)
   - Starts both Next.js + Hound together via the orchestrator

3. Open **http://localhost:3000** in your browser and create your account
   - The first account created is automatically the **admin**

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
   copy .env.example .env        (Windows)
   cp .env.example .env          (Mac/Linux)
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

5. (Optional) Install Hound MCP for web search:
   ```
   npm run install:hound
   ```
   This requires Python 3.9+. Installs `hound-mcp[all]` + Playwright Chromium.

6. Start everything (Next.js + Hound):
   ```
   npm run build
   npm run start:all
   ```
   Or start only the chat app without Hound:
   ```
   npm run build
   npm run start
   ```

7. Open **http://localhost:3000** in your browser

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

## Stopping the Server

| Method | Command | What it does |
|--------|---------|-------------|
| **Windows** | Double-click `STOP.bat` | Stops Next.js + Hound |
| **CLI (all)** | `npm run stop:all` | Stops Next.js + Hound |
| **CLI** | `npm run stop:next` | Stops only Next.js |
| **CLI** | `npm run stop:hound` | Stops only Hound |
| **Admin Panel** | Click the red Power button | Stops Next.js + Hound from the UI |

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
The app detects if no account exists and shows a "Create Account" screen. Pick a username (3+ chars) and password (6+ chars). The **first account created becomes the admin**. After 5 failed login attempts, you'll be locked out for 15 minutes.

### Chatting
- Click **New Chat** in the sidebar to start a conversation
- Use the **System Prompt** bar at the top to set a custom system prompt for the conversation
- Type your message and press **Enter** to send (Shift+Enter for new line)
- Click the **pencil icon** on your messages to edit them
- Click the **refresh icon** on AI responses to regenerate
- Click the **branch icon** (GitBranch) on any message to fork the conversation from that point
- Click the **download icon** to export the conversation as Markdown
- Click the **paperclip/document icon** to attach PDF, DOCX, TXT, MD, or CSV files
- Paste or drag-and-drop images for vision models

### Footer Indicators
- **Left:** Number of active MCP tools
- **Right:** Token usage progress bar showing what percentage of the model's context window is used (green/yellow/red), plus "Connected to LM Studio"

### Settings (Sidebar)
- **Search Chats** — Full-text search across all conversations
- **Model Profiles** — Save and switch between different LM Studio configurations
- **MCP Tools** — Connect to MCP servers for tool-using AI (includes one-click Hound preset)
- **Settings** — LM Studio URL, model, temperature, max tokens, theme
- **Change Password** — Update your account password
- **Admin Panel** — (admin only) User management, stats, rate limits, server control
- **Sign Out** — End your session

### MCP (Model Context Protocol)
MCP lets you give your AI access to external tools (web search, file system, APIs, etc.):

1. Click **MCP Tools** in the sidebar
2. **Hound preset:** Click "Add to MCP" on the Hound card for instant free web search (auto-detects if Hound is running)
3. **Custom server:** Click "Add Server" and enter the MCP server's URL
4. The app will automatically discover available tools (supports both streamable HTTP and legacy protocols)
5. Toggle servers on/off to enable/disable their tools
6. When the AI calls a tool, it's **executed in real-time** and the result is fed back to the model (up to 5 rounds)
7. You'll see live status: `🔧 Calling tool...` → `⏳ Executing...` → `✅ returned N chars`

### Hound Web Search
[Hound](https://github.com/dondai1234/master-fetch) is a free, keyless MCP server that gives the AI:
- **`smart_search`** — Local web search across 10 backends with neural reranking (no API key needed)
- **`smart_fetch`** — Fetch any URL with anti-bot bypass (Cloudflare, DataDome)
- **`smart_crawl`** — Best-first same-domain crawl
- **`screenshot`** — Capture a page as an image
- **PDF/OCR** — Read scanned PDFs

**Setup:**
```bash
npm run install:hound    # one-time install (requires Python 3.9+)
npm run start:all        # starts Next.js + Hound together
```
Then in the app: MCP Tools → "Add to MCP" on the Hound card.

**Note:** Tool calling requires a model that supports OpenAI-style function calling (e.g. Qwen2.5, Llama 3.1+, Mistral). Enable "Function Calling" in LM Studio's model settings.

### Admin Panel
- **Stats Dashboard** — Users, chats, messages, logins, messages today, active today
- **Users Tab** — Create/delete users, view activity, set daily rate limits (messages + tokens)
- **Login Log Tab** — Recent login attempts with IP and status
- **Server Control** — Red Power button to stop the server

### Conversation Branching
Branch from any message to explore alternative paths:
1. Hover over any message in the chat
2. Click the **branch icon** (GitBranch)
3. A new conversation is created with all messages up to that point copied
4. The new conversation appears in the sidebar with "(branch)" suffix
5. Continue chatting from the fork point — the original conversation is untouched

---

## Development

```bash
# Server lifecycle
npm run dev              # Start dev server only (port 3000)
npm run dev:all          # Start dev server + Hound together
npm run build            # Build for production
npm run start            # Start production server only
npm run start:all        # Start production server + Hound together
npm run stop:all         # Stop both Next.js + Hound
npm run stop:next        # Stop only Next.js
npm run stop:hound       # Stop only Hound

# Hound MCP
npm run install:hound    # Install Hound + Playwright Chromium (one-time)
npm run start:hound      # Start Hound standalone (without Next.js)

# Database
npm run db:push          # Push Prisma schema changes to database
npm run db:generate      # Regenerate Prisma client
npm run db:reset         # Reset database (deletes all data)
```

### Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `file:./db/custom.db` | SQLite database path |
| `NEXTAUTH_SECRET` | (must set) | JWT signing secret — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `HOUND_PORT` | `8765` | Port for Hound MCP |
| `HOUND_HOST` | `127.0.0.1` | Host for Hound MCP |
| `APP_PORT` | `3000` | Port for Next.js |
| `SKIP_HOUND` | (unset) | Set to `1` to skip launching Hound even if installed |

---

## Project Structure

```
lm-studio-chat/
├── prisma/
│   └── schema.prisma              # Database models (Account, Conversation, Message, Settings, UsageRecord, etc.)
├── scripts/
│   ├── start-all.js               # Orchestrator: launches Next.js + Hound together
│   ├── start-hound.js             # Hound-only launcher
│   ├── install-hound.sh/.bat/.js  # Cross-platform Hound installer
│   └── ...
├── src/
│   ├── app/
│   │   ├── admin/                 # Admin panel page
│   │   ├── api/
│   │   │   ├── admin/             # Stats, user management, limits, stop-server
│   │   │   ├── auth/              # Login, setup, password change
│   │   │   ├── chat/              # Streaming proxy with MCP tool execution loop
│   │   │   ├── conversations/     # CRUD + export + branch
│   │   │   ├── messages/          # Edit/delete messages
│   │   │   ├── mcp/               # MCP server management + probe + stop-hound
│   │   │   ├── profiles/          # Model profiles
│   │   │   ├── search/            # Full-text search
│   │   │   ├── settings/          # Per-user app settings
│   │   │   ├── status/            # LM Studio health check + model info
│   │   │   └── upload/            # Document upload + text extraction
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── chat/                  # Auth, sidebar, messages, input, dialogs, code-block, markdown-content
│   │   └── ui/                    # shadcn/ui components
│   ├── lib/
│   │   ├── auth.ts                # Scrypt password hashing
│   │   ├── auth-guard.ts          # Route protection + requireValidAuth
│   │   ├── db.ts                  # Prisma client
│   │   ├── mcp-client.ts          # MCP client (discovery + tool execution)
│   │   ├── rate-limit.ts          # Login rate limiter
│   │   └── rate-limit-usage.ts    # Per-user daily usage tracking
│   ├── store/
│   │   └── chat-store.ts          # Zustand state management
│   └── types/
├── public/
│   ├── manifest.json              # PWA manifest
│   ├── sw.js                      # Service worker
│   └── logo.svg
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── START.bat                      # One-click setup + launch (Windows)
├── STOP.bat                       # One-click stop (Windows)
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
- **[remark-math](https://github.com/remarkjs/remark-math) + [rehype-katex](https://github.com/remarkjs/remark-math)** — LaTeX math rendering
- **[rehype-highlight](https://github.com/rehypejs/rehype-highlight) + [highlight.js](https://highlightjs.org/)** — Code syntax highlighting
- **[pdf-parse](https://www.npmjs.com/package/pdf-parse)** — PDF text extraction
- **[mammoth](https://www.npmjs.com/package/mammoth)** — DOCX text extraction
- **[Hound MCP](https://github.com/dondai1234/master-fetch)** — Free local web search (optional, requires Python)
- **[MCP](https://modelcontextprotocol.io/)** — Model Context Protocol support

## Disclaimer

> **This project was generated entirely by AI (GLM / Z.ai).** The code is provided as-is for educational and personal use.
>
> - **No warranty** — This software is provided "as is" without warranty of any kind, express or implied. Use at your own risk.
> - **Security** — While basic security measures are in place (scrypt password hashing, JWT sessions, rate limiting, security headers, per-user data isolation), this is a personal project, not a production-hardened application. The author assumes no responsibility for data breaches, unauthorized access, or any security incidents.
> - **Data privacy** — All data (messages, account credentials, conversations) is stored **locally on your machine** in a SQLite database. No data is sent to any third-party server except LM Studio running on your own PC. However, if you expose the server via Cloudflare Tunnel, you are responsible for securing access.
> - **No liability** — The author is not responsible for any leaks, data loss, system damage, or any other issues arising from the use of this software. You are solely responsible for how you deploy, configure, and use this tool.
> - **Not audited** — This code has not been professionally security-audited. If you plan to expose it to the internet, consider additional security measures (HTTPS, rate limiting, fail2ban, etc.).
>
> By using this software, you accept full responsibility for any consequences.
>
## contact

If you have any questions, need help, or want to report a bug, feel free to reach out:

**DM me on Discord:** @djdries — [Profile Link](https://discord.com/users/YOUR_NUMERIC_ID)

## License

MIT
