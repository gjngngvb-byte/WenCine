import { existsSync, readFileSync } from 'node:fs';

const path = '.env';
if (!existsSync(path)) {
  console.error('Arquivo .env não encontrado. Copie .env.example para .env antes de iniciar localmente.');
  process.exit(1);
}
const required = ['DATABASE_URL', 'APP_ORIGIN', 'NEXT_PUBLIC_API_URL'];
const values = readFileSync(path, 'utf8');
const missing = required.filter((key) => !new RegExp('^' + key + '=' , 'm').test(values));
if (missing.length) {
  console.error('Variáveis ausentes no .env: ' + missing.join(', '));
  process.exit(1);
}
console.log('As variáveis mínimas de ambiente estão declaradas. Confirme manualmente os valores antes de usar.');
