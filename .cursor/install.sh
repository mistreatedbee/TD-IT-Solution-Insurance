#!/usr/bin/env bash
#
# Cloud Agent install step for the TD IT Solution Insurance monorepo.
#
# The repo is three independent npm projects with their own lockfiles
# (ADR-0001 service decomposition): the web app at the repo root, the
# Node/TS backend API in backend/, and the Expo app in mobile/. Each is
# installed from its own lockfile so the tree matches CI exactly.
#
# Idempotent: `npm ci` recreates node_modules deterministically from the
# committed lockfile on every run, so re-running converges rather than
# drifting.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

install_project() {
  local dir="$1"
  echo "==> npm ci in ${dir}"
  ( cd "${dir}" && npm ci --no-audit --fund=false )
}

install_project "${repo_root}"          # web (React 18 + Vite)
install_project "${repo_root}/backend"  # backend API (Node.js + TS)
install_project "${repo_root}/mobile"   # mobile app (Expo)

echo "==> install complete"
