export interface HomebridgePlugin {
  name: string
  private: boolean
  displayName?: string
  description?: string
  keywords?: string[]
  verifiedPlugin?: boolean
  verifiedPlusPlugin?: boolean
  supportsMatter?: boolean
  icon?: string
  publicPackage?: boolean
  installedVersion?: string
  latestVersion?: string
  lastUpdated?: string
  updateAvailable?: boolean
  updateEngines?: {
    homebridge?: string
    node?: string
  }
  updateTag?: string
  installPath?: string
  globalInstall?: boolean
  /**
   * Set on the `homebridge` package when more than one install of Homebridge
   * was found on disk — the reported install is the one hb-service launched
   * where that is known, but the extras should be removed (homebridge.io/w/JJSgm)
   */
  multipleInstances?: boolean
  settingsSchema?: boolean
  disabled?: boolean
  links?: {
    npm?: string
    homepage?: string
    bugs?: string
  }
  author?: string
  engines?: {
    homebridge?: string
    node?: string
  }
  funding?: NpmFunding
  isHbScoped?: boolean
  isUnmaintained?: boolean
  newHbScope?: {
    from: string
    to: string
    switch: string
  }
  directories?: {
    schemas?: string
  }
  /**
   * Saved config blocks for this plugin from `config.json`. Only populated
   * when `GET /plugins?include=config` is called by an admin user; otherwise
   * the field is omitted.
   */
  config?: any[]
}

export interface HomebridgePluginUiMetadata {
  devServer: null | string
  publicPath: string
  serverPath: string
  plugin: HomebridgePlugin
}

export interface HomebridgePluginVersions {
  tags: Record<string, string>
  versions: {
    [key: string]: IPackageJson
  }
}

export interface INpmPerson {
  name?: string
  email?: string
  homepage?: string
  username?: string
  url?: string
}

export interface INpmRegistryModule {
  '_id': string
  '_rev': string
  'name': string
  'dist-tags': {
    latest: string
    [key: string]: string
  }
  'versions': {
    [key: string]: IPackageJson
  }
  'time': {
    created: string
    modified: string
    [key: string]: string
  }
  'maintainers': INpmPerson[]
  'description': string
  'homepage': string
  'keywords': string[]
  'repository': { type: string, url: string }
  'author': INpmPerson
  'bugs': { email?: string, url?: string }
  'license': string
  'readme': string
  'readmeFilename': string
}

/**
 * A single result from the npm registry search endpoint
 * (`/-/v1/search`). Note this is a trimmed projection — it carries no
 * `engines` and no per-version data, only the `latest` version string.
 * To obtain `engines`, look the package up individually via the
 * per-package registry endpoint (`/<name>`, see `INpmRegistryModule`).
 */
export interface INpmSearchResultItem {
  downloads: {
    monthly: number
    weekly: number
  }
  dependents: number
  updated: string
  searchScore: number
  package: {
    name: string
    scope?: string
    version: string
    description?: string
    sanitized_name?: string
    keywords?: string[]
    date: string
    links: {
      npm: string
      homepage?: string
      repository?: string
      bugs?: string
    }
    author?: INpmPerson
    publisher: INpmPerson
    maintainers: INpmPerson[]
    license?: string
  }
  flags?: {
    insecure?: number
    unstable?: boolean
  }
  score: {
    final: number
    detail: {
      quality: number
      popularity: number
      maintenance: number
    }
  }
}

export interface INpmSearchResults {
  objects: INpmSearchResultItem[]
  total: number
  time: string
}

export interface IPackageJson {
  name: string
  displayName?: string
  version?: string
  description?: string
  keywords?: string[]
  homepage?: string
  bugs?: string | { email?: string, url?: string }
  license?: string
  author?: string | INpmPerson
  maintainers?: INpmPerson[]
  contributors?: string[] | INpmPerson[]
  funding?: NpmFunding
  files?: string[]
  main?: string
  bin?: string | { [key: string]: string }
  repository?: string | { type: string, url: string }
  scripts?: { [key: string]: string }
  dependencies?: { [key: string]: string }
  devDependencies?: { [key: string]: string }
  peerDependencies?: { [key: string]: string }
  optionalDependencies?: { [key: string]: string }
  bundledDependencies?: string[]
  engines?: { [key: string]: string }
  os?: string[]
  cpu?: string[]
  preferGlobal?: boolean
  private?: boolean
  publishConfig?: { registry?: string }
  deprecated?: string
  directories?: {
    schemas?: string
  }
}

export type NpmFunding = { type: string, url: string } | string | Array<{ type: string, url: string } | string>

export interface PluginAlias {
  pluginAlias: null | string
  pluginType: null | 'platform' | 'accessory'
}

export interface PluginListNewScopeItem {
  from: string
  to: string
  switch: string
}

export interface PluginListItem {
  c?: string // changelog path
  h?: 1 // hidden
  i?: string // icon
  a?: string // author
  n?: string // name
  s?: PluginListNewScopeItem // has new scope
  v?: 1 // verified
  p?: 1 // verified plus
  u?: 1 // unmaintained
}

export interface PluginListData {
  data: Record<string, PluginListItem>
}
