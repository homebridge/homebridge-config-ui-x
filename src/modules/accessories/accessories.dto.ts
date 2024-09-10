import { ApiProperty } from '@nestjs/swagger'
import { IsDefined, IsNotEmpty, IsString } from 'class-validator'

export class AccessorySetCharacteristicDto {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  characteristicType: string

  @ApiProperty({ required: true, type: 'string', title: 'Accepts a string, boolean, or integer value.' })
  @IsDefined()
  @IsNotEmpty()
  value: string | boolean | number
}
