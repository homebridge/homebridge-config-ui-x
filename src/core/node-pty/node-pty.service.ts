import { spawn } from '@homebridge/node-pty-prebuilt-multiarch'
import { Injectable } from '@nestjs/common'

@Injectable()
export class NodePtyService {
  public spawn = spawn
}
