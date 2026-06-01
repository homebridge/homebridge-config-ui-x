import { ApiProperty } from '@nestjs/swagger'
import { ArrayMaxSize, IsArray, IsDefined, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator'

export class AccessorySetCharacteristicDto {
  @ApiProperty({ required: true, type: String })
  @IsDefined()
  @IsString()
  characteristicType: string

  @ApiProperty({ required: true, type: 'string', title: 'Accepts a string, boolean, or integer value.' })
  @IsDefined()
  @IsNotEmpty()
  value: string | boolean | number
}

export class SmartLightGroupAutomationDto {
  @ApiProperty({ required: true, type: [String] })
  @IsDefined()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  uniqueIds: string[]

  @ApiProperty({ required: false, type: Number, default: 30000 })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(86_400_000)
  restoreAfterMs?: number
}
