/** Erros de domínio — services lançam, routes/actions traduzem para HTTP. */

export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Não autenticado") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Sem permissão") {
    super("FORBIDDEN", message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Não encontrado") {
    super("NOT_FOUND", message, 404);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
