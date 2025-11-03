import { ApiProperty } from '@nestjs/swagger'
import {
  Equals,
  IsBoolean,
  IsDefined,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator'

export class UserActivateOtpDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ type: String })
  code: string
}

export class UserDeactivateOtpDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ type: String })
  password: string
}

export class UserDto {
  @IsNumber()
  @ApiProperty({ readOnly: true, type: Number })
  id?: number

  @IsString()
  @IsNotEmpty()
  @IsDefined()
  @ApiProperty({ type: String })
  name: string

  @IsString()
  @IsNotEmpty()
  @IsDefined()
  @ApiProperty({ type: String })
  username: string

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  admin: boolean

  @IsString()
  @IsOptional()
  @ApiProperty({ writeOnly: true, type: String })
  password?: string

  @Equals(undefined)
  hashedPassword?: string

  @Equals(undefined)
  salt?: string

  @Equals(undefined)
  otpSecret?: string

  @Equals(undefined)
  @ApiProperty({ readOnly: true, type: Boolean })
  otpActive?: boolean
}

export class UserUpdatePasswordDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ type: String })
  currentPassword: string

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ type: String })
  newPassword: string
}
