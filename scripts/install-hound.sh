#!/usr/bin/env bash
# Install Hound MCP for web search.
# Requires Python 3.9+ and pip.
set -e

echo "Checking Python..."
if ! command -v python3 &> /dev/null; then
  echo "Python 3 is required but not installed."
  echo "  Install from https://www.python.org/downloads/"
  exit 1
fi
python3 --version

echo ""
echo "Installing hound-mcp (with all extras: fetch + crawl + search + PDF + OCR)..."
pip3 install "hound-mcp[all]"

echo ""
echo "Installing Playwright Chromium browser engine (for anti-bot fetch)..."
python3 -m playwright install chromium

echo ""
echo "Verifying install..."
hound --version

echo ""
echo "Done! Hound is installed."
echo "Start it with:  npm run start:hound"
echo "It will run at http://127.0.0.1:8765/mcp"
