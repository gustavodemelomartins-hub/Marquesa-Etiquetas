"""Testes do script auxiliar — sem rede, sem Instagram, sem API: tudo falso.
    python3 -m unittest scripts/instagram-avatares/test_sync_avatares.py
"""
import os, sys, unittest

sys.path.insert(0, os.path.dirname(__file__))
import sync_avatares as s  # noqa: E402


class ApiFalsa:
    def __init__(self, clientes):
        self.fila_ = list(clientes); self.enviados = []; self.chamadas_fila = 0
    def fila(self, limite, refazer):
        self.chamadas_fila += 1
        lote, self.fila_ = self.fila_[:limite], self.fila_[limite:]
        return lote
    def enviar(self, cid, resultado, candidatos=None, erro=None):
        self.enviados.append((cid, resultado, candidatos, erro))
        return {'ok': True, 'candidatos': len(candidatos or [])}


class BuscadorFalso:
    def __init__(self, respostas): self.r = respostas; self.buscas = []; self.perfis = []
    def buscar(self, nome):
        self.buscas.append(nome); x = self.r(nome)
        if isinstance(x, Exception): raise x
        return x
    def perfil(self, u): self.perfis.append(u); return {'user_id': '1', 'username': u, 'full_name': 'X', 'profile_pic_url': 'u'}


P = lambda u: {'user_id': '1', 'username': u, 'full_name': 'K', 'profile_pic_url': 'u'}
roda = lambda api, b, **k: s.processar(api, b, dormir=lambda _: None, log=lambda *_: None, **k)


class Testes(unittest.TestCase):
    def test_fluxo_normal_e_sem_resultado(self):
        api = ApiFalsa([{'id': 1, 'nome': 'A B'}, {'id': 2, 'nome': 'C D'}])
        r = roda(api, BuscadorFalso(lambda n: [P('a')] if n == 'A B' else []))
        self.assertEqual((r['processadas'], r['com_candidatos'], r['sem_resultado'], r['parou']), (2, 1, 1, None))
        self.assertEqual([e[1] for e in api.enviados], ['ok', 'ok'])

    def test_lotes_pequenos_e_limite(self):
        api = ApiFalsa([{'id': i, 'nome': f'N {i}'} for i in range(10)])
        r = roda(api, BuscadorFalso(lambda n: []), limite=7, lote=3)
        self.assertEqual(r['processadas'], 7)
        self.assertEqual(api.chamadas_fila, 3)  # 3 + 3 + 1: nunca mais que o lote

    def test_rate_limit_faz_backoff_e_depois_para_sem_culpar_a_cliente(self):
        esperas = []
        api = ApiFalsa([{'id': 1, 'nome': 'A B'}, {'id': 2, 'nome': 'C D'}])
        r = s.processar(api, BuscadorFalso(lambda n: s.LimiteDeRequisicoes()), dormir=esperas.append, log=print)
        self.assertEqual(r['parou'], 'rate_limit')
        self.assertEqual(esperas, [60.0, 120.0])      # backoff exponencial
        self.assertEqual(api.enviados, [])            # nada marcado como erro da cliente

    def test_rate_limit_que_passa_na_segunda_tentativa(self):
        estado = {'n': 0}
        def r(nome):
            estado['n'] += 1
            return s.LimiteDeRequisicoes() if estado['n'] == 1 else [P('a')]
        api = ApiFalsa([{'id': 1, 'nome': 'A B'}])
        res = roda(api, BuscadorFalso(r))
        self.assertEqual((res['com_candidatos'], res['parou']), (1, None))

    def test_sessao_expirada_para_na_hora(self):
        api = ApiFalsa([{'id': 1, 'nome': 'A B'}, {'id': 2, 'nome': 'C D'}])
        b = BuscadorFalso(lambda n: s.SessaoExpirada())
        r = roda(api, b)
        self.assertEqual(r['parou'], 'sessao_expirada')
        self.assertEqual(len(b.buscas), 1)            # não insiste
        self.assertEqual(api.enviados, [])

    def test_falha_do_instagram_registra_erro_e_segue_ate_3_seguidas(self):
        api = ApiFalsa([{'id': i, 'nome': f'N {i}'} for i in range(5)])
        r = roda(api, BuscadorFalso(lambda n: s.FalhaTemporaria('BadResponse')))
        self.assertEqual(r['parou'], 'instagram_instavel')
        self.assertEqual([e[1] for e in api.enviados], ['erro'] * 3)

    def test_falha_isolada_nao_derruba_o_lote(self):
        api = ApiFalsa([{'id': 1, 'nome': 'A B'}, {'id': 2, 'nome': 'C D'}])
        r = roda(api, BuscadorFalso(lambda n: s.FalhaTemporaria('x') if n == 'A B' else [P('c')]))
        self.assertEqual((r['erros'], r['com_candidatos'], r['parou']), (1, 1, None))

    def test_arroba_cadastrado_e_consultado_direto(self):
        api = ApiFalsa([{'id': 1, 'nome': 'A B', 'instagram': 'ab.joias'}])
        b = BuscadorFalso(lambda n: [P('ab.joias'), P('outro')])
        roda(api, b)
        self.assertEqual(b.perfis, ['ab.joias'])
        self.assertEqual([c['username'] for c in api.enviados[0][2]], ['ab.joias', 'outro'])  # sem duplicar

    def test_modo_seco_nao_envia_nada(self):
        api = ApiFalsa([{'id': 1, 'nome': 'A B'}])
        roda(api, BuscadorFalso(lambda n: [P('a')]), seco=True)
        self.assertEqual(api.enviados, [])

    def test_sem_credenciais_nao_roda_e_nao_vaza(self):
        for v in ('MARQUESA_API_URL', 'MARQUESA_API_KEY', 'INSTAGRAM_USERNAME', 'INSTAGRAM_SESSION_FILE'):
            os.environ.pop(v, None)
        self.assertEqual(s.principal([]), 2)

    def test_nenhum_segredo_no_codigo(self):
        src = open(s.__file__).read().lower()
        for proibido in ('password=', 'sessionid=', 'csrftoken'):
            self.assertNotIn(proibido, src)


if __name__ == '__main__':
    unittest.main()
