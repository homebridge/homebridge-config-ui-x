import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import type { ServiceType } from '@homebridge/hap-client'

/**
 * One part of a camera, of the given type, from the services folded into its tile.
 * @param camera - the camera's video stream service, which the tile is built on
 * @param type - the part's service type, such as `MotionSensor`
 */
export function cameraPart(camera: ServiceTypeX, type: string): ServiceType | undefined {
  return Object.values(camera.linkedServices ?? {}).find(part => part?.type === type)
}
