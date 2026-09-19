# Conceitos de Vendas

Estas propostas são protótipos locais. Não alteram regra de negócio e não
representam comportamento ativo em produção.

## Monte seu Colar simplificado

- [Abrir o protótipo](monte-seu-colar-simples.html)
- [Captura mobile](monte-seu-colar-simples-mobile.png)
- [Captura das cores compactas](monte-seu-colar-cores-compactas.png)
- [Captura de combinação nova](monte-seu-colar-nova-combinacao-mobile.png)
- [Teste de navegador](verify-monte-seu-colar-simples.mjs)

O conceito começa por quantidades de Menino e Menina, cria uma escolha de cor
por unidade, reconhece automaticamente as cinco configurações comerciais
existentes e permite experimentar uma nova configuração com SKU, nome,
pingente extra e preço. Combinações novas recebem uma simulação de SKU
automático com seis dígitos e uma sugestão de preço baseada na faixa dos cinco
modelos conhecidos; ambos permanecem editáveis.

O desenho foi aprovado por Gustavo em 13/09/2026 e promovido para o
[`master.html`](../master.html). Este arquivo permanece como registro da
exploração. A promoção vale para o protótipo de UX; composição livre e preço
manual continuam recusados pela regra vigente em `api/REGRAS.md` §42 até uma
decisão própria de implementação transacional.
