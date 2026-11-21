import { applyDecorators } from '@nestjs/common'
import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator'

function scopeList() {
  return applyDecorators(
    IsDefined(),
    IsArray(),
    ArrayMaxSize(200),
    IsString({ each: true }),
    MaxLength(100, { each: true }),
    ApiProperty({
      type: [String],
    }),
  )
}

export class KioskScopeDto {
  @scopeList()
  rooms: string[]

  @scopeList()
  categories: string[]

  @scopeList()
  subcategories: string[]

  @scopeList()
  labels: string[]
}

// The app's ValidationPipe uses `skipMissingProperties`, so a required field needs @IsDefined.

export class KioskDeviceCreateDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @ApiProperty({ type: String })
  name: string

  @IsDefined()
  @ValidateNested()
  @Type(() => KioskScopeDto)
  @ApiProperty({ type: KioskScopeDto })
  scope: KioskScopeDto

  @IsDefined()
  @IsString()
  @MaxLength(100)
  @ApiProperty({ type: String })
  scopeLabel: string

  @IsDefined()
  @IsBoolean()
  @ApiProperty({ type: Boolean })
  allowSensitive: boolean

  @IsDefined()
  @IsArray()
  @ArrayMaxSize(2000)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  @ApiProperty({
    type: [String],
  })
  allowedUniqueIds: string[]
}

export class KioskDeviceUpdateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @ApiProperty({ type: String, required: false })
  name?: string

  @IsOptional()
  @ValidateNested()
  @Type(() => KioskScopeDto)
  @ApiProperty({ type: KioskScopeDto, required: false })
  scope?: KioskScopeDto

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiProperty({ type: String, required: false })
  scopeLabel?: string

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ type: Boolean, required: false })
  allowSensitive?: boolean

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  @ApiProperty({
    type: [String],
    required: false,
  })
  allowedUniqueIds?: string[]
}

export class KioskPairDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @ApiProperty({ type: String })
  code: string
}
