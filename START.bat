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

REM Check if Hound is installed; if not, try to install it
where hound >nul 2>&1
if errorlevel 1 (
    echo.
    echo --- Hound not detected. Attempting install ---
    echo This requires Python 3.9+ and pip. If install fails, the chat app
    echo will still run — you just won't have web search.
    echo.
    call npm run install:hound
    if errorlevel 1 (
        echo.
        echo WARNING: Hound install failed. The chat app will start without
        echo web search. You can retry later with: npm run install:hound
        echo.
    )
    echo.
)

REM Start everything: Next.js + Hound (if available)
echo ============================================================
echo  Starting LM Studio Chat + Hound (if available)...
echo  Keep this window open while using the app.
echo  Press Ctrl+C to stop both services.
echo ============================================================
echo.
node scripts/start-all.js

REM If we get here, the orchestrator exited (crash or Ctrl+C). Keep window open.
echo.
echo ============================================================
echo  Server has stopped.
echo ============================================================
echo.
echo If the server crashed unexpectedly, check the messages above.
echo.
pause
