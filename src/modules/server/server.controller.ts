import { Controller, Get, UseGuards, Res, Put } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ServerService } from './server.service';

@UseGuards(AuthGuard())
@Controller('server')
export class ServerController {

  constructor(
    private serverService: ServerService,
  ) { }

  @Put('/restart')
  restartServer(@Res() res) {
    return this.serverService.restartServer(res);
  }

  @Get('/qrcode.svg')
  async getQrCode(@Res() res) {
    res.type('image/svg+xml');
    return res.send(await this.serverService.generateQrCode());
  }

}
