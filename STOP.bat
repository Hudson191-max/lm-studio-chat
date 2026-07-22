@echo off
echo === Stopping LM Studio Chat (Next.js + Hound) ===
echo.
echo Killing any process on port 3000 (Next.js) and port 8765 (Hound MCP)...
echo.

node scripts/start-all.js --kill-all

echo.
echo Done. Both services have been stopped (if they were running).
echo.
pause
