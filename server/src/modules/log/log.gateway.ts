import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';

@WebSocketGateway({ namespace: 'log' })
export class LogGateway {
  @SubscribeMessage('log')
  handleMessage(client: any, payload: any): string {
    return 'Hello world!';
  }
}
