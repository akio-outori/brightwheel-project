#!/usr/bin/env bash
# Seeds the demo question set against a running BrightDesk instance.
# Usage:
#   ./scripts/seed-demo-questions.sh                    # defaults to live Railway
#   BASE_URL=http://localhost:3000 ./scripts/seed-demo-questions.sh
#
# The 10-question mix exercises every trust-loop branch:
#   - 3 grounded (hours, meals, cameras-via-override)
#   - 1 grounded with override correction (tuition)
#   - 1 grounded on sibling discount
#   - 3 escalated gaps (summer camp, subsidies, plus one more)
#   - 2 preflight holds (specific-child health)
#   - 1 off-topic refusal

set -euo pipefail

BASE_URL="${BASE_URL:-https://app-production-6f11.up.railway.app}"
API="${BASE_URL}/api/ask"

questions=(
  "What are your hours?"
  "Do you provide lunch and snacks?"
  "How much is tuition for a 3-year-old?"
  "Do you offer a summer camp program?"
  "Is there a sibling discount?"
  "Can parents access the classroom cameras during the day?"
  "Do you accept state childcare subsidies?"
  "My son has a fever, should I bring him in today?"
  "My daughter is allergic to peanuts — what precautions do you take?"
  "What is the capital of France?"
)

echo "Seeding ${#questions[@]} questions to ${API}"
echo

for q in "${questions[@]}"; do
  response=$(curl -fsS -X POST "$API" \
    -H "Content-Type: application/json" \
    -d "$(python3 -c "import json,sys; print(json.dumps({'question': sys.argv[1]}))" "$q")")

  verdict=$(python3 -c "
import sys, json
d = json.loads(sys.argv[1])
if d.get('refusal'):
    print('REFUSED')
elif d.get('escalate'):
    print('ESCALATED')
else:
    print('GROUNDED')
cited = d.get('cited_entries', [])
if cited:
    print('cited:', ', '.join(cited))
" "$response")

  echo "→ $q"
  echo "  $verdict" | sed 's/^/  /'
  echo
done

echo "Done."
