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
