"""Génère docs/raccourci-*.svg : images des raccourcis de raccourcis/ (iPhone en anglais, thème sombre).

Usage : python3 docs/build_images.py docs
À garder identique au contenu de raccourcis/build.py.

Jetons d'une ligne : (type, texte)
  t  texte simple        g  texte gris (libellé)
  b  puce bleue          v  variable (puce avec icône orange)
  m  valeur à taper (police mono)
  Suffixe « ! » : cadre vert = à taper exactement.
Ligne spéciale : "sep" (séparateur), ou liste précédée de ">" (ligne en retrait).
"""
import sys, html, os

FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif"
MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
W, PHONE_W, X0 = 1280, 660, 22
CW = PHONE_W - 2 * X0
FS, MS = 24, 19
GREEN, BLUE = "#34c759", "#0a84ff"
ICON = {"blue": "#0a84ff", "orange": "#ff9f0a", "red": "#ff453a", "yellow": "#ffd60a",
        "grey": "#8e8e93", "web": "#30b0c7", "purple": "#bf5af2", "photo": "#ff375f"}


def wid(s, kind):
    return len(s) * (MS * 0.61 if kind == "m" else FS * 0.53)


def render(path, title, title_note, cards, legend="Cadre vert = doit être exactement ça"):
    out = []
    add = out.append

    def t(x, y, s, size=FS, fill="#fff", weight=400, anchor="start", font=None):
        f = f' font-family="{font}"' if font else ""
        add(f'<text x="{x:.0f}" y="{y:.0f}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}"{f}>{html.escape(s)}</text>')

    def chip(x, y, s, kind, ring):
        pad = 11
        extra = 32 if kind == "v" else 0
        w = wid(s, kind) + 2 * pad + extra
        add(f'<rect x="{x:.0f}" y="{y-28}" width="{w:.0f}" height="38" rx="11" fill="{BLUE}" fill-opacity=".16"/>')
        if ring:
            add(f'<rect x="{x-4:.0f}" y="{y-32}" width="{w+8:.0f}" height="46" rx="14" fill="none" stroke="{GREEN}" stroke-width="3"/>')
        if kind == "v":
            add(f'<rect x="{x+pad:.0f}" y="{y-20}" width="22" height="22" rx="6" fill="#ff9f0a"/>')
            add(f'<rect x="{x+pad+6:.0f}" y="{y-15}" width="10" height="12" rx="2" fill="#fff" opacity=".85"/>')
        if kind == "m":
            t(x + pad, y - 2, s, size=MS, fill=BLUE, font=MONO)
        else:
            t(x + pad + extra, y, s, fill=BLUE)
        return w

    def draw_line(x, y, toks):
        for kind, s in toks:
            ring = kind.endswith("!")
            kind = kind.rstrip("!")
            if kind in ("t", "g"):
                t(x, y, s, fill="#fff" if kind == "t" else "#8e8e93")
                x += wid(s, kind) + 10
            else:
                x += chip(x, y, s, kind, ring) + 10

    LH = 50
    geo, y = [], max(150, 94 + len(title_note) * 28 + 20)
    for c in cards:
        h = 30 + len(c["lines"]) * LH
        nh = 26 + len(c["note"]) * 28
        geo.append((y, h))
        y += max(h, nh) + 24
    H = y + 30

    geo_top = geo[0][0]
    add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="{FONT}">')
    add(f'<rect width="{W}" height="{H}" fill="#161618" rx="28"/>')
    add(f'<rect width="{PHONE_W}" height="{H}" fill="#000" rx="28"/>')
    # titre du raccourci, encadré : c'est le nom à donner
    tw = len(title) * 31 * 0.55 + 40
    add(f'<rect x="{PHONE_W/2 - tw/2:.0f}" y="38" width="{tw:.0f}" height="56" rx="16" fill="none" stroke="{GREEN}" stroke-width="3"/>')
    t(PHONE_W / 2, 77, title, size=31, weight=600, anchor="middle")
    nx = PHONE_W + 36
    t(nx, 62, "Nom du raccourci", size=26, weight=600)
    for k, s in enumerate(title_note):
        t(nx, 94 + k * 28, s, size=20, fill=GREEN if k == 0 else "#e5e5ea")
    t(PHONE_W / 2, geo_top - 22, legend, size=18, fill="#8e8e93", anchor="middle")

    for i, (c, (cy, ch)) in enumerate(zip(cards, geo)):
        if i:
            add(f'<line x1="{PHONE_W/2}" y1="{cy-24}" x2="{PHONE_W/2}" y2="{cy}" stroke="#3a3a3c" stroke-width="3"/>')
        add(f'<rect x="{X0}" y="{cy}" width="{CW}" height="{ch}" rx="28" fill="#2c2c2e"/>')
        ly = cy + 52
        for li, ln in enumerate(c["lines"]):
            x = X0 + 22
            if li == 0:
                add(f'<rect x="{x}" y="{ly-25}" width="32" height="32" rx="8" fill="{ICON[c["icon"]]}"/>')
                add(f'<rect x="{x+9}" y="{ly-18}" width="14" height="18" rx="2" fill="#fff" opacity=".85"/>')
                x += 46
            if ln == "sep":
                add(f'<line x1="{X0+22}" y1="{ly-10}" x2="{X0+CW-22}" y2="{ly-10}" stroke="#3a3a3c" stroke-width="2"/>')
            elif ln and ln[0] == ">":
                draw_line(x + 34, ly, ln[1:])
            else:
                draw_line(x, ly, ln)
            ly += LH
        ny = cy + 36
        add(f'<circle cx="{nx+17}" cy="{ny}" r="17" fill="{BLUE}"/>')
        t(nx + 17, ny + 7, str(i + 1), size=20, weight=600, anchor="middle")
        for k, s in enumerate(c["note"]):
            t(nx + 48, ny + 7 + k * 28, s, size=20, fill=GREEN if s.startswith("✓") else "#ff9f0a" if s.startswith("Résultat") else "#e5e5ea")
    add("</svg>")
    with open(path, "w") as f:
        f.write("\n".join(out))
    print(path, W, H)


