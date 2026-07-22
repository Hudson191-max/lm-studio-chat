@echo off
REM Install Hound MCP for web search (Windows).
REM Requires Python 3.9+ and pip.

echo Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
  echo Python 3 is required but not installed.
  echo   Install from https://www.python.org/downloads/
  exit /b 1
)
python --version

echo.
echo Installing hound-mcp (with all extras: fetch + crawl + search + PDF + OCR)...
pip install "hound-mcp[all]"
if errorlevel 1 (
  echo Failed to install hound-mcp.
  exit /b 1
)

echo.
echo Installing Playwright Chromium browser engine (for anti-bot fetch)...
python -m playwright install chromium
if errorlevel 1 (
  echo Failed to install Playwright Chromium. Hound will run in HTTP-only mode.
)

echo.
echo Verifying install...
hound --version

echo.
echo Done! Hound is installed.
echo Start it with:  npm run start:hound
echo It will run at http://127.0.0.1:8765/mcp
