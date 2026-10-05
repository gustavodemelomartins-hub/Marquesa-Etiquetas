#!/usr/bin/env python3
"""Busca candidatos de foto do Instagram PÚBLICO para as clientes da Marquesa.

Roda FORA do Worker (Python + Instaloader), na máquina de quem opera — de
preferência com IP residencial, que o Instagram trata melhor que datacenter.
Este script só PROCURA e ENTREGA candidatos crus à API; quem pontua, guarda e
confirma é o Worker (api/src/cliente-avatar.js), e quem confirma é uma pessoa,
na tela de Clientes ("É ela" / "Não é ela").

Fluxo, sempre sequencial (nunca em paralelo):

    GET  /api/clientes/avatar/fila          quem ainda não foi procurada
    <Instagram: busca por nome / @ cadastrado>
    POST /api/clientes/avatar/candidatos    o que achou (ou o erro)

A fila no servidor É o checkpoint: interromper e rodar de novo continua de
onde parou. Cliente nova entra na fila sozinha.

Segredos — somente variáveis de ambiente, nunca argumento, arquivo versionado
ou log:
    MARQUESA_API_URL, MARQUESA_API_KEY
    INSTAGRAM_USERNAME, INSTAGRAM_SESSION_FILE   (sessão do Instaloader)

Ordem de uso (docs/CLIENTE_AVATAR.md):
    --testar-sessao          a sessão vale? (só Instagram, não fala com a API)
    --seco --limite 5        busca e mostra o que VIRARIA sugestão; não grava
    --limite 5..10           amostra real; confira na ficha antes de aumentar
    --cliente ID             só aquela cliente (o "Buscar foto" da ficha)
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request
from typing import Callable, Optional

MAX_PERFIS_POR_BUSCA = 8


class SessaoExpirada(Exception):
    """A sessão do Instagram não vale mais — nada a fazer além de parar."""


class LimiteDeRequisicoes(Exception):
    """Instagram pediu para esperar (HTTP 429 / 'too many requests')."""


class FalhaTemporaria(Exception):
    """Qualquer outro problema do Instagram: rede, endpoint mudou, resposta ruim."""


# --------------------------------------------------------------- Instagram

class InstaloaderBuscador:
    """Adapta o Instaloader. Isolado aqui para trocar de biblioteca sem mexer
    no resto, e para os testes usarem um buscador falso."""

    def __init__(self, usuario: str, arquivo_sessao: str):
        import instaloader  # import tardio: os testes não precisam da biblioteca
        self._il = instaloader
        self._L = instaloader.Instaloader(quiet=True, max_connection_attempts=1,
                                          download_pictures=False, save_metadata=False)
        try:
            self._L.load_session_from_file(usuario, arquivo_sessao)
        except FileNotFoundError:
            raise SessaoExpirada('arquivo de sessão do Instagram não encontrado')

    def _traduz(self, e: Exception):
        x = self._il.exceptions
        if isinstance(e, (x.LoginRequiredException, x.BadCredentialsException,
                          x.TwoFactorAuthRequiredException, x.LoginException)):
            return SessaoExpirada('sessão do Instagram expirada ou inválida')
        if isinstance(e, x.TooManyRequestsException):
            return LimiteDeRequisicoes('limite de requisições do Instagram')
        return FalhaTemporaria(type(e).__name__)

    @staticmethod
    def _perfil_para_dict(p) -> dict:
        # Lê só o que a própria busca já devolveu (`_node`). As propriedades
        # públicas do Instaloader (`profile_pic_url`, `full_name`) podem
        # disparar UMA REQUISIÇÃO EXTRA por perfil para buscar a versão HD —
        # multiplicando o risco de rate limit. A miniatura da busca (~150 px)
        # é justamente o tamanho que o avatar precisa.
        n = getattr(p, '_node', None) or {}
        return {'user_id': str(n.get('pk') or n.get('id') or ''), 'username': n.get('username') or '',
                'full_name': n.get('full_name') or '',
                'profile_pic_url': n.get('profile_pic_url') or n.get('profile_pic_url_hd')}

    def testar(self) -> Optional[str]:
        """Quem a sessão diz ser, ou None se o Instagram não a aceita mais.
        Uma requisição só, e nenhuma busca."""
        try:
            return self._L.test_login()
        except Exception as e:  # noqa: BLE001
            raise self._traduz(e) from None

    def buscar(self, nome: str) -> list[dict]:
        try:
            achados = self._il.TopSearchResults(self._L.context, nome).get_profiles()
            return [self._perfil_para_dict(p) for _, p in zip(range(MAX_PERFIS_POR_BUSCA), achados)]
        except Exception as e:  # noqa: BLE001 — toda falha do Instagram é traduzida
            raise self._traduz(e) from None

    def perfil(self, username: str) -> Optional[dict]:
        try:
            return self._perfil_para_dict(self._il.Profile.from_username(self._L.context, username))
        except self._il.exceptions.ProfileNotExistsException:
            return None
        except Exception as e:  # noqa: BLE001
            raise self._traduz(e) from None


# ------------------------------------------------------------ API Marquesa

class ApiMarquesa:
    def __init__(self, base: str, chave: str):
        self._base, self._chave = base.rstrip('/'), chave

    def _req(self, metodo: str, caminho: str, corpo=None):
        dados = None if corpo is None else json.dumps(corpo).encode()
        req = urllib.request.Request(self._base + caminho, data=dados, method=metodo, headers={
            'Authorization': 'Bearer ' + self._chave, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read() or b'null')
        except urllib.error.HTTPError as e:
            raise RuntimeError(f'API respondeu {e.code} em {metodo} {caminho}') from None
        except urllib.error.URLError as e:
            raise RuntimeError(f'API inacessível em {caminho}: {e.reason}') from None

    def fila(self, limite: int, refazer: bool, cliente: Optional[int] = None, seco: bool = False):
        return self._req('GET', f'/api/clientes/avatar/fila?limite={limite}' + ('&refazer=1' if refazer else '')
                         + (f'&cliente={int(cliente)}' if cliente else '') + ('&seco=1' if seco else ''))

    def simular(self, cliente_id: int, candidatos):
        """A MESMA pontuação do servidor, sem gravar nada (o `--seco`)."""
        return self._req('POST', '/api/clientes/avatar/candidatos', {
            'clienteId': cliente_id, 'resultado': 'ok', 'candidatos': candidatos or [], 'simular': True})

    def enviar(self, cliente_id: int, resultado: str, candidatos=None, erro=None):
        return self._req('POST', '/api/clientes/avatar/candidatos', {
            'clienteId': cliente_id, 'resultado': resultado,
            'candidatos': candidatos or [], 'erro': erro})


# ----------------------------------------------------------------- o lote

def com_backoff(fn: Callable, dormir: Callable[[float], None], tentativas=3, base=60.0):
    """Repete só em limite de requisições, esperando 60s, 120s, 240s…
    Sessão expirada e falha comum sobem na hora — insistir só piora."""
    for i in range(tentativas):
        try:
            return fn()
        except LimiteDeRequisicoes:
            if i == tentativas - 1:
                raise
            dormir(base * (2 ** i))


def _mostrar_previa(log, c, achados, previa):
    """O `--seco` imprime o que uma pessoa decidiria na ficha: @, nome, nota."""
    log(f"  [seco] #{c['id']} {c['nome']}: {len(achados)} perfil(is) encontrado(s)")
    sug = (previa or {}).get('sugestoes') or []
    if not sug:
        log('         nenhum vira sugestão (nada passa de 0,6)')
    for x in sug:
        log(f"         SUGESTÃO  @{x['username']}  {x.get('nome') or '—'}  nota {x['score']:.2f} ({x['motivo']})")
    for x in ((previa or {}).get('descartados') or [])[:3]:
        log(f"         descarta  @{x['username']}  {x.get('nome') or '—'}  nota {x['score']:.2f}")


def processar(api, buscador, *, limite=10, lote=5, atraso=8.0, refazer=False, seco=False,
              dormir=time.sleep, log=print, base_backoff=60.0, falhas_seguidas_max=3,
              cliente: Optional[int] = None) -> dict:
    """Devolve o resumo. `parou` diz por que terminou antes do limite, se terminou."""
    r = {'processadas': 0, 'com_candidatos': 0, 'sem_resultado': 0, 'erros': 0, 'parou': None}
    falhas = 0
    if cliente:
        limite = 1
    while r['processadas'] < limite:
        fila = api.fila(min(lote, limite - r['processadas']), refazer, cliente=cliente, seco=seco)
        if not fila:
            break
        for c in fila:
            try:
                def procurar():
                    achados = []
                    if c.get('instagram'):               # @ já cadastrado: consulta direta
                        p = buscador.perfil(c['instagram'])
                        if p:
                            achados.append(p)
                    for p in buscador.buscar(c['nome']):
                        if all(p['username'] != a['username'] for a in achados):
                            achados.append(p)
                    return achados
                achados = com_backoff(procurar, dormir, base=base_backoff)
                falhas = 0
            except SessaoExpirada:
                r['parou'] = 'sessao_expirada'
                return r
            except LimiteDeRequisicoes:
                # culpa do Instagram, não da cliente: não marca erro nela, só para
                r['parou'] = 'rate_limit'
                return r
            except FalhaTemporaria as e:
                falhas += 1
                r['erros'] += 1
                r['processadas'] += 1
                if not seco:
                    api.enviar(c['id'], 'erro', erro=f'instagram: {e}')
                if falhas >= falhas_seguidas_max:
                    r['parou'] = 'instagram_instavel'
                    return r
                dormir(atraso * (2 ** falhas))
                continue
            r['processadas'] += 1
            if seco:
                previa = api.simular(c['id'], achados)
                _mostrar_previa(log, c, achados, previa)
                if (previa or {}).get('sugestoes'):
                    r['com_candidatos'] += 1
                else:
                    r['sem_resultado'] += 1
            else:
                resp = api.enviar(c['id'], 'ok', candidatos=achados)
                if resp.get('candidatos'):
                    r['com_candidatos'] += 1
                else:
                    r['sem_resultado'] += 1
            dormir(atraso + random.uniform(0, atraso / 2))
        if seco:
            break  # sem POST a fila não avança: um lote basta para amostrar
    return r


def principal(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--limite', type=int, default=10, help='clientes nesta rodada (padrão 10 — comece pequeno)')
    ap.add_argument('--lote', type=int, default=5, help='clientes por pedido de fila (padrão 5)')
    ap.add_argument('--atraso', type=float, default=8.0, help='segundos entre clientes (padrão 8, mais jitter)')
    ap.add_argument('--refazer', action='store_true', help='reabre buscas com mais de 90 dias')
    ap.add_argument('--seco', action='store_true', help='busca e mostra a prévia pontuada, mas NÃO grava nada')
    ap.add_argument('--cliente', type=int, help='só esta cliente (id) — o "Buscar foto" da ficha')
    ap.add_argument('--testar-sessao', action='store_true', help='só confere se a sessão do Instagram vale')
    a = ap.parse_args(argv)
    if a.testar_sessao:
        return testar_sessao()
    falta = [v for v in ('MARQUESA_API_URL', 'MARQUESA_API_KEY', 'INSTAGRAM_USERNAME', 'INSTAGRAM_SESSION_FILE')
             if not os.environ.get(v)]
    if falta:
        print('Faltam variáveis de ambiente: ' + ', '.join(falta), file=sys.stderr)
        return 2
    try:
        buscador = InstaloaderBuscador(os.environ['INSTAGRAM_USERNAME'], os.environ['INSTAGRAM_SESSION_FILE'])
        r = processar(ApiMarquesa(os.environ['MARQUESA_API_URL'], os.environ['MARQUESA_API_KEY']), buscador,
                      limite=min(a.limite, 100), lote=max(1, min(a.lote, 10)), atraso=max(a.atraso, 3.0),
                      refazer=a.refazer, seco=a.seco, cliente=a.cliente)
    except SessaoExpirada as e:
        print(f'Parei: {e}. Refaça o login do Instaloader e rode de novo.', file=sys.stderr)
        return 3
    except RuntimeError as e:
        print(f'Parei: {e}', file=sys.stderr)
        return 4
    print(json.dumps(r, ensure_ascii=False))
    return 0 if r['parou'] is None else 3


def testar_sessao(buscador_cls=None) -> int:
    """0: a sessão vale. 3: não vale (refaça o login). 2: faltam variáveis.
    Nunca imprime o conteúdo da sessão — só o usuário que ela diz ser."""
    falta = [v for v in ('INSTAGRAM_USERNAME', 'INSTAGRAM_SESSION_FILE') if not os.environ.get(v)]
    if falta:
        print('Faltam variáveis de ambiente: ' + ', '.join(falta), file=sys.stderr)
        return 2
    try:
        b = (buscador_cls or InstaloaderBuscador)(os.environ['INSTAGRAM_USERNAME'], os.environ['INSTAGRAM_SESSION_FILE'])
        quem = b.testar()
    except (SessaoExpirada, LimiteDeRequisicoes, FalhaTemporaria) as e:
        print(f'Sessão NÃO vale: {e}. Refaça o login (docs/CLIENTE_AVATAR.md).', file=sys.stderr)
        return 3
    if not quem:
        print('Sessão NÃO vale: o Instagram não reconheceu o login. Refaça o login.', file=sys.stderr)
        return 3
    if quem.lower() != os.environ['INSTAGRAM_USERNAME'].lower():
        print(f'Sessão é de @{quem}, não de @{os.environ["INSTAGRAM_USERNAME"]}. Confira a conta.', file=sys.stderr)
        return 3
    print(f'Sessão válida: @{quem}')
    return 0


if __name__ == '__main__':
    sys.exit(principal())
