#!/usr/bin/env bash
# Lit les éléments partagés avec le compte agent de Brain et les écrit en JSON sur la sortie standard.
# Identifiants : BRAIN_AGENT_EMAIL et BRAIN_AGENT_PASSWORD (environnement ou .env.local à la racine, jamais commité).
# Usage : scripts/brain-read.sh [since ISO8601]    ex. scripts/brain-read.sh 2026-11-01T00:00:00Z
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/.env.local" ] && { set -a; . "$ROOT/.env.local"; set +a; }
: "${BRAIN_AGENT_EMAIL:?BRAIN_AGENT_EMAIL manquant}" "${BRAIN_AGENT_PASSWORD:?BRAIN_AGENT_PASSWORD manquant}"

URL="https://zqdvtbkjvfzkjqtaffbb.supabase.co"
KEY="sb_publishable_JXRFdwQ2rHPpIWDs-fx2Pw_LLnUKoIp"

login=$(python3 -c 'import json,os;print(json.dumps({"email":os.environ["BRAIN_AGENT_EMAIL"],"password":os.environ["BRAIN_AGENT_PASSWORD"]}))' \
  | curl -sS "$URL/auth/v1/token?grant_type=password" -H "apikey: $KEY" -H "Content-Type: application/json" -d @-)
jwt=$(printf '%s' "$login" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("access_token",""))')
[ -n "$jwt" ] || { echo "Connexion refusée : $(printf '%s' "$login" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("msg") or d.get("error_description") or d)')" >&2; exit 1; }

q="select=*&status=neq.trashed&order=updated_at.desc&limit=5000"
[ -n "${1:-}" ] && q="$q&updated_at=gte.$1"
curl -sS "$URL/rest/v1/items?$q" -H "apikey: $KEY" -H "Authorization: Bearer $jwt"
