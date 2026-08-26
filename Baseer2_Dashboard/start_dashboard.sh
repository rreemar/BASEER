#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo "BASEER 2 Dashboard: http://localhost:8080"
python3 -m http.server 8080
