#!/usr/bin/env python3
"""Monta dashboard.html reaproveitando o CSS e o SheetJS do index.html,
para que o design fique idêntico e o app siga funcionando offline.

Também extrai o JsBarcode e o jsPDF do index.html para `vendor/`, porque a
tela de Etiquetas passou a morar dentro do painel: as duas bibliotecas
juntas somam ~370 KB e o dashboard.html é rebaixado da rede a cada
abertura (ver o sw.js). Em arquivo separado elas são baixadas uma vez, sob
demanda — só quando alguém abre a Etiqueta — e vêm do cache depois.

O index.html continua sendo a fonte única: nada aqui é copiado à mão.

As fronteiras são achadas por conteúdo, não por número de linha — assim
editar o index.html não quebra a montagem."""
import pathlib

# A raiz sai do lugar deste arquivo — o build roda de qualquer pasta e em
# qualquer máquina, sem caminho absoluto escrito no código.
REPO = pathlib.Path(__file__).resolve().parent.parent

# Não usar str.splitlines(): bibliotecas minificadas podem conter outros
# separadores Unicode válidos dentro do JavaScript. Separamos só em LF e
# retiramos o CR do fim de cada linha para o build ser igual em Windows/Linux.
src = [linha.removesuffix("\r") for linha in
       (REPO / "index.html").read_text(encoding="utf-8").split("\n")]


def bloco(abre_idx, fecha_tag):
    """conteúdo entre a linha abre_idx (exclusiva) e a próxima fecha_tag"""
    fim = next(i for i in range(abre_idx + 1, len(src)) if src[i].strip() == fecha_tag)
    return "\n".join(src[abre_idx + 1:fim])


def script_que_cita(marca):
    """o <script> cuja PRIMEIRA linha cita `marca` — é assim que cada
    biblioteca embutida se identifica no index.html"""
    i = next(
        i for i, l in enumerate(src)
        if l.strip() == "<script>" and marca in src[i + 1]
    )
    return bloco(i, "</script>")


# CSS: único <style> do arquivo
i_style = next(i for i, l in enumerate(src) if l.strip() == "<style>")
base_css = bloco(i_style, "</style>")
assert ":root{" in base_css and len(base_css) > 15000, f"CSS suspeito: {len(base_css)}"

sheetjs = script_que_cita("SheetJS")
assert "XLSX" in sheetjs and len(sheetjs) > 50000, f"SheetJS suspeito: {len(sheetjs)}"

jsbarcode = script_que_cita("JsBarcode")
assert "JsBarcode" in jsbarcode and len(jsbarcode) > 5000, f"JsBarcode suspeito: {len(jsbarcode)}"

jspdf = script_que_cita("jsPDF")
assert "jspdf" in jspdf and len(jspdf) > 100000, f"jsPDF suspeito: {len(jspdf)}"

tpl = (REPO / "src" / "dashboard.tpl.html").read_text(encoding="utf-8")
assert "/*__BASE_CSS__*/" in tpl and "<!--__SHEETJS__-->" in tpl

out = tpl.replace("/*__BASE_CSS__*/", base_css).replace("<!--__SHEETJS__-->", sheetjs)
# dashboard.html já é versionado em CRLF; os vendors, em LF.
(REPO / "dashboard.html").write_text(out, encoding="utf-8", newline="\r\n")

vendor = REPO / "vendor"
vendor.mkdir(exist_ok=True)
(vendor / "jsbarcode.min.js").write_text(jsbarcode + "\n", encoding="utf-8", newline="\n")
(vendor / "jspdf.min.js").write_text(jspdf + "\n", encoding="utf-8", newline="\n")

print(f"dashboard.html: {len(out):,} bytes  (css {len(base_css):,} · sheetjs {len(sheetjs):,})")
print(f"vendor/jsbarcode.min.js: {len(jsbarcode):,} bytes")
print(f"vendor/jspdf.min.js: {len(jspdf):,} bytes")
