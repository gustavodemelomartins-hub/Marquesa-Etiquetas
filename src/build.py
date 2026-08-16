#!/usr/bin/env python3
"""Monta dashboard.html reaproveitando o CSS e o SheetJS do index.html,
para que o design fique idêntico e o app siga funcionando offline.

As fronteiras são achadas por conteúdo, não por número de linha — assim
editar o index.html não quebra a montagem."""
import pathlib

# A raiz sai do lugar deste arquivo — o build roda de qualquer pasta e em
# qualquer máquina, sem caminho absoluto escrito no código.
REPO = pathlib.Path(__file__).resolve().parent.parent

src = (REPO / "index.html").read_text(encoding="utf-8").split("\n")


def bloco(abre_idx, fecha_tag):
    """conteúdo entre a linha abre_idx (exclusiva) e a próxima fecha_tag"""
    fim = next(i for i in range(abre_idx + 1, len(src)) if src[i].strip() == fecha_tag)
    return "\n".join(src[abre_idx + 1:fim])


# CSS: único <style> do arquivo
i_style = next(i for i, l in enumerate(src) if l.strip() == "<style>")
base_css = bloco(i_style, "</style>")
assert ":root{" in base_css and len(base_css) > 15000, f"CSS suspeito: {len(base_css)}"

# SheetJS: o <script> cuja primeira linha cita SheetJS
i_sheet = next(
    i for i, l in enumerate(src)
    if l.strip() == "<script>" and "SheetJS" in src[i + 1]
)
sheetjs = bloco(i_sheet, "</script>")
assert "XLSX" in sheetjs and len(sheetjs) > 50000, f"SheetJS suspeito: {len(sheetjs)}"

tpl = (REPO / "src" / "dashboard.tpl.html").read_text(encoding="utf-8")
assert "/*__BASE_CSS__*/" in tpl and "<!--__SHEETJS__-->" in tpl

out = tpl.replace("/*__BASE_CSS__*/", base_css).replace("<!--__SHEETJS__-->", sheetjs)
(REPO / "dashboard.html").write_text(out, encoding="utf-8")
print(f"dashboard.html: {len(out):,} bytes  (css {len(base_css):,} · sheetjs {len(sheetjs):,})")
