import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

/** How a control helper sends a change, and whether the socket is ready to take it */
export interface AccessoryControlChannel {
  send: (payload: Record<string, unknown>) => void
  hapReady: () => boolean
  matterReady: () => boolean
}

/**
 * Give one accessory its control helpers (getCluster for Matter, getCharacteristic for HAP) over a socket.
 * Shared by the accessories page and the kiosk device mode, so both send the same accessory-control payloads.
 */
export function attachControlHelpers(service: ServiceTypeX, channel: AccessoryControlChannel): void {
  if (service.protocol === 'matter') {
    if (!service.getCluster) {
      service.getCluster = (clusterName: string) => {
        const clusters = service.clusters || {}

        if (!clusters[clusterName]) {
          return null
        }

        return {
          attributes: clusters[clusterName],
          /**
           * Fire-and-forget: emits a WebSocket message and resolves immediately.
           * The promise never rejects; errors are not surfaced to callers.
           */
          setAttributes: (attributes: Record<string, unknown>) => new Promise<void>((resolve) => {
            if (!channel.matterReady()) {
              console.warn('Matter control attempted but not ready for control:', {
                matterReadyForControl: channel.matterReady(),
                uniqueId: service.uniqueId,
                cluster: clusterName,
              })
              return resolve(undefined)
            }

            channel.send({
              set: {
                uniqueId: service.uniqueId,
                cluster: clusterName,
                attributes,
              },
            })
            return resolve(undefined)
          }),
        }
      }
    }
    return
  }

  // HAP accessories use characteristic-based control
  if (!service.getCharacteristic) {
    service.getCharacteristic = ((type: string) => {
      const characteristic = service.serviceCharacteristics.find(x => x.type === type)

      if (!characteristic) {
        return null
      }

      characteristic.setValue = ((value: number | string | boolean) => new Promise<void>((resolve) => {
        if (!channel.hapReady()) {
          return resolve(undefined)
        }

        channel.send({
          set: {
            uniqueId: service.uniqueId,
            aid: service.aid,
            siid: service.iid,
            iid: characteristic.iid,
            value,
          },
        })
        return resolve(undefined)
      })) as any

      return characteristic
    }) as any
  }
}
