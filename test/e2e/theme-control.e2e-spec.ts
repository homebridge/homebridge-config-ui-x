import type { CharacteristicType, ServiceType } from '@homebridge/hap-client'

import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { isThemeControl, writeThemeControl } from '../../src/modules/accessories/theme-control.js'

describe('theme command acknowledgement', () => {
  let status = 204
  let payload: unknown
  const requests: { authorization?: string, body: unknown }[] = []
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(chunk)
    }
    requests.push({ authorization: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString()) })
    res.writeHead(status, { 'content-type': 'application/hap+json' })
    res.end(status === 204 ? undefined : JSON.stringify(payload))
  })
  const characteristic = { uuid: 'AAEA8272-2EEC-40EC-8C03-0E15FCA30F18', iid: 9, type: 'ThemeSelection' } as CharacteristicType
  let service: ServiceType

  beforeAll(async () => {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Fixture did not bind a TCP port')
    }
    service = { aid: 2, instance: { ipAddress: '127.0.0.1', port: address.port }, serviceCharacteristics: [] } as unknown as ServiceType
  })

  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

  it('accepts a successful write and sends exactly one command with the supplied bridge pin', async () => {
    status = 204
    const count = requests.length
    await writeThemeControl(service, characteristic, 'a'.repeat(64), '031-45-154')
    expect(requests.length).toBe(count + 1)
    expect(requests.at(-1)).toEqual({
      authorization: '031-45-154',
      body: { characteristics: [{ aid: 2, iid: 9, value: 'a'.repeat(64) }] },
    })
  })

  it('rejects failed, malformed, missing and mismatched acknowledgements without retrying', async () => {
    status = 207
    for (const response of [
      { characteristics: [{ aid: 2, iid: 9, status: -70402 }] },
      { characteristics: [{ aid: 2, iid: 10, status: 0 }] },
      { characteristics: [{ aid: 2, iid: 9 }] },
      { characteristics: [] },
      {},
    ]) {
      payload = response
      const count = requests.length
      await expect(writeThemeControl(service, characteristic, 'a'.repeat(64), '031-45-154')).rejects.toThrow('did not confirm')
      expect(requests.length).toBe(count + 1)
    }
    payload = { characteristics: [{ aid: 2, iid: 9, status: 0 }] }
    await expect(writeThemeControl(service, characteristic, 'a'.repeat(64), '031-45-154')).resolves.toBeUndefined()
  })

  it('leaves ordinary controls on their existing transport and recognizes only declared theme commands', () => {
    expect(isThemeControl(service, characteristic)).toBe(true)
    const power = { uuid: '00000025-0000-1000-8000-0026BB765291', type: 'On' } as CharacteristicType
    expect(isThemeControl(service, power)).toBe(false)
    const marker = { uuid: 'C48B8A28-40D3-4F51-B51C-A5D39D985991', value: JSON.stringify({ version: 1, role: 'action' }) }
    const action = { ...service, serviceCharacteristics: [marker] } as ServiceType
    expect(isThemeControl(action, power)).toBe(true)
    marker.value = JSON.stringify({ version: 2, role: 'action' })
    expect(isThemeControl(action, power)).toBe(false)
    marker.value = '{invalid'
    expect(isThemeControl(action, power)).toBe(false)
  })
})
