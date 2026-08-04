import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

type Req = IncomingMessage & {
  id?: string | number;
  originalUrl?: string;
};

function reqUrl(req: Req): string {
  return req.originalUrl ?? req.url ?? '';
}

function shouldSkipAutoLog(req: IncomingMessage): boolean {
  const url = reqUrl(req as Req);
  return (
    url.startsWith('/api/v1/health') ||
    url === '/favicon.ico' ||
    url.startsWith('/api/v1/docs')
  );
}

/**
 * Slim HTTP request logs for local/dev: method, path, status, duration —
 * no header dumps. Production stays JSON for log aggregators.
 */
export function buildLoggerParams(): Params {
  return {
    pinoHttp: {
      level: isTest ? 'silent' : isProd ? 'info' : 'debug',
      // Keep service logs free of the request blob in the pretty printer.
      quietReqLogger: !isProd,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["cf-connecting-ip"]',
        ],
        remove: true,
      },
      autoLogging: {
        ignore: shouldSkipAutoLog,
      },
      customLogLevel(
        _req: IncomingMessage,
        res: ServerResponse,
        err?: Error,
      ) {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      customSuccessMessage(
        req: IncomingMessage,
        res: ServerResponse,
        responseTime: number,
      ) {
        return `${req.method} ${reqUrl(req as Req)} → ${res.statusCode} ${responseTime}ms`;
      },
      customErrorMessage(
        req: IncomingMessage,
        res: ServerResponse,
        err: Error,
      ) {
        return `${req.method} ${reqUrl(req as Req)} → ${res.statusCode} (${err.message})`;
      },
      customSuccessObject(
        _req: IncomingMessage,
        _res: ServerResponse,
        val: Record<string, unknown>,
      ) {
        if (isProd) return val;
        const { req: _r, res: _s, responseTime, ...rest } = val;
        return { ...rest, ms: responseTime };
      },
      customErrorObject(
        _req: IncomingMessage,
        _res: ServerResponse,
        err: Error,
        val: Record<string, unknown>,
      ) {
        if (isProd) return val;
        const { req: _r, res: _s, responseTime, ...rest } = val;
        return { ...rest, ms: responseTime, err };
      },
      customAttributeKeys: {
        responseTime: 'ms',
      },
      serializers: {
        req(req: Req) {
          return {
            id: req.id,
            method: req.method,
            url: reqUrl(req),
          };
        },
        res(res: ServerResponse) {
          return { statusCode: res.statusCode };
        },
      },
      ...(isProd
        ? {}
        : {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                singleLine: true,
                translateTime: 'SYS:HH:MM:ss.l',
                ignore: 'pid,hostname,req,res,responseTime,ms',
                messageFormat: '{msg}',
                errorLikeObjectKeys: ['err', 'error'],
              },
            },
          }),
    },
  };
}
