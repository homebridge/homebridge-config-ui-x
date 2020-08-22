import { IsString, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class HomebridgeRingCredentialsDto {
  @IsString()
  @ApiProperty({ required: true })
  email: string;

  @IsString()
  @ApiProperty({ required: true })
  password: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ required: false })
  twoFactorAuthCode?: number;
}