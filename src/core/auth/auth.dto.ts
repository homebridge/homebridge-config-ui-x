import { IsString, IsNotEmpty, IsOptional, IsDefined } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AuthDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  readonly username: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  readonly password: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly otp?: string;
}
