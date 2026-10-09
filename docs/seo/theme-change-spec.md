# Alterações de tema preparadas — SEO Marquesa

Tema ativo confirmado: Amazonas. A edição visual e o cadastro da Nuvemshop
não expõem os templates que geram o título global e o JSON-LD. Acesso FTP
está ativo, mas não foi localizada uma sessão/perfil protegido utilizável;
a senha mascarada não foi lida nem regenerada.

Estas alterações estão especificadas e dependem do código real do tema para
backup, diff, aplicação e validação. **Não foram publicadas.** Não criar um
template por nome presumido nem substituir o tema pelo rascunho de outro tema.

## Título da home e listagem

- Home: `Semijoias em Prata 925 e Banho de Ouro 18k | Marquesa`.
- Listagem geral: `Colares, Brincos, Anéis e Pulseiras | Marquesa Semijoias`.
- Preservar o nome comercial `Marquesa Semijóias`, identidade visual, navegação
  e canonical. O título atual da home herda o nome comercial; editar esse nome
  para obter um title diferente também alteraria marca e textos de logo.
- Manter a meta da home já publicada e os títulos/metas das cinco páginas
  institucionais, com conteúdo/handles preservados.

## Organization e variantes

A entidade sem logo tem origem nos `offers.seller` dos Products da PDP e dos
cards de relacionados. O Product principal está em `WebPage.mainEntity`.
Não confundir os Products das recomendações com o produto da página.

Após localizar os templates reais, declarar uma Organization central com
`@id=https://marquesasemijoias.com.br/#organization`, URL oficial, nome comercial
e logo abaixo. Referenciar esse `@id` nos sellers existentes. Preservar Products,
offers, preços, BRL, disponibilidade e identidade. Não acrescentar dezenas de
cópias da Organization nem substituir seller por uma entidade sem referência.

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://marquesasemijoias.com.br/#organization",
  "name": "Marquesa Semijóias",
  "url": "https://marquesasemijoias.com.br/",
  "logo": {
    "@type": "ImageObject",
    "url": "https://dcdn-us.mitiendanube.com/stores/005/134/350/themes/common/logo-425249957-1744020890-2e94c796862ce8e440fea3e0bed40e561744020890-320-0.webp",
    "width": 320,
    "height": 128
  }
}
```

Google recomenda marca quando conhecida; logo ausente não torna, por si só,
Product/Offer inválido. O pedido explícito de corrigir a Organization permanece
pendente do source. [Organization Google](https://developers.google.com/search/docs/appearance/structured-data/organization).

Para produtos com variantes, aproveitar as variantes reais já presentes na
página para ProductGroup/hasVariant/variesBy/productGroupID. Usar IDs existentes,
URLs de variantes existentes, material/tamanho registrados e SKU de cada
variante. A ausência de GTIN/MPN ou SKUs compartilhados não autoriza inventá-los.
Validar a oferta principal e cada variante no HTML final antes de publicar.
[Variantes Google](https://developers.google.com/search/docs/appearance/structured-data/product-variants).

## Performance e acessibilidade

PSI mobile de 08/10: LCP 12,63 s na home e 10,48 s na PDP do chaveiro; CLS
0,0018/0,1367. INP real desconhecido; CrUX sem amostra elegível. O tema precisa
de revisão dos recursos efetivamente sinalizados: scripts não utilizados,
recursos bloqueantes, descoberta da imagem LCP e dimensões dos elementos que
deslocam o layout. Preservar fotos e integrações comerciais.

O controle de mostrar senha é um `<a>` sem href e deve virar botão acessível
no template real; não atribuir URL fictícia apenas para melhorar Lighthouse.
Esta correção também depende do source. Nenhuma aprovação de Core Web Vitals
é inferida de uma medição de laboratório.

## Validação e rollback

Guardar backup completo do tema ativo e versões dos templates alterados.
Validar HTML inicial, title/meta/canonical/OG, uma Organization central e
referências seller, Products e variantes, galeria/CTA/seleção de variantes,
layout mobile/desktop e ausência de mudança comercial. Após publicação,
conferir URLs limpas sem cache antigo. Rollback é a restauração dos templates
originais e a conferência pública; não é troca do tema ou edição do catálogo.
