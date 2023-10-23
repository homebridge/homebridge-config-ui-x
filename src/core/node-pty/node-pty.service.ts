import { Injectable } from '@nestjs/common';
import * as pty from '@homebridge/node-pty-prebuilt-multiarch';

@Injectable()
export class NodePtyService {
  public spawn = pty.spawn;
}
