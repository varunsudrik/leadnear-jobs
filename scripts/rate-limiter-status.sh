#!/usr/bin/env bash
# Determine script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Activate virtualenv if it exists
if [ -d "${PROJECT_DIR}/.venv" ]; then
  source "${PROJECT_DIR}/.venv/bin/activate"
fi

# Run the python rate limiter status script
python3 "${SCRIPT_DIR}/rate-limiter-status.py" "$@"
