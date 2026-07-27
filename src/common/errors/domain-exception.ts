import { HttpException } from '@nestjs/common';

/**
 * Base class for all deliberate, coded domain errors. Every thrown domain error
 * carries a stable `errorCode` (namespaced by module) so the client contract is
 * explicit and never inferred from a message string.
 */
export class DomainException extends HttpException {
  constructor(
    public readonly errorCode: string,
    message: string,
    statusCode: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super({ errorCode, message, statusCode, details }, statusCode);
  }
}
