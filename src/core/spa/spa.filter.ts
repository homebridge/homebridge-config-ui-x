import { resolve } from 'path';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  NotFoundException
} from '@nestjs/common';
import { readFileSync } from 'fs-extra';

@Catch(NotFoundException)
export class SpaFilter implements ExceptionFilter {
  catch(_exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest();
    const res = ctx.getResponse();

    if (req.url.startsWith('/api/') || req.url.startsWith('/socket.io') || req.url.startsWith('/assets')) {
      return res.code(404).send('Not Found');
    }

    const file = readFileSync(resolve(process.env.UIX_BASE_PATH, 'public/index.html'), 'utf-8');
    res.type('text/html');
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.header('Pragma', 'no-cache');
    res.header('Expires', '0');
    res.send(file);
  }
}
