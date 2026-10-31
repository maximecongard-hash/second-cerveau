"""Fabrique les raccourcis iOS prêts à installer (dossier raccourcis/).

Usage (sur un Mac) : python3 raccourcis/build.py
Écrit les fichiers non signés dans raccourcis/src/, puis les signe avec `shortcuts sign`
dans raccourcis/. Le jeton de capture n'est jamais dans les fichiers : l'iPhone le demande
à l'installation (question d'import).
"""
import os, plistlib, subprocess, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
URL = 'https://zqdvtbkjvfzkjqtaffbb.supabase.co'
KEY = 'sb_publishable_JXRFdwQ2rHPpIWDs-fx2Pw_LLnUKoIp'
OBJ = '￼'  # emplacement d'une variable dans un texte


def uid():
    return str(uuid.uuid4()).upper()


def out(action_uuid, name):
    return {'Type': 'ActionOutput', 'OutputUUID': action_uuid, 'OutputName': name}


INPUT = {'Type': 'ExtensionInput'}


def text(*parts):
    """Texte avec variables : text('inbox/', out(...), '.jpg')."""
    s, att = '', {}
    for p in parts:
        if isinstance(p, str):
            s += p
        else:
            att[f'{{{len(s)}, 1}}'] = p
            s += OBJ
    return {'Value': {'string': s, 'attachmentsByRange': att}, 'WFSerializationType': 'WFTextTokenString'}


def var(v):
    return {'Value': v, 'WFSerializationType': 'WFTextTokenAttachment'}


def dictionary(pairs):
    return {'Value': {'WFDictionaryFieldValueItems': [
        {'WFItemType': 0, 'WFKey': text(k), 'WFValue': v if isinstance(v, dict) and 'Value' in v else text(v)}
        for k, v in pairs]}, 'WFSerializationType': 'WFDictionaryFieldValue'}


def act(ident, **params):
    return {'WFWorkflowActionIdentifier': 'is.workflow.actions.' + ident, 'WFWorkflowActionParameters': params}


def token_action(u):
    return act('gettext', UUID=u, WFTextActionText='', CustomOutputName='Jeton')


def token_question():
    return [{'ActionIndex': 0, 'Category': 'Parameter', 'ParameterKey': 'WFTextActionText', 'DefaultValue': '',
             'Text': 'Colle ton jeton de capture (app Brain : Réglages > Capture iPhone > Copier).'}]


def rpc_call(fn, token_uuid, fields, **extra):
    return act('downloadurl', WFURL=URL + '/rest/v1/rpc/' + fn, WFHTTPMethod='POST', ShowHeaders=True,
               WFHTTPHeaders=dictionary([('apikey', KEY)]), WFHTTPBodyType='JSON',
               WFJSONValues=dictionary([('p_token', text(out(token_uuid, 'Jeton')))] + fields), **extra)


def capture_call(token_uuid, fields):
    return rpc_call('capture', token_uuid, fields)


def repeat_item(prop, date_format=None):
    """Propriété de l'élément de la boucle « Répéter avec chaque », date éventuellement formatée."""
    agg = [{'Type': 'WFPropertyVariableAggrandizement', 'PropertyName': prop}]
    if date_format:
        agg.append({'Type': 'WFDateFormatVariableAggrandizement', 'WFDateFormatStyle': 'Custom', 'WFDateFormat': date_format})
    return {'Type': 'Variable', 'VariableName': 'Repeat Item', 'Aggrandizements': agg}


def workflow(actions, inputs, types, no_input=None, questions=(), glyph=59511, color=4282601983):
    w = {
        'WFWorkflowActions': actions,
        'WFWorkflowClientVersion': '2302.0.4',
        'WFWorkflowMinimumClientVersion': 900,
        'WFWorkflowMinimumClientVersionString': '900',
        'WFWorkflowIcon': {'WFWorkflowIconStartColor': color, 'WFWorkflowIconGlyphNumber': glyph},
        'WFWorkflowImportQuestions': list(questions),
        'WFWorkflowInputContentItemClasses': inputs,
        'WFWorkflowOutputContentItemClasses': [],
        'WFWorkflowTypes': types,
        'WFWorkflowHasShortcutInputVariables': True,
        'WFQuickActionSurfaces': [],
    }
    if no_input:
        w['WFWorkflowNoInputBehavior'] = no_input
    return w


