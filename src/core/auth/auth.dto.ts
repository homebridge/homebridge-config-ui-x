import { ApiProperty } from '@nestjs/swagger'
import { IsDefined, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class AuthDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  readonly username: string

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  readonly password: string

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly otp?: string
}
