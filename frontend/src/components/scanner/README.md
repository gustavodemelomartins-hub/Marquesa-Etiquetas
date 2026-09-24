# Leitor de etiquetas — a camada compartilhada

> **Para o Codex:** é isto que Revendedoras deve consumir em "montar maleta"
> e "conferir devolução". Não escreva um segundo leitor — se algo aqui não
> servir, o certo é mudar esta camada, não duplicá-la. Dois leitores
> divergem no primeiro ajuste, e o que diverge numa conferência física é a
> contagem de peça de verdade.

A fronteira é uma só:

```
captura (câmera)
      ↓
decodificação (BarcodeDetector ou ZXing)
      ↓
antirrepique (o mesmo código não conta duas vezes por engano)
      ↓
aoLer(codigo)  ← daqui para baixo é o consumidor
      ↓
normalização → SKU → a regra do módulo
```

O leitor **não sabe** o que é inventário, maleta, SKU ou produto. Ele
entrega uma string e recebe de volta uma frase para mostrar e um "deu
certo" para tocar o som. Essa ignorância é o que permite os dois módulos
usarem o mesmo código sem concordarem sobre nada além do formato da
etiqueta.

## Arquivos

| arquivo | o que é |
|---|---|
| `LeitorDeEtiquetas.tsx` | o componente: câmera, laço, antirrepique, entrada manual |
| `leitorDeEtiqueta.ts` | a decodificação e o bipe. Sem React, sem domínio |
| `codigoDaEtiqueta.ts` | puro: normalizar o código e resolver para um SKU do catálogo |
| `codigoDaEtiqueta.test.ts` | 10 provas da resolução |
| `LeitorDeEtiquetas.test.tsx` | 13 provas do laço, do desligamento e da entrada manual |

Estilos: `frontend/src/styles/inventario.css`, bloco `.mq-cam`.

## A API

```ts
interface Props {
  aoLer: (codigo: string) => Promise<ResultadoDaLeitura>;
  aoFechar: () => void;
  pausado?: boolean;
  titulo?: string;
  dica?: string;
  intervaloRepetidoMs?: number;   // padrão 1800
}

interface ResultadoDaLeitura { ok: boolean; texto: string }
```

**`aoLer`** recebe o código **cru**, do jeito que saiu da etiqueta.
Normalizar e resolver é do consumidor — use `resolverSku`. Enquanto a
promessa não resolve, nenhum quadro novo é lido: é o que impede uma fila de
gravações concorrentes sobre a mesma linha.

**`pausado`** congela a leitura **sem desligar a câmera**. Use quando abrir
um diálogo por cima (o Inventário usa na pergunta de variação). Desligar e
religar pediria permissão de novo no iPhone.

**`aoFechar`** roda **depois** de a câmera já ter sido desligada.

## Exemplo mínimo

```tsx
import { LeitorDeEtiquetas } from '../../components/scanner/LeitorDeEtiquetas';
import { resolverSku } from '../../components/scanner/codigoDaEtiqueta';
import { temCamera } from '../../components/scanner/leitorDeEtiqueta';

const porSku = useMemo(() => new Map(itens.map((i) => [i.sku, i])), [itens]);

{temCamera() && (
  <button type="button" onClick={() => setCamera((v) => !v)}>
    {camera ? 'Fechar câmera' : 'Abrir câmera'}
  </button>
)}

{camera && (
  <LeitorDeEtiquetas
    aoFechar={() => setCamera(false)}
    pausado={!!algumDialogoAberto}
    titulo="Bipe cada peça que a revendedora devolveu"
    aoLer={async (codigo) => {
      const sku = resolverSku(codigo, porSku);
      if (!sku) return { ok: false, texto: `${codigo} não está nesta maleta` };
      const r = await gravarNoServidor(sku);       // a SUA rota, a que já existe
      return r.ok
        ? { ok: true, texto: `${porSku.get(sku)!.desc} ✓` }
        : { ok: false, texto: r.erro };
    }}
  />
)}
```

## Três coisas que não são detalhe

**1. O antirrepique não vale para a entrada manual.** A câmera vê o mesmo
código dezenas de vezes por segundo e precisa de uma janela; quem digitou
duas vezes quis contar duas. São problemas diferentes e o código trata
como tal.

**2. `resolverSku` devolve o código do CATÁLOGO, não o da etiqueta.**
Etiqueta antiga traz zero à esquerda; etiqueta de peça com aro traz o aro
no código. Mandar o código cru para a rota dá 409 de peça inexistente.

**3. Quem decide o que a leitura significa é você.** O leitor não recusa
nada: ele entrega o código e mostra a frase que você devolver. Se o
servidor recusar, a frase é a do servidor — ela diz o motivo exato, e a
tela chutando o motivo erraria.

## O que esta camada NÃO faz

- não grava nada, em lugar nenhum;
- não conhece nenhuma rota;
- não decide se um código é válido;
- não guarda contagem em memória — cada leitura vai para o consumidor na
  hora, e é ele que persiste.

O histórico completo do leitor do painel clássico, de onde tudo isto foi
portado, está em
[`docs/domains/SCANNER_ETIQUETAS.md`](../../../../docs/domains/SCANNER_ETIQUETAS.md).
