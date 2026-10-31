// Point d'entrée : le cœur d'abord, puis les modules (l'ordre ici = ordre par défaut de la barre)
import './core/events.js';
import './modules/gtd/index.js';
import './modules/notes/index.js';
import './modules/sport/index.js';
import './modules/courses/index.js';
import { init } from './core/boot.js';

init();
