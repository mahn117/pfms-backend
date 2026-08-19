import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
  meta?: Record<string, unknown>;
}

interface PaginatedResult<T> {
  data: T;
  meta: Record<string, unknown>;
}

function isPaginatedResult<T>(value: unknown): value is PaginatedResult<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    'meta' in value
  );
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    const response = context
      .switchToHttp()
      .getResponse<{ statusCode: number }>();

    return next.handle().pipe(
      map((result: T) => {
        if (isPaginatedResult<T>(result)) {
          return {
            success: true as const,
            statusCode: response.statusCode,
            message: 'OK',
            data: result.data,
            meta: result.meta,
          };
        }

        return {
          success: true as const,
          statusCode: response.statusCode,
          message: 'OK',
          data: result,
        };
      }),
    );
  }
}
