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

// The app's ValidationPipe uses `skipMissingProperties`, so a required field needs @IsDefined: without it a missing
// field passes and the handler fails later with a 500

export class UserActivateOtpDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ type: String })
  code: string
}

export class UserDeactivateOtpDto {
  @IsDefined()
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
  passwordIterations?: number

  @Equals(undefined)
  sessionVersion?: number

  @Equals(undefined)
  otpSecret?: string

  @Equals(undefined)
  @ApiProperty({ readOnly: true, type: Boolean })
  otpActive?: boolean

  @Equals(undefined)
  otpLegacySecret?: boolean
}

export class UserUpdatePasswordDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ type: String })
  currentPassword: string

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ type: String })
  newPassword: string
}
