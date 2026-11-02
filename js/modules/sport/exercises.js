import { S } from '../../core/store.js';

// ---------------------------------------------------------------------------
// Bibliothèque d'exercices : liste de départ, modifiable dans Réglages > Sport.
// Chaque entrée : { name, group, rest, unit? } (repos par défaut en secondes ; unit 's' = tenue en secondes).
// ---------------------------------------------------------------------------
// Groupes par type de séance : le renfo et la mobilité partagent « Tronc » (gainage)
export const GROUPS_BY = {
  strength: ['Jambes', 'Pousser', 'Tirer', 'Épaules', 'Bras', 'Tronc', 'Corps entier'],
  mobility: ['Mobilité', 'Étirements', 'Tronc']
};
export const GROUPS = [...GROUPS_BY.strength, 'Mobilité', 'Étirements'];
export const TIMED_GROUPS = ['Mobilité', 'Étirements'];

// [nom, groupe, repos en s, 's' quand l'exercice se compte en secondes de tenue]
export const DEFAULT_EXERCISES = [
  ['Squat', 'Jambes', 120], ['Front squat', 'Jambes', 120], ['Fentes marchées', 'Jambes', 90], ['Split squat bulgare', 'Jambes', 90],
  ['Soulevé de terre', 'Jambes', 150], ['Soulevé de terre roumain', 'Jambes', 120], ['Hip thrust', 'Jambes', 90], ['Presse à cuisses', 'Jambes', 120],
  ['Leg curl', 'Jambes', 75], ['Leg extension', 'Jambes', 75], ['Mollets debout', 'Jambes', 60], ['Montées sur banc', 'Jambes', 75], ['Squat goblet', 'Jambes', 90],
  ['Développé couché', 'Pousser', 120], ['Développé incliné haltères', 'Pousser', 90], ['Développé haltères', 'Pousser', 90], ['Pompes', 'Pousser', 60], ['Dips', 'Pousser', 90], ['Écartés', 'Pousser', 60],
  ['Tractions', 'Tirer', 120], ['Rowing barre', 'Tirer', 105], ['Rowing haltère', 'Tirer', 90], ['Tirage vertical', 'Tirer', 90], ['Tirage horizontal', 'Tirer', 90],
  ['Développé militaire', 'Épaules', 105], ['Développé Arnold', 'Épaules', 90], ['Élévations latérales', 'Épaules', 60], ['Oiseau', 'Épaules', 60], ['Face pull', 'Épaules', 60],
  ['Curl biceps', 'Bras', 60], ['Curl marteau', 'Bras', 60], ['Extension triceps', 'Bras', 60], ['Barre au front', 'Bras', 75],
  ['Gainage', 'Tronc', 45, 's'], ['Gainage latéral', 'Tronc', 45, 's'], ['Crunch', 'Tronc', 45], ['Relevé de jambes', 'Tronc', 60], ['Russian twist', 'Tronc', 45], ['Roue abdominale', 'Tronc', 60],
  ['Kettlebell swing', 'Corps entier', 75], ['Burpees', 'Corps entier', 60], ['Thruster', 'Corps entier', 90], ['Clean haltères', 'Corps entier', 90],
  ['Chat-vache', 'Mobilité', 15, 's'], ['Rotation thoracique', 'Mobilité', 15, 's'], ['Hanches 90/90', 'Mobilité', 15, 's'], ['Cercles d’épaules', 'Mobilité', 15, 's'],
  ['Cercles de chevilles', 'Mobilité', 15, 's'], ['Squat profond tenu', 'Mobilité', 15, 's'], ['Pont fessier tenu', 'Mobilité', 20, 's'],
  ['Étirement mollets', 'Étirements', 15, 's'], ['Étirement ischio-jambiers', 'Étirements', 15, 's'], ['Étirement quadriceps', 'Étirements', 15, 's'],
  ['Fente basse (psoas)', 'Étirements', 15, 's'], ['Pigeon (fessiers)', 'Étirements', 15, 's'], ['Posture de l’enfant', 'Étirements', 15, 's'],
  ['Étirement pectoraux', 'Étirements', 15, 's'], ['Étirement dos / lombaires', 'Étirements', 15, 's']
].map(([name, group, rest, unit]) => ({ name, group, rest, ...(unit ? { unit } : {}) }));

export const library = sport => {
  const all = S.prefs.sportExercises || DEFAULT_EXERCISES;
  return sport && GROUPS_BY[sport] ? all.filter(e => GROUPS_BY[sport].includes(e.group)) : all;
};
export const findExercise = name => library().find(e => e.name.toLowerCase() === String(name).trim().toLowerCase()) || null;
export const restFor = name => findExercise(name)?.rest || S.prefs.sportRest || 90;
