import type { CharacteristicType, ServiceType } from '@homebridge/hap-client'

import axios from 'axios'

const selectionUuid = 'AAEA8272-2EEC-40EC-8C03-0E15FCA30F18'
const favoritesUuid = '3D8F8A5E-06EC-4780-8C83-0DAAC35B7269'
const metadataUuid = 'C48B8A28-40D3-4F51-B51C-A5D39D985991'

export function isThemeControl(service: ServiceType, characteristic: CharacteristicType): boolean {
  if ([selectionUuid, favoritesUuid].includes(characteristic.uuid?.toUpperCase())) {
    return true
  }
  if (characteristic.type !== 'On') {
    return false
  }
  const raw = service.serviceCharacteristics.find(c => c.uuid?.toUpperCase() === metadataUuid)?.value
  if (typeof raw !== 'string' || raw.length > 256) {
    return false
  }
  try {
    const metadata = JSON.parse(raw)
    return metadata?.version === 1 && metadata.role === 'action'
  } catch {
    return false
  }
}

/** A theme command needs an acknowledgement; reading its old value cannot confirm a write. */
export async function writeThemeControl(service: ServiceType, characteristic: CharacteristicType, value: number | string | boolean, pin: string) {
  const address = service.instance.ipAddress
  const host = address.includes(':') && !address.startsWith('[') ? `[${address}]` : address
  const response = await axios.put(`http://${host}:${service.instance.port}/characteristics`, {
    characteristics: [{ aid: service.aid, iid: characteristic.iid, value }],
  }, {
    headers: { Authorization: pin },
    timeout: 10000,
    maxRedirects: 0,
    proxy: false,
  })
  if (response.status === 204) {
    return
  }
  const results = response.data?.characteristics
  if (!Array.isArray(results) || results.length !== 1 || results[0]?.aid !== service.aid
    || results[0]?.iid !== characteristic.iid || results[0]?.status !== 0) {
    throw new Error('The accessory did not confirm the theme command.')
  }
}
