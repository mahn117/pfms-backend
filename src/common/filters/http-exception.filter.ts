import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCode } from '../constants/error-codes';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode: string = ErrorCode.INTERNAL_SERVER_ERROR;
    let message = 'Đã có lỗi xảy ra';
    let errors: { field: string; message: string }[] | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        message = (r.message as string) ?? exception.message;

        if (Array.isArray(r.message)) {
          errors = (r.message as string[]).map((m) => ({
            field: this.extractField(m),
            message: m,
          }));
          message = 'Dữ liệu không hợp lệ';
        }
      }

      errorCode = this.mapStatusToErrorCode(statusCode, exception);
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    response.status(statusCode).json({
      success: false,
      statusCode,
      errorCode,
      message,
      ...(errors ? { errors } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private mapStatusToErrorCode(
    status: HttpStatus,
    exception: HttpException,
  ): string {
    if (status === HttpStatus.BAD_REQUEST) return ErrorCode.VALIDATION_ERROR;
    if (status === HttpStatus.UNAUTHORIZED) return ErrorCode.UNAUTHORIZED;
    if (status === HttpStatus.FORBIDDEN) return ErrorCode.FORBIDDEN;
    if (status === HttpStatus.NOT_FOUND) return ErrorCode.NOT_FOUND;
    const res = exception.getResponse();
    if (typeof res === 'object' && res !== null && 'errorCode' in res) {
      return (res as Record<string, unknown>).errorCode as string;
    }
    return ErrorCode.INTERNAL_SERVER_ERROR;
  }

  private extractField(message: string): string {
    const firstWord = message.split(' ')[0];
    return firstWord || 'unknown';
  }
}