DOCS = sys.argv[1]
URL = "https://zqdvtbkjvfzkjqtaffbb.supabase.co"
KEY = "sb_publishable_JXRFdwQ2rHPpIWDs-fx2Pw_LLnUKoIp"
TOKEN = "TON_JETON"


def http_card(url_lines, headers, body, note):
    lines = [[("t", "Get contents of")]]
    lines += [u if isinstance(u, list) else [("m!", u)] for u in url_lines]
    lines += ["sep", [("g", "Method"), ("b!", "POST")], [("g", "Headers")]]
    lines += [[">", ("g", "Key"), ("m!", k)] if j % 2 == 0 else [">", ("m!", k)]
              for j, k in enumerate(x for pair in headers for x in pair)]
    lines += body
    return dict(icon="web", lines=lines, note=note)


# ---------- Capturer ----------
JETON_CARD = dict(icon="yellow", lines=[[("t", "Text")], [("m", "ton jeton")]],
                  note=["Ton jeton. L’iPhone te le demande", "quand tu installes le raccourci.", "Résultat de cette action : Jeton"])
render(os.path.join(DOCS, "raccourci-capturer.svg"), "Capturer",
       ["Nom libre (c’est ce que tu dis à Siri).", "L’app ne l’appelle pas."],
       [
           dict(icon="blue", lines=[[("t", "Receive"), ("b", "Text and URLs"), ("t", "from")],
                                    [("b", "Share Sheet")],
                                    [("g", "If there’s no input:")], [("b", "Ask For"), ("b", "Text")]],
                note=["Ce que le raccourci reçoit : un texte", "ou un lien partagé. Si tu le lances", "sans rien partager, il te demande", "de taper ou dicter ton idée."]),
           JETON_CARD,
           dict(icon="yellow", lines=[[("t", "Match"), ("m!", "^\\s*https?://\\S+\\s*$")], [("t", "in"), ("v", "Shortcut Input")]],
                note=["Regarde si tu as partagé un lien", "seul (et pas un texte).", "Résultat : Matches"]),
           dict(icon="grey", lines=[[("t", "If"), ("v", "Matches"), ("b", "has any value")]],
                note=["Si c’est un lien…"]),
           dict(icon="red", lines=[[("t", "Ask for"), ("b", "Text"), ("t", "with")], [("b", "Titre ou note ? (facultatif)")]],
                note=["… te demande un titre ou une note.", "1re ligne = titre, la suite = note.", "Vide : le lien arrive seul."]),
           http_card([URL, "/rest/v1/rpc/capture"], [("apikey", KEY)],
                     [[("g", "Request Body"), ("b!", "JSON")],
                      [">", ("g", "Text"), ("m!", "p_token"), ("v", "Jeton")],
                      [">", ("g", "Text"), ("m!", "p_text"), ("v", "Provided Input")],
                      [">", ("g", "Text"), ("m!", "p_url"), ("v", "Shortcut Input")]],
                     ["Envoie le lien et ton titre à", "ta base Supabase.", "Provided Input = ce que tu as tapé.",
                      "Shortcut Input = le lien."]),
           dict(icon="grey", lines=[[("t", "Otherwise")]], note=["Sinon (une idée, pas un lien)…"]),
           http_card([URL, "/rest/v1/rpc/capture"], [("apikey", KEY)],
                     [[("g", "Request Body"), ("b!", "JSON")],
                      [">", ("g", "Text"), ("m!", "p_token"), ("v", "Jeton")],
                      [">", ("g", "Text"), ("m!", "p_text"), ("v", "Shortcut Input")]],
                     ["… envoie ton idée telle quelle.", "Shortcut Input = ce que tu as tapé", "ou dicté."]),
           dict(icon="grey", lines=[[("t", "End If")]], note=["Fin du « si »."]),
           dict(icon="red", lines=[[("t", "Vibrate Device")]],
                note=["Une vibration confirme l’envoi.", "Pas de notification qui reste."]),
       ], legend="Cadre vert = doit être exactement ça")

