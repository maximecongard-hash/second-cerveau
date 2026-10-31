import { I, empty } from '../../core/util.js';
import { registerModule } from '../../core/modules.js';

// ---------------------------------------------------------------------------
// Module « Courses » : aperçu de la navigation, les listes partagées arrivent en phase 4
// ---------------------------------------------------------------------------
registerModule({
  id: 'courses',
  label: 'Courses',
  icon: I.cart,
  description: 'Listes de courses partagées, classées par rayon.',
  preview: true,
  defaultOn: false,
  home: 'courses',
  tabs: [['courses', 'Listes', I.cart]],
  views: {
    courses: () => ({
      title: 'Courses',
      html: empty('Bientôt ici', 'Listes partagées avec ton foyer, tri par rayon, produits habituels en un geste.')
    })
  }
});
