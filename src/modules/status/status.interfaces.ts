export enum HomebridgeStatus {
  OK = 'ok',
  UP = 'up',
  DOWN = 'down',
}

export interface HomebridgeStatusUpdate {
  status: HomebridgeStatus
  paired?: null | boolean
  setupUri?: null | string
  name?: string
  username?: string
  pin?: string
}

export interface DockerRelease {
  tag_name: string
  published_at: string
  prerelease: boolean
  body: string
}

export interface DockerReleaseInfo {
  version: string
  publishedAt: string
  isPrerelease: boolean
  isTest: boolean
  testTag: 'beta' | 'test' | null
  isLatestStable: boolean
}
