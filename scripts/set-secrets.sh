#!/usr/bin/env bash
# Fill the redacted secrets in .env.local.
#
# `vercel env pull` writes the literal string [SENSITIVE] for every variable
# marked sensitive, and Vercel will never hand those values back — they have to
# be pasted in from their source. This walks them one at a time so you don't
# have to hand-edit quoted lines.
#
# Nothing is printed, nothing leaves your machine, and .env.local is gitignored.
#
#   bash scripts/set-secrets.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE=".env.local"

[ -f "$ENV_FILE" ] || { echo "No $ENV_FILE here. Run this from the repo root."; exit 1; }

BACKUP="${ENV_FILE}.bak.$(date +%Y%m%d-%H%M%S)"
cp "$ENV_FILE" "$BACKUP"
echo "Backed up to $BACKUP"
echo

# name|where to get it|secret?
VARS=(
  "SUPABASE_SERVICE_ROLE_KEY|Supabase → Project Settings → API → service_role|secret"
  "GEMINI_API_KEY|https://aistudio.google.com/apikey|secret"
  "GROQ_API_KEY|https://console.groq.com/keys|secret"
  "RESEND_API_KEY|https://resend.com/api-keys|secret"
  "CASHFREE_APP_ID|Cashfree → Developers → API Keys|plain"
  "CASHFREE_SECRET_KEY|Cashfree → Developers → API Keys|secret"
  "CASHFREE_ENV|type: sandbox   (anything else means PRODUCTION - real money)|plain"
  "ENCRYPTION_KEY|must match production, or saved integration creds won't decrypt|secret"
)

# Replace KEY="..." in place, or append if the key is absent.
set_var() {
  local key="$1" val="$2" tmp
  tmp="$(mktemp)"
  # Escape for sed replacement, then quote the value in the file.
  local esc; esc=$(printf '%s' "$val" | sed -e 's/[\/&|]/\\&/g')
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed "s|^${key}=.*|${key}=\"${esc}\"|" "$ENV_FILE" > "$tmp"
  else
    cp "$ENV_FILE" "$tmp"; printf '%s="%s"\n' "$key" "$val" >> "$tmp"
  fi
  mv "$tmp" "$ENV_FILE"
}

for entry in "${VARS[@]}"; do
  IFS='|' read -r KEY HINT MODE <<< "$entry"
  CURRENT=$(grep "^${KEY}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)

  if [ -n "$CURRENT" ] && [ "$CURRENT" != "[SENSITIVE]" ]; then
    echo "✓ $KEY already set — skipping"
    continue
  fi

  echo "── $KEY"
  echo "   $HINT"
  if [ "$MODE" = "secret" ]; then
    printf "   paste value (hidden, Enter to skip): "
    read -rs VALUE; echo
  else
    printf "   value (Enter to skip): "
    read -r VALUE
  fi

  if [ -z "$VALUE" ]; then echo "   skipped"; echo; continue; fi
  set_var "$KEY" "$VALUE"
  echo "   saved (${#VALUE} chars)"
  echo
done

REMAINING=$(grep -c '\[SENSITIVE\]' "$ENV_FILE" || true)
echo "─────────────────────────────────"
if [ "$REMAINING" -eq 0 ]; then
  echo "All secrets set. Start the dev server:  npm run dev"
else
  echo "$REMAINING still unset. Re-run this script when you have them."
  grep -n '\[SENSITIVE\]' "$ENV_FILE" | cut -d= -f1
fi
