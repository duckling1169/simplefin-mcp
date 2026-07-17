#!/bin/sh
set -eu

root=${1:-AGENTS.md}
max_bytes=${AGENTS_MAX_BYTES:-4000}
max_lines=${AGENTS_MAX_LINES:-80}
max_tokens=${AGENTS_MAX_ESTIMATED_TOKENS:-600}
max_total_bytes=${AGENTS_MAX_TOTAL_BYTES:-8000}
max_total_lines=${AGENTS_MAX_TOTAL_LINES:-160}
mode=${AGENTS_CHECK_MODE:-warn}
claude_file=${CLAUDE_FILE:-CLAUDE.md}
contributing_file=${CONTRIBUTING_FILE:-CONTRIBUTING.md}

case "$mode" in
  warn|fail) ;;
  *) echo "invalid AGENTS_CHECK_MODE: $mode (expected warn or fail)" >&2; exit 1 ;;
esac

if [ ! -f "$root" ]; then
  echo "missing: $root" >&2
  exit 1
fi

status=0
report_problem() {
  echo "$1" >&2
  status=2
}

files=$(find . -name AGENTS.md -type f -not -path './.git/*' | sort)
aggregate_bytes=0
aggregate_lines=0
for file in $files; do
  bytes=$(wc -c < "$file" | tr -d ' ')
  lines=$(wc -l < "$file" | tr -d ' ')
  tokens=$(( (bytes + 3) / 4 ))
  aggregate_bytes=$((aggregate_bytes + bytes))
  aggregate_lines=$((aggregate_lines + lines))
  echo "$file: $bytes bytes, $lines lines, approximately $tokens tokens"
done

root_bytes=$(wc -c < "$root" | tr -d ' ')
root_lines=$(wc -l < "$root" | tr -d ' ')
root_tokens=$(( (root_bytes + 3) / 4 ))

if [ "$root_bytes" -gt "$max_bytes" ] || [ "$root_lines" -gt "$max_lines" ] || [ "$root_tokens" -gt "$max_tokens" ]; then
  report_problem "instruction budget exceeded for $root ($max_bytes bytes / $max_lines lines / approximately $max_tokens tokens)"
fi

if [ "$aggregate_bytes" -gt "$max_total_bytes" ] || [ "$aggregate_lines" -gt "$max_total_lines" ]; then
  report_problem "aggregate AGENTS.md budget exceeded ($max_total_bytes bytes / $max_total_lines lines)"
fi

if [ -f "$claude_file" ]; then
  claude_content=$(tr -d '\r\n' < "$claude_file")
  if [ "$claude_content" != '@AGENTS.md' ]; then
    report_problem "$claude_file must contain exactly @AGENTS.md to avoid duplicated instructions"
  fi
fi

if ! grep -Fq 'CONTRIBUTING.md' "$root"; then
  report_problem "$root should point to CONTRIBUTING.md as the canonical shared workflow"
fi

if [ ! -f "$contributing_file" ]; then
  report_problem "missing: $contributing_file"
else
  if ! grep -Eiq 'source of truth|canonical.*workflow' "$contributing_file"; then
    report_problem "$contributing_file should identify itself as the canonical shared contribution workflow"
  fi
  if grep -Eiq '^([[:space:]]*[-*][[:space:]]*)?(setup|fast check|full check|build):[[:space:]]*`?\[' "$contributing_file"; then
    report_problem "$contributing_file appears to duplicate command placeholders owned by $root"
  fi
fi

if grep -Eiq 'write clean code|follow best practices|be concise|be careful|do not refactor unrelated code|smallest coherent change' "$root"; then
  report_problem "$root contains likely generic guidance; keep only concrete, repository-specific requirements"
fi

if grep -Eiq '^## (branches|worktrees|pull requests|handoff|review policy|planning process)' "$root"; then
  report_problem "$root appears to contain durable workflow policy; keep that in $contributing_file"
fi

file_count=$(printf '%s\n' "$files" | sed '/^$/d' | wc -l | tr -d ' ')
if [ "$file_count" -gt 1 ]; then
  echo "note: nested AGENTS.md files detected; verify each resolves a measured recurring local conflict" >&2
fi

placeholder_files=$(find . -name '*.md' -type f -not -path './.git/*' \
  -exec grep -lE '\[[^]]*(command|repository-specific)|\[approval|\[required checks' {} + 2>/dev/null || true)
if [ -n "$placeholder_files" ]; then
  echo "note: unresolved template placeholders detected; replace or delete them when adopting the template" >&2
fi

echo "aggregate AGENTS.md context: $aggregate_bytes bytes, $aggregate_lines lines, approximately $(( (aggregate_bytes + 3) / 4 )) tokens"

if [ "$status" -ne 0 ]; then
  echo "move inferable, task-specific, or rarely used detail to tooling or on-demand docs" >&2
  if [ "$mode" = fail ]; then
    exit "$status"
  fi
  echo "warning only; set AGENTS_CHECK_MODE=fail in CI to block" >&2
fi