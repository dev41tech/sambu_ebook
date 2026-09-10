// Ponte entre handler `async` e o tratamento de erro do Express.
//
// O Express 4 chama o handler e ignora o valor de retorno. Se o handler for
// `async` e a promise rejeitar, ninguem captura: a requisicao fica pendurada
// ate o cliente desistir, e o Node encerra o processo por rejeicao nao tratada.
//
// Nao e hipotetico. O banco deste app e remoto, e o registro de 2026-08-06
// anotou "servidor caia sozinho algumas vezes" sem explicacao. Uma oscilacao de
// rede numa rota sem try/catch produz exatamente isso.
//
// `rota()` embrulha o handler e manda a rejeicao para o `next`, que a entrega
// ao error handler registrado no fim do server/index.ts.
import type { NextFunction, Request, RequestHandler, Response } from "express";

export function rota(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
