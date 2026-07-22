@echo off
echo === LM Studio Chat Setup ===
echo.

REM Create .env if missing
echo [0/3] Checking environment...
if not exist .env (
    if exist .env.example (
        copy .env.example .env >nul
        echo Created .env from .env.example
    ) else (
        echo DATABASE_URL=file:./db/custom.db > .env
        echo NEXTAUTH_SECRET=change-me-to-a-random-string >> .env
        echo Created .env with defaults
    )
) else (
    echo .env already exists, skipping
)

echo.
echo [1/3] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed!
    pause
    exit /b 1
)

echo.
echo [2/3] Setting up database...
if not exist db mkdir db
call npx prisma db push
if %errorlevel% neq 0 (
    echo ERROR: Database setup failed!
    pause
    exit /b 1
)

echo.
echo [3/3] Building and starting production server...
echo.
call npx next build
if %errorlevel% neq 0 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo === Server is starting! ===
echo Open http://localhost:3000 in your browser
echo Press Ctrl+C to stop the server (and Hound if running)
echo.
echo Hound MCP (web search) will auto-launch if installed.
echo To install it later: npm run install:hound
echo.

REM Auto-install Hound on first run (silent skip if Python missing or install fails)
where hound >nul 2>&1
if errorlevel 1 (
    echo Hound not detected. Attempting install...
    call npm run install:hound
    echo.
)

REM Start everything: Next.js + Hound (if available)
node scripts/start-all.js
