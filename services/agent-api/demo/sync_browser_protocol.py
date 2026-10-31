"""Package the single canonical action schema for the unpacked extension."""

import argparse
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--check", action="store_true")
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
source = root / "services/agent-api/src/cortex_agent_api/browser_protocol.json"
target = root / "apps/chrome-extension/protocol.json"
if args.check:
    if source.read_bytes() != target.read_bytes():
        raise SystemExit("Run python services/agent-api/demo/sync_browser_protocol.py")
else:
    target.write_bytes(source.read_bytes())