# Confirmation : une vibration (une notification resterait dans le centre de notifications).
VIBRATE = act('vibrate')


# ---------- Capturer : texte, dictée, liens ----------
tok, match, grp, note = uid(), uid(), uid(), uid()
capturer = workflow(
    [token_action(tok),
     # Un lien seul : on demande un titre ou une note, et le lien part à part (p_url).
     act('text.match', UUID=match, WFMatchTextPattern=r'^\s*https?://\S+\s*$', WFMatchTextCaseSensitive=False,
         text=text(INPUT)),
     act('conditional', GroupingIdentifier=grp, WFControlFlowMode=0, WFCondition=100,
         WFInput={'Type': 'Variable', 'Variable': var(out(match, 'Matches'))}),
     act('ask', UUID=note, WFAskActionPrompt='Titre ou note ? (facultatif)', WFInputType='Text',
         WFAskActionDefaultAnswer='', WFAllowsMultilineText=True),
     capture_call(tok, [('p_text', text(out(note, 'Provided Input'))), ('p_url', text(INPUT))]),
     act('conditional', GroupingIdentifier=grp, WFControlFlowMode=1),
     capture_call(tok, [('p_text', text(INPUT))]),
     act('conditional', GroupingIdentifier=grp, WFControlFlowMode=2),
     VIBRATE],
    ['WFStringContentItem', 'WFURLContentItem'], ['ActionExtension', 'Watch'],
    no_input={'Name': 'WFWorkflowNoInputBehaviorAskForInput', 'Parameters': {'ItemClass': 'WFStringContentItem'}},
    questions=token_question())

# ---------- Capturer photo ----------
tok, grp, endif, photo = uid(), uid(), uid(), uid()
resized, jpeg, now, stamp, path, legend = uid(), uid(), uid(), uid(), uid(), uid()
capturer_photo = workflow(
    [token_action(tok),
     # Rien de partagé : on prend une photo. Sinon : l'image partagée.
     act('conditional', GroupingIdentifier=grp, WFControlFlowMode=0, WFCondition=101,
         WFInput={'Type': 'Variable', 'Variable': var(INPUT)}),
     act('takephoto', UUID=photo, WFCameraCaptureShowPreview=True),
     act('conditional', GroupingIdentifier=grp, WFControlFlowMode=1),
     act('getvariable', WFVariable=var(INPUT)),
     act('conditional', GroupingIdentifier=grp, WFControlFlowMode=2, UUID=endif),
     act('image.resize', UUID=resized, WFImageResizeKey='Longest Edge', WFImageResizeLength='1600',
         WFImage=var(out(endif, 'If Result'))),
     act('image.convert', UUID=jpeg, WFImageFormat='JPEG', WFImageCompressionQuality=0.7,
         WFImagePreserveMetadata=False, WFInput=var(out(resized, 'Resized Image'))),
     act('date', UUID=now, WFDateActionMode='Current Date'),
     act('format.date', UUID=stamp, WFDateFormatStyle='Custom', WFDateFormat='yyyyMMdd-HHmmss',
         WFDate=text(out(now, 'Date'))),
     act('gettext', UUID=path, WFTextActionText=text('inbox/', out(tok, 'Jeton'), '/', out(stamp, 'Formatted Date'), '.jpg'), CustomOutputName='Chemin'),
     act('downloadurl', WFURL=text(URL + '/storage/v1/object/captures/', out(path, 'Chemin')), WFHTTPMethod='POST',
         ShowHeaders=True, WFHTTPHeaders=dictionary([('apikey', KEY), ('Content-Type', 'image/jpeg')]),
         WFHTTPBodyType='File', WFRequestVariable=var(out(jpeg, 'Converted Image'))),
     act('ask', UUID=legend, WFAskActionPrompt='Légende ? (facultatif)', WFInputType='Text', WFAskActionDefaultAnswer=''),
     capture_call(tok, [('p_text', text(out(legend, 'Provided Input'))), ('p_image_path', text(out(path, 'Chemin')))]),
     VIBRATE],
    ['WFImageContentItem'], ['ActionExtension'],
    no_input={'Name': 'WFWorkflowNoInputBehaviorPassthrough', 'Parameters': {}},
    questions=token_question(), glyph=59448)

