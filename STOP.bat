@echo off
echo === Stopping Hound MCP ===
echo.
echo Looking for any process on port 8765 (Hound's default port)...
echo.

node scripts/start-all.js --kill-hound

echo.
echo Done. If Hound was running, it has been stopped.
echo.
pause
