# Foto da cliente (avatar do Instagram)

Enriquecimento visual de **Clientes**: quando se acha, e uma pessoa confirma, o
perfil público certo, a cliente passa a ter foto no lugar das iniciais. Nada
mais: sem seguidores, posts, stories ou curtidas — só `user id`, `username`,
nome público e a miniatura da foto.

> Foto faltando é melhor que foto da pessoa errada. **Não há autoaceite.**

## Como funciona

```
cliente cadastrada (qualquer caminho, sem saber que isto existe)
        │
        ▼
GET  /api/clientes/avatar/fila ◄── script auxiliar (Python + Instaloader, FORA do Worker)
        │                              busca por nome (+ @ cadastrado), devagar, em lotes
        ▼
POST /api/clientes/avatar/candidatos   o Worker PONTUA e guarda só o que passa de 0,6
        │
        ▼
tela de Clientes: avatar com marca de sugestão → "É ela" / "Não é ela" / "Próxima"
        │ É ela
        ▼
Worker baixa a miniatura → R2 `clientes/<id>/avatar` → D1 `cliente_avatar`
```

* **Fila = checkpoint.** Cliente sem linha em `cliente_avatar_busca` está na
  fila — inclusive a criada depois da carga inicial. Interromper e rodar de novo
  continua de onde parou. Criar cliente nunca chama o Instagram.
* **Pontuação** (`api/src/cliente-avatar.js › pontuar`): exige primeiro **e**
  último nome; primeiro nome sozinho nunca basta; nome único nunca pontua;
  ignora acento, caixa e partículas (de/da/do); aceita abreviação (fraca).
  Homônimos (outra cliente com o mesmo nome, ou 2+ perfis fortes) geram aviso
  na tela. O mesmo `@` não pode ser a foto de duas clientes (409).
* **Resiliência.** Instagram fora, rate limit, sessão expirada, perfil
  removido/privado: o script para ou registra `erro`; a lista de Clientes
  segue igual (`anexarAvatares` engole a falta das tabelas/do R2). Erro volta à
  fila após 1 h, no máximo 3 tentativas.
* **Foto.** A miniatura da busca (~150 px) já é pequena; o Worker só aceita
  JPEG/PNG/WebP reais (confere os bytes), host `cdninstagram.com`/`fbcdn.net`
  e ≤ 512 KB. A tela usa `object-fit: cover` (sem distorcer o rosto).
  Servida por link assinado (HMAC, igual à foto da peça).

## Banco

`api/migracao-cliente-avatar.sql` — três tabelas **novas** (`cliente_avatar`,
`cliente_avatar_candidato`, `cliente_avatar_busca`); nenhuma tabela existente é
tocada. Idempotente. Reversão: `api/migracao-cliente-avatar-rollback.sql`
(só apaga essas três). `schema.sql` já as contém.

```bash
cd api
npx wrangler d1 execute DB --env staging --remote --file=migracao-cliente-avatar.sql   # DEV
npx wrangler d1 execute DB --remote --file=migracao-cliente-avatar.sql                 # PROD
```

## R2 — pré-requisito em PRODUÇÃO

Produção **não tem R2** (conta responde erro 10042; ver `api/wrangler.toml`).
Sem R2, confirmar devolve 503 com mensagem clara e **nada é gravado**; todo o
resto funciona. Para ligar: habilitar R2 na conta, `wrangler r2 bucket create
marquesa-fotos`, recolocar `[[r2_buckets]] binding = "FOTOS"` no `wrangler.toml`
e publicar. DEV já tem o bucket `marquesa-fotos-dev`. As rotas novas reaproveitam
o mesmo binding, a mesma validação e a mesma mensagem de `fotos-storage.js`.

## Rodar a busca (script auxiliar)

`scripts/instagram-avatares/` — roda na máquina de quem opera, de preferência
com IP residencial (datacenter/GitHub Actions é bloqueado pelo Instagram, e
colocaria a conta em risco).

```bash
pip install -r scripts/instagram-avatares/requirements.txt
instaloader --login SEU_USUARIO          # grava a sessão FORA do repositório
export MARQUESA_API_URL=https://…workers.dev   MARQUESA_API_KEY=…
export INSTAGRAM_USERNAME=…   INSTAGRAM_SESSION_FILE=~/.config/instaloader/session-SEU_USUARIO
python3 scripts/instagram-avatares/sync_avatares.py --seco --limite 5   # só olha, não envia
python3 scripts/instagram-avatares/sync_avatares.py --limite 10         # amostra real
GET /api/clientes/avatar/resumo                                         # acompanhar
```

Comece por 5–10 clientes e confira a qualidade na tela antes de aumentar.
Padrão: 8 s (+ jitter) entre clientes, lotes de 5, backoff 60/120/240 s em rate
limit, para na primeira sessão expirada, desiste após 3 falhas seguidas.
**Segredos só por variável de ambiente** — nada de login, senha, cookie ou
sessão no repositório, no frontend, em log ou em resposta de API.

## Escolha da biblioteca

* **Instaloader** (escolhida; 4.15.3, jul/2026): usa os endpoints *web*
  públicos, autentica com **arquivo de sessão** (o projeto nunca vê a senha),
  tem `TopSearchResults` (nome → username/nome/foto) e exceções tipadas para
  rate limit e login. O adaptador lê só o `_node` que a busca já devolveu — as
  propriedades públicas (`profile_pic_url`) disparam uma requisição extra por
  perfil.
* **instagrapi** (3.0.19, out/2026): mais completo, mas usa a API *privada
  mobile* e exige login com usuário/senha (desafios, bloqueios) — maior risco
  para a conta para um uso que só precisa de busca + miniatura.
* **Limitação real:** ambas dependem de comportamento não oficial; a busca
  por nome do Instagram quase sempre exige sessão logada e pode mudar sem aviso.
  Foi tratado como integração não confiável (ver Resiliência). **Não foi
  validada contra o Instagram real** — ver `docs/TESTING.md`.

## Telas

`avatarCliente(c, tam)` em `src/dashboard.tpl.html` é o componente único:
foto confirmada → foto; senão iniciais; com sugestão pendente ou foto, vira
botão (modal "É ela / Não é ela / Próxima sugestão", ou "Remover foto").
Usado nos cartões de Clientes, Top clientes, ficha, busca global e escolha de
cliente na venda. O frontend React V2 ainda não tem módulo de Clientes.
