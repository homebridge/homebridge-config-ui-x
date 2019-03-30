import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';

@WebSocketGateway({ namespace: 'terminal' })
export class TerminalGateway {
  @SubscribeMessage('terminal')
  handleMessage(client: any, payload: any): string {
    return 'Hello world!';
  }
}
