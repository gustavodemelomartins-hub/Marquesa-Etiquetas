/** Preparo comum da suíte — e a única coisa que ele faz é dar TEMPO.
 *
 *  O defeito que este arquivo existe para impedir já aconteceu duas vezes,
 *  e é do tipo que ensina a desconfiar de teste verde: a suíte passava
 *  396/396 aqui, em execuções seguidas, e reprovava no CI no mesmo passo —
 *  de forma intermitente, sem nenhuma mensagem que apontasse para uma
 *  regra errada.
 *
 *  O motivo não era o produto. `waitFor` e `findBy*` do Testing Library
 *  desistem em **1000ms** por padrão, e os testes mais pesados da suíte
 *  (o leitor de etiquetas, que roda um laço de quadros, e a contagem do
 *  inventário, que agora monta também a seção de progresso) gastam entre
 *  400ms e 1,2s numa máquina rápida. Num runner compartilhado, mais lento,
 *  o mesmo trabalho passa do limite e o teste falha por RELÓGIO, não por
 *  comportamento.
 *
 *  Um limite curto não prova nada sobre desempenho: ninguém aqui afirma
 *  que a tela tem de renderizar em um segundo, e não existe asserção sobre
 *  isso em lugar nenhum. O que esses testes afirmam é o estado EVENTUAL —
 *  "depois de bipar, a linha mostra 2". Julgar essa afirmação pela
 *  velocidade do runner troca uma prova de comportamento por uma medição
 *  de CPU disponível.
 *
 *  Então o limite sobe para cinco segundos. Ele continua sendo um limite:
 *  um teste que trave de verdade falha, só que por travar, e não por o
 *  runner estar ocupado.
 */
import { configure } from '@testing-library/dom';

configure({ asyncUtilTimeout: 5000 });
