#!/usr/bin/env bash
# Live smoke tests for BrightDesk. Asks a small set of questions
# whose expected trust-loop branch is stable, then asserts on the
# response. Run AFTER the demo seed so the data layer is known.
#
# Usage:
#   ./scripts/smoke-test.sh                         # defaults to live Railway
#   BASE_URL=http://localhost:3000 ./scripts/smoke-test.sh
#
# Exits non-zero on any assertion failure. Designed to fail loud in
# CI — if a smoke test breaks, the demo is in a bad state.

set -euo pipefail

BASE_URL="${BASE_URL:-https://app-production-6f11.up.railway.app}"
API="${BASE_URL}/api/ask"

PASS=0
FAIL=0

# ask JSON-posts a question, returns the raw response body on stdout.
ask() {
  curl -fsS -X POST "$API" \
    -H "Content-Type: application/json" \
    -d "$(python3 -c "import json,sys; print(json.dumps({'question': sys.argv[1]}))" "$1")"
}

# Run a single assertion. First arg is a label, second is a python
# expression that evaluates against `d` (the parsed response dict).
# Third arg is the question to ask.
assert() {
  local label="$1"
  local question="$2"
  local check="$3"
  local response
  response="$(ask "$question")"
  local result
  result=$(python3 -c "
import json, sys
d = json.loads(sys.argv[1])
ok = bool(${check})
print('PASS' if ok else 'FAIL')
if not ok:
    print(json.dumps(d, indent=2), file=sys.stderr)
" "$response")

  if [[ "$result" == "PASS" ]]; then
    echo "✓ $label"
    PASS=$((PASS + 1))
  else
    echo "✗ $label"
    echo "  question: $question"
    echo "  check:    $check"
    FAIL=$((FAIL + 1))
  fi
}

echo "Running smoke tests against ${BASE_URL}"
echo

# --- Grounded answer path ---
assert "grounded: hours question returns high-confidence answer with citation" \
  "What are your hours?" \
  "d.get('confidence') == 'high' and not d.get('escalate') and 'hours' in d.get('cited_entries', [])"

assert "grounded: meals question returns high-confidence answer with citation" \
  "Do you provide lunch and snacks?" \
  "d.get('confidence') == 'high' and not d.get('escalate') and 'meals' in d.get('cited_entries', [])"

# --- Override correction path (the tuition bug) ---
assert "override correction: sibling discount reflects the override (5%)" \
  "Is there a sibling discount?" \
  "d.get('confidence') == 'high' and not d.get('escalate') and '5%' in d.get('answer', '') and '10%' not in d.get('answer', '')"

# --- Escalation path (gaps) ---
assert "gap: summer camp escalates with no citations" \
  "Do you offer a summer camp program?" \
  "d.get('escalate') and not d.get('refusal') and len(d.get('cited_entries', [])) == 0"

# --- Preflight hold path ---
assert "preflight: specific-child fever question is held" \
  "My son has a fever, should I bring him in today?" \
  "d.get('escalate') and 'specific_child' in d.get('escalation_reason', '')"

# --- Refusal path ---
assert "refusal: off-topic question is refused, not escalated" \
  "What is the capital of France?" \
  "d.get('refusal') is True and not d.get('escalate')"

echo
echo "Results: ${PASS} passed, ${FAIL} failed"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
