/** Gera `schema-console.sql` a partir de `schema.sql`.
 *
 *  O console do D1 no painel da Cloudflare separa o texto por ';' e manda
 *  cada pedaço como uma query. Um pedaço que só tem comentário vira uma
 *  query vazia e o painel responde:
 *      "The request is malformed: Requests without any query are not supported"
 *
 *  Então a versão do console vai sem comentários e sem linha em branco
 *  sobrando. O arquivo comentado continua sendo a fonte — este é derivado,
 *  para os dois nunca discordarem.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const bruto = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

// A ordem importa: os comentários saem ANTES da divisão. Um ';' escrito
// dentro de um comentário partiria a frase ao meio e o resto do texto
// vazaria para dentro do comando seguinte.
const semComentarios = bruto.replace(/--[^\n]*/g, '');

const comandos = semComentarios
  .split(';')
  .map(p => p.replace(/\s+/g, ' ').trim())       // colapsa espaços e quebras
  .filter(Boolean);                              // descarta os pedaços vazios

const saida = comandos.map(c => c + ';').join('\n\n') + '\n';
writeFileSync(new URL('./schema-console.sql', import.meta.url), saida);

console.log(`schema-console.sql gerado: ${comandos.length} comandos, ${saida.length} bytes`);
console.log('nenhum pedaço vazio — pode colar direto no console do D1');
