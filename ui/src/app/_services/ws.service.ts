import { Injectable } from '@angular/core';

@Injectable()
export class WsService {

  constructor() {

  }

  ws = new (<any>window).WebSocket(`ws://127.0.0.1:8080`);

}
