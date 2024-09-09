/* SystemJS module definition */
// eslint-disable-next-line no-var
declare var module: NodeModule
interface NodeModule {
  id: string
}

declare module 'jwt-decode' {
  function decode(token: string): any
  namespace decode {}
  export = decode
}
