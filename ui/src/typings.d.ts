/* eslint-disable no-var, vars-on-top */

interface NodeModule {
  id: string
}

interface HomebridgeBackupDefaults {
  maxBackupSize: number
  maxBackupSizeText: string
  maxBackupFileSize: number
  maxBackupFileSizeText: string
}

interface HomebridgeTerminalDefaults {
  bufferSize: number
}

declare var module: NodeModule
declare var backup: HomebridgeBackupDefaults
declare var terminal: HomebridgeTerminalDefaults

declare module 'jwt-decode' {
  function decode(token: string): any
  namespace decode {}
  export = decode
}
