import type { ServiceType } from '@homebridge/hap-client'

export const THEME_PICKER_UUID = 'C48B8A28-40D3-4F51-B51C-A5D39D985991'
export interface ThemePickerMetadata { version: 1, group: string, role: 'source' | 'action' | 'favorite', id?: string }
export interface ThemeAction { id: string, name: string, service: ServiceType, characteristicType?: 'ThemeSelection' }

export function themeMetadata(service: ServiceType): ThemePickerMetadata | undefined {
  const raw = service.serviceCharacteristics.find(item => item.uuid.toUpperCase() === THEME_PICKER_UUID)?.value
  if (typeof raw !== 'string' || raw.length > 256) {
    return
  }
  try {
    const value = JSON.parse(raw)
    if (value?.version !== 1 || typeof value.group !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value.group)) {
      return
    }
    if (value.role === 'source' && service.type === 'Lightbulb') {
      return value
    }
    if (['action', 'favorite'].includes(value.role) && ['Switch', 'Outlet'].includes(service.type)
      && typeof value.id === 'string' && /^[a-f\d]{64}$/.test(value.id)
      && service.serviceCharacteristics.some(item => item.type === 'On' && item.perms.includes('pw'))) {
      return value
    }
  } catch { /* Unsupported metadata leaves the ordinary accessory controls available. */ }
  return undefined
}

export function legacyThemeActions(source: ServiceType, services: ServiceType[]): ThemeAction[] {
  const metadata = themeMetadata(source)
  if (metadata?.role !== 'source' || !source.instance?.username) {
    return []
  }
  const sources = services.filter((service) => {
    const other = themeMetadata(service)
    return other?.role === 'source' && other.group === metadata.group
      && service.instance?.username === source.instance.username
  })
  if (sources.length > 1) {
    return []
  }
  const actions = services.flatMap((service) => {
    const action = themeMetadata(service)
    return action?.role === 'action' && action.group === metadata.group
      && service.instance?.username === source.instance.username && service.uniqueId
      ? [{ id: action.id!, name: service.serviceName, service }]
      : []
  })
  // Ambiguous identities must not silently route to the first matching control.
  const counts = new Map<string, number>()
  actions.forEach(action => counts.set(action.id, (counts.get(action.id) ?? 0) + 1))
  return actions.filter(action => counts.get(action.id) === 1)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

export const MAX_THEME_FAVORITES = 99

export const THEME_FAVORITES_UUID = '3D8F8A5E-06EC-4780-8C83-0DAAC35B7269'
export interface SharedThemeFavorites { version: 1, revision: number, ids: string[] }

export function sharedFavoritesCharacteristic(service: ServiceType) {
  return service.serviceCharacteristics.find(item => item.uuid.toUpperCase() === THEME_FAVORITES_UUID
    && item.format === 'data' && item.perms.includes('pr') && item.perms.includes('pw'))
}

export function sharedThemeFavorites(service: ServiceType): SharedThemeFavorites | undefined {
  const raw = sharedFavoritesCharacteristic(service)?.value
  if (typeof raw !== 'string' || raw.length > 16384) {
    return
  }
  try {
    const value = JSON.parse(atob(raw))
    if (value?.version === 1 && Number.isSafeInteger(value.revision) && value.revision >= 0
      && Array.isArray(value.ids) && value.ids.length <= MAX_THEME_FAVORITES
      && value.ids.every((id: unknown) => typeof id === 'string' && /^[a-f\d]{64}$/.test(id))
      && new Set(value.ids).size === value.ids.length) {
      return value
    }
  } catch { /* A malformed shared setting must not fall back to a private favorite list. */ }
  return undefined
}

export function nativeFavoriteServices(source: ServiceType, services: ServiceType[]): ServiceType[] {
  const metadata = themeMetadata(source)
  if (metadata?.role !== 'source' || !source.instance?.username) {
    return []
  }
  const matches = services.filter(service => themeMetadata(service)?.role === 'source'
    && themeMetadata(service)?.group === metadata.group && service.instance?.username === source.instance.username)
  if (matches.length !== 1) {
    return []
  }
  // Keep a native control visible unless the picker can actually replace it.
  const availableIds = new Set(themeActions(source, services).map(action => action.id))
  return services.filter((service) => {
    const favorite = themeMetadata(service)
    return favorite?.role === 'favorite' && favorite.group === metadata.group && availableIds.has(favorite.id!)
      && service.instance?.username === source.instance.username
  })
}

export const THEME_CATALOG_UUID = '5B530C0B-C1DF-496C-9151-52EAB77FD424'
export const THEME_SELECTION_UUID = 'AAEA8272-2EEC-40EC-8C03-0E15FCA30F18'

export function themeActions(source: ServiceType, services: ServiceType[]): ThemeAction[] {
  const catalog = source.serviceCharacteristics.find(c => c.uuid.toUpperCase() === THEME_CATALOG_UUID)
  if (!catalog) {
    return legacyThemeActions(source, services)
  }
  const metadata = themeMetadata(source)
  const selection = source.serviceCharacteristics.find(c => c.uuid.toUpperCase() === THEME_SELECTION_UUID)
  if (metadata?.role !== 'source' || !source.uniqueId || !source.instance?.username
    || catalog.format !== 'data' || !catalog.perms.includes('pr')
    || selection?.format !== 'string' || !selection.perms.includes('pw')) {
    return []
  }
  const sources = services.filter(s => s.instance?.username === source.instance.username
    && themeMetadata(s)?.group === metadata.group && themeMetadata(s)?.role === 'source')
  if (sources.length !== 1 || typeof catalog.value !== 'string' || catalog.value.length > 131072) {
    return []
  }
  try {
    const bytes = Uint8Array.from(atob(catalog.value), c => c.charCodeAt(0))
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (data?.version !== 1 || !Array.isArray(data.themes) || data.themes.length > 1000) {
      return []
    }
    const ids = new Set<string>()
    const actions: ThemeAction[] = []
    for (const theme of data.themes) {
      if (typeof theme?.id !== 'string' || !/^[a-f\d]{64}$/.test(theme.id) || ids.has(theme.id)
        || typeof theme.name !== 'string' || !theme.name.trim() || theme.name.length > 256) {
        return []
      }
      ids.add(theme.id)
      actions.push({ id: theme.id, name: theme.name, service: source, characteristicType: 'ThemeSelection' })
    }
    return actions.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  } catch {
    return []
  }
}
