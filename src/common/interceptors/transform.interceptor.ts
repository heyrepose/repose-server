import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ResponseMeta {
  nextCursor?: string | null;
  resultCount?: number;
  unreadCount?: number;
  facets?: Record<string, Array<{ value: string; count: number }>>;
}

interface Paginated<T> {
  data: T;
  meta: ResponseMeta;
}

function isPaginated(value: unknown): value is Paginated<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    'meta' in value
  );
}

/**
 * Wraps every successful response in the `{ data, meta? }` envelope. A handler
 * may return either a bare payload (becomes `data`) or `{ data, meta }` to
 * attach pagination/facets.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, unknown> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<unknown> {
    return next.handle().pipe(
      map((payload) => {
        if (payload === undefined || payload === null) {
          return { data: null };
        }
        if (isPaginated(payload)) {
          return { data: payload.data, meta: payload.meta };
        }
        return { data: payload };
      }),
    );
  }
}
