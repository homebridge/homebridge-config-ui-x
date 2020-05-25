import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsNotEmpty, IsBoolean, IsOptional, Equals } from 'class-validator';

// tslint:disable-next-line: max-classes-per-file
export class UserDto {
  @IsNumber()
  @ApiProperty({ readOnly: true })
  id: number;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  name: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  username: string;

  @ApiProperty()
  @IsBoolean()
  admin: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({ writeOnly: true })
  password?: string;

  @Equals(undefined)
  hashedPassword?: string;

  @Equals(undefined)
  salt?: string;

  @Equals(undefined)
  otpSecret?: string;

  @Equals(undefined)
  @ApiProperty({ readOnly: true })
  otpActive?: boolean;
}

// tslint:disable-next-line: max-classes-per-file
export class UserUpdatePasswordDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  currentPassword: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  newPassword: string;
}

// tslint:disable-next-line: max-classes-per-file
export class UserActivateOtpDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  code: string;
}

// tslint:disable-next-line: max-classes-per-file
export class UserDeactivateOtpDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  password: string;
}