import { IsString, IsNumber, IsOptional, IsDefined } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class HomebridgeRingCredentialsDto {
  @IsDefined()
  @IsString()
  @ApiProperty({ required: true })
  email: string;

  @IsDefined()
  @IsString()
  @ApiProperty({ required: true })
  password: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ required: false })
  twoFactorAuthCode?: number;
}