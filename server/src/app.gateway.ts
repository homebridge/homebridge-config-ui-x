import { WebSocketGateway, OnGatewayConnection, WebSocketServer, SubscribeMessage } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway()
export class AppGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;

  constructor(
  ) { }

  handleConnection() {
  }

}
