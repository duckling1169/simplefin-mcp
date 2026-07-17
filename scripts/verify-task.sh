#!/bin/sh
set -eu

# Canonical non-interactive verification entry point for the outer runner and CI.
# Runs lint, typecheck, test, and build in sequence, exiting non-zero on any failure.

cd "$(dirname "$0")/.."
pnpm run verify
