import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';

@WebSocketGateway({ namespace: 'accessories' })
export class AccessoriesGateway {
  @SubscribeMessage('accessories')
  handleMessage(client: any, payload: any): string {
    return 'Hello world!';
  }
}
