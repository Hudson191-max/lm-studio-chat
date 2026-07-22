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
echo === Server is running! ===
echo Open http://localhost:3000 in your browser
echo Press Ctrl+C to stop the server
echo.
echo Want web search? Open a SECOND terminal and run:
echo   npm run start:hound
echo Then click "Add to MCP" in the chat app's MCP Tools dialog.
echo.
call npx next start -p 3000
