@echo off
REM Install Hound MCP for web search (Windows).
REM Requires Python 3.9+ and pip.

echo Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
  echo Python 3 is required but not installed.
  echo   Install from https://www.python.org/downloads/
  echo   Make sure to check "Add Python to PATH" during install!
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
echo Looking for hound.exe in common locations...
where hound 2>nul
if errorlevel 1 (
  echo.
  echo WARNING: 'hound' is not on your PATH. This is common on Windows when
  echo Python's Scripts directory isn't in PATH. The orchestrator will search
  echo common install locations automatically, but if it can't find hound:
  echo.
  echo   1. Find where pip installed it:
  echo        python -c "import sysconfig; print(sysconfig.get_path('scripts'))"
  echo   2. Add that directory to your PATH, OR
  echo   3. Run hound directly with the full path.
  echo.
) else (
  hound --version
)

echo.
echo Done! Hound is installed.
echo Start the full app with:  npm run start:all  (or START.bat)
echo Hound will run at http://127.0.0.1:8765/mcp
