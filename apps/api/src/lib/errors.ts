import { FastifyError } from "fastify";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id: string) {
    super(404, `${entity} with id '${id}' not found`);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, message, details);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Insufficient permissions") {
    super(403, message);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
    this.name = "ConflictError";
  }
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string;
  details?: unknown;
}

export function toApiErrorResponse(error: AppError): ApiErrorResponse {
  return {
    statusCode: error.statusCode,
    message: error.message,
    details: error.details,
  };
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function errorHandler(
  error: FastifyError | Error,
  _request: unknown,
  reply: unknown,
) {
  const fastifyReply = reply as {
    status: (code: number) => { send: (body: unknown) => void };
  };
  const request = _request as { log: { error: (msg: string) => void } };

  request.log.error(error.message);

  if (isAppError(error)) {
    return fastifyReply
      .status(error.statusCode)
      .send(toApiErrorResponse(error));
  }

  if ((error as { code?: string }).code === "23505") {
    return fastifyReply.status(409).send({
      statusCode: 409,
      message: "A record with the same unique values already exists",
    });
  }

  const statusCode = (error as FastifyError).statusCode || 500;
  const validation = (error as FastifyError).validation;
  return fastifyReply.status(statusCode).send({
    statusCode,
    message: error.message || "Unknown API error",
    ...(validation ? { details: validation } : {}),
  });
}
