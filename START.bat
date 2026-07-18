@echo off
echo === LM Studio Chat Setup ===
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
call npx next start -p 3000