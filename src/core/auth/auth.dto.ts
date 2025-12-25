import { ApiProperty } from '@nestjs/swagger'
import { IsDefined, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class AuthDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ type: String })
  readonly username: string

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ type: String })
  readonly password: string

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false, type: String })
  readonly otp?: string
}