# ---------- Capturer photo ----------
render(os.path.join(DOCS, "raccourci-capturer-photo.svg"), "Capturer photo",
       ["Nom libre. L’app ne l’appelle pas."],
       [
           dict(icon="blue", lines=[[("t", "Receive"), ("b", "Images"), ("t", "from"), ("b", "Share Sheet")],
                                    [("g", "If there’s no input:"), ("b", "Continue")]],
                note=["Reçoit une photo partagée", "(depuis Photos par exemple)."]),
           JETON_CARD,
           dict(icon="grey", lines=[[("t", "If"), ("v", "Shortcut Input"), ("b", "does not have any value")]],
                note=["Si aucune photo n’a été partagée…"]),
           dict(icon="photo", lines=[[("t", "Take"), ("b", "1"), ("b", "photo")]],
                note=["… l’appareil photo s’ouvre."]),
           dict(icon="grey", lines=[[("t", "Otherwise")]], note=["Sinon…"]),
           dict(icon="orange", lines=[[("t", "Get"), ("v", "Shortcut Input")]],
                note=["… on garde la photo partagée."]),
           dict(icon="grey", lines=[[("t", "End If")]], note=["Résultat de ce bloc : If Result", "(la photo, dans les deux cas)."]),
           dict(icon="photo", lines=[[("t", "Resize"), ("v", "If Result"), ("t", "to")], [("b", "Longest Edge"), ("b!", "1600")]],
                note=["Réduit la photo pour qu’elle", "s’envoie vite."]),
           dict(icon="photo", lines=[[("t", "Convert"), ("v", "Resized Image"), ("t", "to"), ("b!", "JPEG")],
                                     [("g", "Quality"), ("b", "70 %")]],
                note=["La met au format JPEG."]),
           dict(icon="grey", lines=[[("t", "Current Date")]], note=["Date et heure de maintenant…"]),
           dict(icon="grey", lines=[[("t", "Format"), ("v", "Date"), ("t", "with"), ("b", "Custom")],
                                    [("g", "Format String"), ("m!", "yyyyMMdd-HHmmss")]],
                note=["… écrites ainsi : 20261031-154512.", "Elles servent de nom au fichier."]),
           dict(icon="yellow", lines=[[("t", "Text")], [("m!", "inbox/"), ("v", "Jeton"), ("m!", "/")],
                                      [">", ("v", "Formatted Date"), ("m!", ".jpg")]],
                note=["Le chemin du fichier en ligne.", "Résultat de cette action : Chemin"]),
           http_card([URL, [("m!", "/storage/v1/object/captures/"), ("v", "Chemin")]], [("apikey", KEY), ("Content-Type", "image/jpeg")],
                     [[("g", "Request Body"), ("b!", "File")], [">", ("g", "File"), ("v", "Converted Image")]],
                     ["Envoie la photo dans ton stockage", "Supabase."]),
           dict(icon="red", lines=[[("t", "Ask for"), ("b", "Text"), ("t", "with")], [("b", "Légende ? (facultatif)")]],
                note=["Te demande une légende.", "Tu peux laisser vide."]),
           http_card([URL, "/rest/v1/rpc/capture"], [("apikey", KEY)],
                     [[("g", "Request Body"), ("b!", "JSON")],
                      [">", ("g", "Text"), ("m!", "p_token"), ("v", "Jeton")],
                      [">", ("g", "Text"), ("m!", "p_text"), ("v", "Provided Input")],
                      [">", ("g", "Text"), ("m!", "p_image_path"), ("v", "Chemin")]],
                     ["Ajoute la photo et sa légende", "dans ton Inbox.", "Provided Input = ta légende."]),
           dict(icon="red", lines=[[("t", "Vibrate Device")]],
                note=["Une vibration confirme l’envoi.", "Pas de notification qui reste."]),
       ], legend="Cadre vert = doit être exactement ça")

