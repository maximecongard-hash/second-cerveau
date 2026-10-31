import { DEMO, sb } from './config.js';
import { uuid } from './util.js';
import { S } from './store.js';

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------
const urlCache = new Map();
async function imageURL(path) {
  if (!path) return null;
  if (path.startsWith('data:')) return path;
  if (!sb) return null;
  const c = urlCache.get(path);
  if (c && c.exp > Date.now()) return c.url;
  const { data, error } = await sb.storage.from('captures').createSignedUrl(path, 3600);
  if (error) return null;
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 3500e3 });
  return data.signedUrl;
}
export function hydrateImages(root) {
  root.querySelectorAll('img[data-img]').forEach(async img => {
    const u = await imageURL(img.dataset.img);
    if (u) img.src = u; else img.classList.add('missing');
  });
}
function resizeImage(file, max = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('Conversion impossible'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });
}
export async function uploadImage(file) {
  const blob = await resizeImage(file, DEMO ? 800 : 1600);
  if (DEMO) return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  if (!navigator.onLine) throw new Error('Hors ligne : impossible d’envoyer la photo');
  const path = `${S.user.id}/${uuid()}.jpg`;
  const { error } = await sb.storage.from('captures').upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}
