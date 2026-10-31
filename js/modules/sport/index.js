import { I, empty } from '../../core/util.js';
import { registerModule } from '../../core/modules.js';

// ---------------------------------------------------------------------------
// Module « Sport » : aperçu de la navigation, le suivi des séances arrive en phase 2
// ---------------------------------------------------------------------------
registerModule({
  id: 'sport',
  label: 'Sport',
  icon: I.dumbbell,
  description: 'Séances, programmes, séries et progression.',
  preview: true,
  defaultOn: false,
  home: 'sport',
  tabs: [['sport', 'Séances', I.dumbbell]],
  views: {
    sport: () => ({
      title: 'Sport',
      html: empty('Bientôt ici', 'Programmes, saisie rapide des séries, minuteur de repos, historique et records.')
    })
  }
});
