import { ApiProperty } from '@nestjs/swagger'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'

// The app's ValidationPipe uses `skipMissingProperties`, so a required field needs @IsDefined.

export class KioskDeviceCreateDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @ApiProperty({ type: String })
  name: string

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @ApiProperty({ type: String })
  viewId: string

  @IsDefined()
  @IsString()
  @MaxLength(100)
  @ApiProperty({ type: String })
  viewName: string

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
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @ApiProperty({ type: String, required: false })
  viewId?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiProperty({ type: String, required: false })
  viewName?: string

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
