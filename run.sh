#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt
echo "Starting RescueNet at http://127.0.0.1:8000"
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
