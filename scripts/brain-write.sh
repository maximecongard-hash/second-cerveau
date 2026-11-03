#!/usr/bin/env bash
# Ajoute des recettes (ou des produits de courses) dans le foyer partagé avec le compte agent de Brain.
# Le compte agent n'écrit que dans ce que Brain lui a partagé en droit « modifier » (le foyer) : la sécurité est celle de la base.
# Identifiants : BRAIN_AGENT_EMAIL et BRAIN_AGENT_PASSWORD (environnement ou .env.local à la racine, jamais commité).
# Usage : scripts/brain-write.sh [--dry] fichier.json
#   fichier.json : tableau d'éléments, ex. [{"title": "Crêpes", "duration_min": 30, "tags": ["Rapide"], "body": "…",
#     "meta": {"servings": 4, "seasons": [], "ingredients": [{"id": "a1", "qty": 250, "unit": "g", "name": "farine"}]}}]
#   « kind » vaut recipe par défaut (shop_item possible). Une recette dont le titre existe déjà dans le foyer est ignorée.
#   --dry : affiche ce qui serait ajouté, sans rien écrire.
set -euo pipefail

DRY=0; [ "${1:-}" = "--dry" ] && { DRY=1; shift; }
FILE="${1:?Usage : scripts/brain-write.sh [--dry] fichier.json}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/.env.local" ] && { set -a; . "$ROOT/.env.local"; set +a; }
: "${BRAIN_AGENT_EMAIL:?BRAIN_AGENT_EMAIL manquant}" "${BRAIN_AGENT_PASSWORD:?BRAIN_AGENT_PASSWORD manquant}"

URL="https://zqdvtbkjvfzkjqtaffbb.supabase.co"
KEY="sb_publishable_JXRFdwQ2rHPpIWDs-fx2Pw_LLnUKoIp"

login=$(python3 -c 'import json,os;print(json.dumps({"email":os.environ["BRAIN_AGENT_EMAIL"],"password":os.environ["BRAIN_AGENT_PASSWORD"]}))' \
  | curl -sS "$URL/auth/v1/token?grant_type=password" -H "apikey: $KEY" -H "Content-Type: application/json" -d @-)
jwt=$(printf '%s' "$login" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("access_token",""))')
[ -n "$jwt" ] || { echo "Connexion refusée : $(printf '%s' "$login" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("msg") or d.get("error_description") or d)')" >&2; exit 1; }
uid=$(printf '%s' "$login" | python3 -c 'import json,sys;print(json.load(sys.stdin)["user"]["id"])')

api() { curl -sS "$URL/rest/v1/$1" -H "apikey: $KEY" -H "Authorization: Bearer $jwt" "${@:2}"; }
existing=$(api "items?select=id,kind,title,parent_id&status=neq.trashed&kind=in.(foyer,recipe,shop_item)&limit=5000")

rows=$(EXISTING="$existing" UID_AGENT="$uid" python3 - "$FILE" <<'PY'
import json, os, sys, uuid
ex = json.loads(os.environ["EXISTING"])
foyers = [i for i in ex if i["kind"] == "foyer"]
if not foyers:
    sys.exit("Aucun foyer partagé avec le compte agent. Dans Brain : Courses > menu ⋯ > Foyer et partage, créer le foyer puis le partager en « Peut modifier ».")
foyer = foyers[0]["id"]
have = {(i["kind"], i["title"].strip().lower()) for i in ex if i.get("parent_id") == foyer}
out, skipped = [], []
for r in json.load(open(sys.argv[1])):
    kind = r.get("kind", "recipe")
    title = r.get("title", "").strip()
    if not title or (kind, title.lower()) in have:
        skipped.append(title); continue
    have.add((kind, title.lower()))
    out.append({"id": str(uuid.uuid4()), "user_id": os.environ["UID_AGENT"], "kind": kind, "status": "active", "parent_id": foyer, "source": "agent", **r, "title": title})
print(json.dumps({"rows": out, "skipped": skipped}))
PY
)
n=$(printf '%s' "$rows" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(len(d["rows"]))')
skipped=$(printf '%s' "$rows" | python3 -c 'import json,sys;print(", ".join(json.load(sys.stdin)["skipped"]))')
[ -n "$skipped" ] && echo "Ignorés (déjà là ou sans titre) : $skipped" >&2
if [ "$DRY" = 1 ]; then printf '%s' "$rows" | python3 -c 'import json,sys;[print("-", r["kind"], r["title"]) for r in json.load(sys.stdin)["rows"]]'; echo "$n à ajouter (--dry : rien écrit)"; exit 0; fi
[ "$n" -gt 0 ] || { echo "Rien à ajouter"; exit 0; }
printf '%s' "$rows" | python3 -c 'import json,sys;print(json.dumps(json.load(sys.stdin)["rows"]))' \
  | api items -X POST -H "Content-Type: application/json" -H "Prefer: return=minimal" -d @-
echo "$n ajouté(s) au foyer"