# ---------- Rappel GTD : lancé par l'app avec {titre, date, notes} ----------
dic, titre, date_txt, quand, notes = uid(), uid(), uid(), uid(), uid()
rappel = workflow(
    [act('detect.dictionary', UUID=dic, WFInput=var(INPUT)),
     act('getvalueforkey', UUID=titre, WFGetDictionaryValueType='Value', WFDictionaryKey='titre',
         WFInput=var(out(dic, 'Dictionary')), CustomOutputName='Titre'),
     act('getvalueforkey', UUID=date_txt, WFGetDictionaryValueType='Value', WFDictionaryKey='date',
         WFInput=var(out(dic, 'Dictionary')), CustomOutputName='Date texte'),
     act('detect.date', UUID=quand, WFInput=var(out(date_txt, 'Date texte')), CustomOutputName='Quand'),
     act('getvalueforkey', UUID=notes, WFGetDictionaryValueType='Value', WFDictionaryKey='notes',
         WFInput=var(out(dic, 'Dictionary')), CustomOutputName='Notes'),
     act('addnewreminder', WFCalendarItemTitle=text(out(titre, 'Titre')), WFCalendarItemNotes=text(out(notes, 'Notes')),
         WFAlertEnabled='Alert', WFAlertCondition='At Time', WFAlertCustomTime=text(out(quand, 'Quand')))],
    ['WFStringContentItem'], [], glyph=59784, color=4271458815)

# ---------- Agenda Apple : envoie les prochains événements de Calendrier à Brain ----------
# Une ligne par événement, séparées par ␞, champs séparés par une tabulation :
# calendrier, début, fin, journée entière, titre, lieu (voir sync_events dans supabase/005_calendrier.sql)
tok, events, rep, rep_end, joined, sent = uid(), uid(), uid(), uid(), uid(), uid()
DATE = "yyyy-MM-dd'T'HH:mm"
agenda_apple = workflow(
    [token_action(tok),
     act('getupcomingevents', UUID=events, WFGetUpcomingItemCount=150),
     act('repeat.each', GroupingIdentifier=rep, WFControlFlowMode=0, WFInput=var(out(events, 'Upcoming Events'))),
     act('gettext', WFTextActionText=text(repeat_item('Calendar'), '\t', repeat_item('Start Date', DATE), '\t',
                                          repeat_item('End Date', DATE), '\t', repeat_item('Is All Day'), '\t',
                                          repeat_item('Title'), '\t', repeat_item('Location'))),
     act('repeat.each', GroupingIdentifier=rep, WFControlFlowMode=2, UUID=rep_end),
     act('text.combine', UUID=joined, WFTextSeparator='Custom', WFTextCustomSeparator='␞',
         text=var(out(rep_end, 'Repeat Results'))),
     rpc_call('sync_events', tok, [('p_lines', text(out(joined, 'Combined Text')))], UUID=sent),
     act('notification', WFNotificationActionBody=text('Brain a reçu ', out(sent, 'Contents of URL'), ' événements de Calendrier'),
         WFNotificationActionSound=False)],
    [], [], questions=token_question(), glyph=59784, color=4292093695)

os.makedirs(os.path.join(HERE, 'src'), exist_ok=True)
for name, w in [('Capturer', capturer), ('Capturer photo', capturer_photo), ('Rappel GTD', rappel),
                ('Agenda Apple', agenda_apple)]:
    w['WFWorkflowName'] = name
    src = os.path.join(HERE, 'src', name + '.shortcut')
    with open(src, 'wb') as f:
        plistlib.dump(w, f, fmt=plistlib.FMT_BINARY)
    dst = os.path.join(HERE, name + '.shortcut')
    r = subprocess.run(['shortcuts', 'sign', '--mode', 'anyone', '--input', src, '--output', dst],
                       capture_output=True, text=True)
    print(name, 'signé' if r.returncode == 0 and os.path.exists(dst) else 'ÉCHEC : ' + (r.stderr or r.stdout).strip())