# ---------- Agenda Apple ----------
DATE_FMT = "yyyy-MM-dd'T'HH:mm"
render(os.path.join(DOCS, "raccourci-agenda-apple.svg"), "Agenda Apple",
       ["Nom libre. L’app ne l’appelle pas :", "une automatisation le lance chaque matin."],
       [
           JETON_CARD,
           dict(icon="red", lines=[[("t", "Get"), ("b", "150"), ("t", "upcoming events from")], [("b", "All Calendars")]],
                note=["Get Upcoming Events.", "Résultat : Upcoming Events"]),
           dict(icon="grey", lines=[[("t", "Repeat with each item in")], [("v", "Upcoming Events")]],
                note=["Pour chaque événement…"]),
           dict(icon="yellow", lines=[[("t", "Text")],
                                      [">", ("v", "Calendar"), ("m!", "⇥"), ("v", "Start Date"), ("m!", "⇥")],
                                      [">", ("v", "End Date"), ("m!", "⇥"), ("v", "Is All Day"), ("m!", "⇥")],
                                      [">", ("v", "Title"), ("m!", "⇥"), ("v", "Location")]],
                note=["… une ligne de texte.", "Chaque puce = Repeat Item, touche-la", "pour choisir la propriété.",
                      "⇥ = une tabulation.", "Start Date et End Date : format", "Custom " + DATE_FMT]),
           dict(icon="grey", lines=[[("t", "End Repeat")]], note=["Résultat : Repeat Results"]),
           dict(icon="yellow", lines=[[("t", "Combine"), ("v", "Repeat Results"), ("t", "with")], [("b", "Custom"), ("m!", "␞")]],
                note=["Met les lignes bout à bout,", "séparées par ␞.", "Résultat : Combined Text"]),
           http_card([URL, "/rest/v1/rpc/sync_events"], [("apikey", KEY)],
                     [[("g", "Request Body"), ("b!", "JSON")],
                      [">", ("g", "Text"), ("m!", "p_token"), ("v", "Jeton")],
                      [">", ("g", "Text"), ("m!", "p_lines"), ("v", "Combined Text")]],
                     ["Remplace tes prochains événements", "dans Brain. La réponse est", "le nombre d’événements reçus."]),
           dict(icon="red", lines=[[("t", "Show notification")], [("b", "Brain a reçu"), ("v", "Contents of URL"), ("b", "événements…")]],
                note=["Petit message de confirmation."]),
       ])
