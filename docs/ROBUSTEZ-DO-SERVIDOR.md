# Robustez do servidor — tratamento de erro e login

Duas correções de infraestrutura, saídas de uma revisão do código-fonte. Não
mudam nenhum comportamento de produto: mudam o que acontece quando algo dá
errado.

Migrations: **nenhuma**. A lista canônica continua em
[`DEPLOY-ENGENHARIA-EDITORIAL.md`](./DEPLOY-ENGENHARIA-EDITORIAL.md), seção 1.

---

## 1. Rejeição não tratada deixa de derrubar o processo

### O problema

O Express 4 chama o handler e ignora o valor de retorno. Se o handler é `async`
e a promise rejeita, ninguém captura: a requisição fica pendurada até o cliente
desistir, e o Node ≥ 15 **encerra o processo**.

O código tinha 52 handlers `async` e 16 `try`. `routes/auth.ts` tinha três
handlers assíncronos e nenhum `try` — e o `/login` vai ao banco. O banco é
**remoto**. Uma oscilação de rede ali derrubava o servidor.

Não é hipótese: o registro de 2026-08-06 anotou *"servidor caía sozinho algumas
vezes → reiniciado via node scripts/dev.mjs"*, sem explicação na época.

### A correção, em três camadas

| Camada | Onde | O que faz |
|---|---|---|
| `rota()` | `server/lib/rota.ts`, aplicado nos **52 handlers** | Entrega a rejeição ao `next`, para o cliente receber resposta em vez de ficar pendurado |
| Error handler | fim do `server/index.ts` | Transforma em JSON sanitizado. Respeita o status declarado pelo erro: JSON malformado é **400**, não 500 |
| Guards de processo | topo do `server/index.ts` | `unhandledRejection` → loga e **continua**. `uncaughtException` → loga e **sai com 1** |

A assimetria dos dois guards é deliberada. Rejeição sem dono costuma ser I/O e
o processo segue íntegro. Exceção síncrona não capturada deixa o estado
duvidoso, e continuar arrisca gravar dado errado — sair é mais seguro, e hoje
custa pouco, porque `retomarGeracoesInterrompidas()` recoloca na fila o livro
que estava sendo escrito.

O error handler reusa `mensagemDeErroParaUsuario()`, o mesmo sanitizador da
geração — foi um vazamento de nome de variável de ambiente para a tela que o
criou. Sai também o header `X-Powered-By`.

### Verificado

`POST` com JSON quebrado devolvia HTML com stack; agora devolve
`400 {"error":"Requisição inválida."}`.

---

## 2. Login deixa de travar o servidor e de aceitar força bruta

### O problema

`credentials.ts` usava **`crypto.scryptSync`**. scrypt é caro de propósito — é o
que o torna bom para senha —, mas na forma síncrona o custo sai do event loop:
cada tentativa congelava o processo inteiro por dezenas de milissegundos. O
mesmo processo serve as rotas e escreve os livros.

Sem limite de tentativas e com um único par usuário/senha, isso somava duas
coisas: força bruta viável, e um jeito barato de derrubar o servidor de fora.

### A correção

- **scrypt assíncrono** (`promisify(crypto.scrypt)`). O hash continua idêntico;
  só sai do caminho síncrono. Formato guardado não muda — nenhuma senha
  existente precisa ser refeita.
- **Limite de tentativas** (`server/lib/limiteDeTentativas.ts`): 8 falhas em 15
  minutos por origem, bloqueio de 15 minutos, resposta `429` com `Retry-After`.
  A checagem vem **antes** do scrypt, então quem está bloqueado não custa CPU.
  Login bem-sucedido limpa o histórico.

### Verificado

Dez tentativas erradas seguidas: 401 nas oito primeiras, **429 com
`Retry-After: 900`** da nona em diante.

### Limitação conhecida

O contador é **em memória**. Reiniciar o servidor zera. Com uma instância só —
que é o caso hoje — isso é aceitável e evita uma dependência ou uma tabela nova.
**Se um dia houver mais de uma instância, isto precisa virar Redis ou tabela**,
senão cada réplica conta em separado e o limite efetivo se multiplica.

O contador é por IP e o `trust proxy` não está ligado, então atrás de um proxy
reverso `req.ip` é o proxy e o limite passa a valer para todos juntos. Para um
app de um usuário só, errar para o lado restritivo é o comportamento certo.
