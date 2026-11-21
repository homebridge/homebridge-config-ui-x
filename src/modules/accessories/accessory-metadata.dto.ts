import { plainToInstance, Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsObject, IsString, MaxLength, validate, ValidateNested } from 'class-validator'

export const ACCESSORY_METADATA_LIMITS = {
  nameLength: 100,
  labelsPerAccessory: 50,
  labelLength: 50,
  floors: 50,
  roomsPerFloor: 200,
} as const

export interface AccessoryFloor {
  name: string
  rooms: string[]
}

export interface AccessoryMetadata {
  labels: Record<string, string[]>
  floors: AccessoryFloor[]
}

export class AccessoryFloorDto {
  @IsString()
  @MaxLength(ACCESSORY_METADATA_LIMITS.nameLength)
  name: string

  @IsArray()
  @ArrayMaxSize(ACCESSORY_METADATA_LIMITS.roomsPerFloor)
  @IsString({ each: true })
  @MaxLength(ACCESSORY_METADATA_LIMITS.nameLength, { each: true })
  rooms: string[]
}

export class SaveAccessoryMetadataDto {
  @IsObject()
  labels: Record<string, string[]>

  @IsArray()
  @ArrayMaxSize(ACCESSORY_METADATA_LIMITS.floors)
  @ValidateNested({ each: true })
  @Type(() => AccessoryFloorDto)
  floors: AccessoryFloorDto[]
}

/**
 * Labels are a map of uniqueId to a list of short strings. class-validator cannot express the
 * per-value limits on an arbitrary-key record, so they are checked here.
 */
function checkLabels(labels: Record<string, unknown>): string | undefined {
  for (const [uniqueId, list] of Object.entries(labels)) {
    if (!Array.isArray(list) || list.length > ACCESSORY_METADATA_LIMITS.labelsPerAccessory) {
      return `labels for ${uniqueId} must be a list of at most ${ACCESSORY_METADATA_LIMITS.labelsPerAccessory} strings`
    }
    for (const label of list) {
      if (typeof label !== 'string' || label.length > ACCESSORY_METADATA_LIMITS.labelLength) {
        return `each label must be a string of at most ${ACCESSORY_METADATA_LIMITS.labelLength} characters`
      }
    }
  }
  return undefined
}

/**
 * Validate a `save-metadata` payload. Throws with a readable message when it is not valid.
 * Unknown properties are stripped.
 */
export async function parseSaveAccessoryMetadata(payload: unknown): Promise<AccessoryMetadata> {
  const dto = plainToInstance(SaveAccessoryMetadataDto, payload ?? {})
  const errors = await validate(dto, { whitelist: true })
  if (errors.length) {
    throw new Error(`Invalid accessory metadata: ${errors.map(e => e.property).join(', ')}`)
  }
  const labelError = checkLabels(dto.labels)
  if (labelError) {
    throw new Error(`Invalid accessory metadata: ${labelError}`)
  }
  return {
    labels: dto.labels,
    floors: dto.floors as AccessoryFloor[],
  }
}
