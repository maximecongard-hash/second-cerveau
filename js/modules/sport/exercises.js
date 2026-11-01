import { S } from '../../core/store.js';

// ---------------------------------------------------------------------------
// Bibliothèque d'exercices : liste de départ, modifiable dans Réglages > Sport.
// Chaque entrée : { name, group, rest } (repos par défaut en secondes).
// ---------------------------------------------------------------------------
export const GROUPS = ['Jambes', 'Pousser', 'Tirer', 'Épaules', 'Bras', 'Tronc', 'Corps entier'];

export const DEFAULT_EXERCISES = [
  ['Squat', 'Jambes', 120], ['Front squat', 'Jambes', 120], ['Fentes marchées', 'Jambes', 90], ['Split squat bulgare', 'Jambes', 90],
  ['Soulevé de terre', 'Jambes', 150], ['Soulevé de terre roumain', 'Jambes', 120], ['Hip thrust', 'Jambes', 90], ['Presse à cuisses', 'Jambes', 120],
  ['Mollets debout', 'Jambes', 60], ['Montées sur banc', 'Jambes', 75],
  ['Développé couché', 'Pousser', 120], ['Développé incliné haltères', 'Pousser', 90], ['Pompes', 'Pousser', 60], ['Dips', 'Pousser', 90],
  ['Tractions', 'Tirer', 120], ['Rowing barre', 'Tirer', 105], ['Rowing haltère', 'Tirer', 90], ['Tirage vertical', 'Tirer', 90], ['Tirage horizontal', 'Tirer', 90],
  ['Développé militaire', 'Épaules', 105], ['Élévations latérales', 'Épaules', 60], ['Oiseau', 'Épaules', 60], ['Face pull', 'Épaules', 60],
  ['Curl biceps', 'Bras', 60], ['Extension triceps', 'Bras', 60],
  ['Gainage', 'Tronc', 45], ['Gainage latéral', 'Tronc', 45], ['Crunch', 'Tronc', 45], ['Relevé de jambes', 'Tronc', 60], ['Russian twist', 'Tronc', 45],
  ['Kettlebell swing', 'Corps entier', 75], ['Burpees', 'Corps entier', 60]
].map(([name, group, rest]) => ({ name, group, rest }));

export const library = () => S.prefs.sportExercises || DEFAULT_EXERCISES;
export const findExercise = name => library().find(e => e.name.toLowerCase() === String(name).trim().toLowerCase()) || null;
export const restFor = name => findExercise(name)?.rest || S.prefs.sportRest || 90;
