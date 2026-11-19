import { plainToInstance, Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsBoolean, IsObject, IsOptional, IsString, MaxLength, validate, ValidateNested } from 'class-validator'

export const ACCESSORY_VIEWS_LIMITS = {
  views: 200,
  nameLength: 100,
  idLength: 100,
  idListSize: 1000,
  idEntryLength: 200,
  labelsPerAccessory: 50,
  labelLength: 50,
  floors: 50,
  roomsPerFloor: 200,
} as const

export interface AccessoryView {
  id: string
  name: string
  state: Record<string, unknown>
  pinned?: string[]
  excluded?: string[]
  shared?: boolean
  owner?: string
}

export interface AccessoryFloor {
  name: string
  rooms: string[]
}

export interface AccessoryViewsData {
  views: AccessoryView[]
  labels: Record<string, string[]>
  floors: AccessoryFloor[]
}

export class AccessoryViewDto {
  @IsString()
  @MaxLength(ACCESSORY_VIEWS_LIMITS.idLength)
  id: string

  @IsString()
  @MaxLength(ACCESSORY_VIEWS_LIMITS.nameLength)
  name: string

  @IsObject()
  state: Record<string, unknown>

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ACCESSORY_VIEWS_LIMITS.idListSize)
  @IsString({ each: true })
  @MaxLength(ACCESSORY_VIEWS_LIMITS.idEntryLength, { each: true })
  pinned?: string[]

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ACCESSORY_VIEWS_LIMITS.idListSize)
  @IsString({ each: true })
  @MaxLength(ACCESSORY_VIEWS_LIMITS.idEntryLength, { each: true })
  excluded?: string[]

  @IsOptional()
  @IsBoolean()
  shared?: boolean

  // Accepted from the client only so it can be stripped; ownership is always decided by the server
  @IsOptional()
  @IsString()
  @MaxLength(ACCESSORY_VIEWS_LIMITS.nameLength)
  owner?: string
}

export class AccessoryFloorDto {
  @IsString()
  @MaxLength(ACCESSORY_VIEWS_LIMITS.nameLength)
  name: string

  @IsArray()
  @ArrayMaxSize(ACCESSORY_VIEWS_LIMITS.roomsPerFloor)
  @IsString({ each: true })
  @MaxLength(ACCESSORY_VIEWS_LIMITS.nameLength, { each: true })
  rooms: string[]
}

export class SaveAccessoryViewsDto {
  @IsArray()
  @ArrayMaxSize(ACCESSORY_VIEWS_LIMITS.views)
  @ValidateNested({ each: true })
  @Type(() => AccessoryViewDto)
  views: AccessoryViewDto[]

  @IsObject()
  labels: Record<string, string[]>

  @IsArray()
  @ArrayMaxSize(ACCESSORY_VIEWS_LIMITS.floors)
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
    if (!Array.isArray(list) || list.length > ACCESSORY_VIEWS_LIMITS.labelsPerAccessory) {
      return `labels for ${uniqueId} must be a list of at most ${ACCESSORY_VIEWS_LIMITS.labelsPerAccessory} strings`
    }
    for (const label of list) {
      if (typeof label !== 'string' || label.length > ACCESSORY_VIEWS_LIMITS.labelLength) {
        return `each label must be a string of at most ${ACCESSORY_VIEWS_LIMITS.labelLength} characters`
      }
    }
  }
  return undefined
}

/**
 * Validate a `save-views` payload. Throws with a readable message when it is not valid.
 * Unknown properties are stripped.
 */
export async function parseSaveAccessoryViews(payload: unknown): Promise<AccessoryViewsData> {
  const dto = plainToInstance(SaveAccessoryViewsDto, payload ?? {})
  const errors = await validate(dto, { whitelist: true })
  if (errors.length) {
    throw new Error(`Invalid accessory views: ${errors.map(e => e.property).join(', ')}`)
  }
  const labelError = checkLabels(dto.labels)
  if (labelError) {
    throw new Error(`Invalid accessory views: ${labelError}`)
  }
  return {
    views: dto.views as AccessoryView[],
    labels: dto.labels,
    floors: dto.floors as AccessoryFloor[],
  }
}
