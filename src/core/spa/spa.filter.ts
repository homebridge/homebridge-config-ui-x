import * as path from 'path';
import * as fs from 'fs-extra';

import { Catch, NotFoundException, ExceptionFilter, HttpException, ArgumentsHost } from '@nestjs/common';

@Catch(NotFoundException)
export class SpaFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest();
    const res = ctx.getResponse();

    if (req.url.startsWith('/api/') || req.url.startsWith('/socket.io') || req.url.startsWith('/assets')) {
      return res.code(404).send('Not Found');
    }

    const file = fs.readFileSync(path.resolve(process.env.UIX_BASE_PATH, 'public/index.html'), 'utf-8');
    res.type('text/html');
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.header('Pragma', 'no-cache');
    res.header('Expires', '0');
    res.send(file);
  }
}
