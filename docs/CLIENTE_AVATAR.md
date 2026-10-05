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

## R2

A foto confirmada vai para o mesmo binding `FOTOS` das fotos de peça: PROD
`marquesa-fotos` (desde 29/09/2026), DEV `marquesa-fotos-dev` (ver
`api/wrangler.toml`). Sem o binding, confirmar devolve 503 com mensagem clara
e **nada é gravado**; todo o resto funciona. As rotas reaproveitam a mesma
validação e a mesma mensagem de `fotos-storage.js`.

## Rodar a busca (script auxiliar)

`scripts/instagram-avatares/` — roda na máquina de quem opera, de preferência
com IP residencial (datacenter/GitHub Actions é bloqueado pelo Instagram, e
colocaria a conta em risco).

> **Estar logado no navegador NÃO dá sessão ao Instaloader.** A sessão é um
> arquivo próprio dele, criado uma vez e reaproveitado. Sem ele o script para
> com "arquivo de sessão do Instagram não encontrado".

### 1. Instalar (uma vez)

```powershell
python -m pip install --user -r scripts/instagram-avatares/requirements.txt
```

### 2. Criar a sessão (uma vez; de novo só se expirar)

O arquivo fica **fora do repositório**, no lugar padrão do Instaloader:
`%LOCALAPPDATA%\Instaloader\session-<usuario>`.

**Caminho A — login no próprio Instaloader (recomendado).** A senha é
digitada só no prompt dele (não aparece na tela, não vai para arquivo,
histórico, chat ou log). Se a conta tiver 2 fatores, ele pede o código.

```powershell
python -m instaloader --login <usuario_da_marquesa>
# Password: ********      → "Saved session to ...\Instaloader\session-<usuario>"
# (pode encerrar com Ctrl+C depois da mensagem de sessão salva)
```

**Caminho B — reaproveitar o login do Firefox.** Só Firefox é confiável no
Windows (o Chrome cifra os cookies e o Instaloader não lê).

```powershell
python -m pip install --user browser_cookie3
python -m instaloader --load-cookies firefox --sessionfile "$env:LOCALAPPDATA\Instaloader\session-<usuario>"
```

Nunca copie `sessionid`/cookie à mão para variável, `.env`, chat ou Git.

### 3. Testar a sessão (não fala com a API da Marquesa)

```powershell
$env:INSTAGRAM_USERNAME = '<usuario_da_marquesa>'
$env:INSTAGRAM_SESSION_FILE = "$env:LOCALAPPDATA\Instaloader\session-$env:INSTAGRAM_USERNAME"
python scripts/instagram-avatares/sync_avatares.py --testar-sessao
# Sessão válida: @<usuario>          (saída 0)
# Sessão NÃO vale: ...               (saída 3 → refaça o passo 2)
```

### 4. Prévia — 5 clientes, sem gravar nada

```powershell
$env:MARQUESA_API_URL = 'https://marquesa-api.<conta>.workers.dev'
$env:MARQUESA_API_KEY = '<chave>'          # digitada no terminal, nunca em arquivo
python scripts/instagram-avatares/sync_avatares.py --seco --limite 5
```

O `--seco` busca no Instagram e pede ao Worker a **mesma pontuação** de
verdade (`simular: true`), mas nada é gravado — nem candidato, nem checkpoint,
nem a marca de "nome curto". A saída mostra, por cliente, quem viraria
sugestão e quem seria descartado:

```
  [seco] #31 Brenda Vitachi: 4 perfil(is) encontrado(s)
         SUGESTÃO  @brendavitachi  Brenda Vitachi  nota 0.95 (nome_completo)
         descarta  @brenda.v  Brenda  nota 0.00
```

### 5. Amostra real e depois o resto

```powershell
python scripts/instagram-avatares/sync_avatares.py --limite 5     # confira na ficha de cada uma
python scripts/instagram-avatares/sync_avatares.py --limite 10    # só se a qualidade foi boa
python scripts/instagram-avatares/sync_avatares.py --cliente 31   # uma cliente só
GET /api/clientes/avatar/resumo                                    # acompanhar
```

Comece por 5–10 clientes e confira a qualidade na tela antes de aumentar —
**nunca centenas de uma vez**. Padrão: 8 s (+ jitter) entre clientes, lotes
de 5, backoff 60/120/240 s em rate limit, para na primeira sessão expirada,
desiste após 3 falhas seguidas. **Segredos só por variável de ambiente** —
nada de login, senha, cookie ou sessão no repositório, no frontend, em log ou
em resposta de API.

### "Buscar foto" na ficha

Na ficha da cliente o avatar é sempre tocável. Sem foto e sem sugestão, o
diálogo diz em que pé está a busca (nunca buscada, pedida, sem resultado,
erro, nome curto) e oferece **Buscar foto**: `POST
/api/clientes/:id/avatar/buscar` põe a cliente no **começo** da fila. O
Worker continua sem falar com o Instagram — a sugestão aparece depois da
próxima rodada do script, e alguém ainda precisa tocar em "É ela".

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
  validada contra o Instagram real** — ver `docs/testing/TESTING.md`.

## Telas (frontend V2, React)

`frontend/src/components/AvatarCliente.tsx` é o componente único: foto
confirmada → foto; senão iniciais (que ficam por baixo — se a imagem falha,
ela se retira); com sugestão pendente aparece uma bolinha dourada. Usado na
lista de clientes, na visão geral (top/recorrentes/para chamar de volta) e na
ficha. Na ficha o avatar vira botão e abre `SugestaoDeFoto.tsx` ("É ela /
Não é ela / Próxima sugestão", ou "Remover foto" se já há foto). A API
decora `GET /api/clientes`, `/api/clientes/perfil` e `/api/analytics/crm` com
`avatarUrl` (link assinado) e `avatarSugestao`; sem a migration ou sem R2 essas
rotas respondem como antes. O painel legado (`src/dashboard.tpl.html`) não foi
alterado.
