import { IsString, IsOptional, IsDefined } from 'class-validator';
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

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  twoFactorAuthCode?: string;
}
