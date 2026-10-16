import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = 'assets/3d';
if (!existsSync(root)) {
  console.log('Ainda não há pacote de recursos 3D externos. A primeira cena utiliza geometrias geradas em código.');
  process.exit(0);
}
const allowed = new Set(['.glb', '.gltf', '.png', '.jpg', '.jpeg', '.webp', '.ktx2', '.basis', '.ogg', '.mp3', '.wav']);
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(path);
  }
}
walk(root);
const unsupported = files.filter((file) => {
  const extension = file.slice(file.lastIndexOf('.')).toLowerCase();
  return !allowed.has(extension) && !file.endsWith('README.md') && !file.endsWith('LICENSES.md');
});
if (unsupported.length) {
  console.error('Arquivos de recursos com extensão não reconhecida:\n' + unsupported.join('\n'));
  process.exit(1);
}
console.log('Verificação básica de extensões concluída: ' + files.length + ' arquivo(s).');
