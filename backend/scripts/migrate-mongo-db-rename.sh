#!/usr/bin/env bash
#
# migrate-mongo-db-rename.sh — executes the copy-based database rename
# described in docs/organization/mongo-database-naming-remediation.md
# (Steps 1, 3, 4 of that plan). This script does NOT perform the write
# freeze (Step 2) or the Render cutover (Step 5) — those require Render
# dashboard/API access and a deliberate maintenance-window decision that
# only a human operator with production access should make.
#
# Requires: mongodump, mongorestore, mongosh (or `mongo`) on PATH, and
# MONGODB_URI pointing at the production Atlas cluster (same secret used
# by the Render `td-it-solution-insurance` service — read from the
# environment or repo-root .env.local, NEVER hardcoded here).
#
# This script is READ+COPY only against the source: it never drops or
# writes to the source (`test`) database. It creates a NEW database
# (default name: td_it_insurance_production) via mongorestore. Nothing
# is deleted at any point. Re-running mongorestore against an existing
# target is safe to abort (Ctrl-C) before it starts — it only starts
# writing once invoked.
#
# Usage:
#   MONGODB_URI="mongodb+srv://...">
#     ./backend/scripts/migrate-mongo-db-rename.sh \
#       --source-db test \
#       --target-db td_it_insurance_production \
#       --backup-dir /path/outside/repo
#
# Exit non-zero on any failure; each step is fail-fast (set -euo pipefail).

set -euo pipefail

SOURCE_DB="test"
TARGET_DB="td_it_insurance_production"
BACKUP_DIR="$(pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-db) SOURCE_DB="$2"; shift 2 ;;
    --target-db) TARGET_DB="$2"; shift 2 ;;
    --backup-dir) BACKUP_DIR="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "${MONGODB_URI:-}" ]]; then
  echo "MONGODB_URI is not set. Refusing to run." >&2
  exit 1
fi

for bin in mongodump mongorestore mongosh; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "Required tool '$bin' not found on PATH. Install the MongoDB Database Tools + mongosh first." >&2
    exit 1
  fi
done

TIMESTAMP="$(date +%Y%m%dT%H%M%S)"
ARCHIVE_PATH="${BACKUP_DIR%/}/pre-migration-${SOURCE_DB}-${TIMESTAMP}.archive.gz"

echo "=== Step 0: pre-migration baseline (source: ${SOURCE_DB}) ==="
mongosh "$MONGODB_URI" --quiet --eval "
  const db = db.getSiblingDB('${SOURCE_DB}');
  const names = db.getCollectionNames().sort();
  const counts = {};
  for (const n of names) counts[n] = db.getCollection(n).estimatedDocumentCount();
  printjson({ database: '${SOURCE_DB}', collections: names, counts });
"

echo ""
echo "REVIEW the counts above. This script does NOT proceed automatically past"
echo "this point — it stops here so a human confirms these numbers match the"
echo "expected baseline (e.g. inc-001-location-inventory.ts output) before any"
echo "backup or copy is taken. Re-run with --confirm to continue past this gate."
echo ""

if [[ "${1:-}" != "--confirm" ]]; then
  echo "Stopping before backup/copy. Re-invoke with a trailing --confirm once the"
  echo "baseline above has been reviewed and Step 2 (write freeze) is already in"
  echo "effect on the Render service."
  exit 0
fi

echo "=== Step 1: backup (mongodump, full database, includes indexes) ==="
mongodump --uri="$MONGODB_URI" --db="$SOURCE_DB" --archive="$ARCHIVE_PATH" --gzip
echo "Backup written to: $ARCHIVE_PATH"
echo "Store this file somewhere durable OUTSIDE this repo/machine before continuing."

echo "=== Step 3: restore into target database with namespace rename ==="
echo "PRE-CONDITION (not verified by this script): confirm the Render production"
echo "service is currently write-frozen (scaled to zero or maintenance-flagged),"
echo "otherwise writes made to '${SOURCE_DB}' between the mongodump above and this"
echo "restore will NOT be reflected in '${TARGET_DB}'."
read -r -p "Type YES to confirm the write freeze is in effect and continue: " CONFIRM
if [[ "$CONFIRM" != "YES" ]]; then
  echo "Aborting before restore. No data was copied to ${TARGET_DB}."
  exit 1
fi

mongorestore --uri="$MONGODB_URI" \
  --nsFrom="${SOURCE_DB}.*" --nsTo="${TARGET_DB}.*" \
  --archive="$ARCHIVE_PATH" --gzip

echo "=== Step 4: verify target against source baseline ==="
mongosh "$MONGODB_URI" --quiet --eval "
  const src = db.getSiblingDB('${SOURCE_DB}');
  const dst = db.getSiblingDB('${TARGET_DB}');
  const names = src.getCollectionNames().sort();
  let mismatch = false;
  const rows = [];
  for (const n of names) {
    const a = src.getCollection(n).estimatedDocumentCount();
    const b = dst.getCollection(n).estimatedDocumentCount();
    if (a !== b) mismatch = true;
    rows.push({ collection: n, source: a, target: b, match: a === b });
  }
  printjson({ source: '${SOURCE_DB}', target: '${TARGET_DB}', rows, allMatch: !mismatch });
  if (mismatch) {
    print('MISMATCH DETECTED — DO NOT PROCEED TO CUTOVER (Step 5). Investigate before setting MONGODB_DB_NAME on Render.');
  } else {
    print('All collection counts match. Safe to proceed to Step 5 (Render env var + redeploy) per the runbook.');
  }
"

echo ""
echo "This script stops here. Remaining steps (per"
echo "docs/organization/mongo-database-naming-remediation.md Step 5/6) require"
echo "Render dashboard/API access and are NOT automated by this script:"
echo "  1. Set MONGODB_DB_NAME=${TARGET_DB} on the Render production service."
echo "  2. Add the equivalent envVars entry to render.yaml (value:, not sync: false)."
echo "  3. Redeploy/restart the service."
echo "  4. Health check + authenticated read-path check."
echo "  5. Lift the write freeze."
echo "  6. Leave '${SOURCE_DB}' in place, untouched, for the retention window (recommend 30 days) as rollback."
