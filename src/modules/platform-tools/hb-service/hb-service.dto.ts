import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class HbServiceStartupSettings {
  @IsBoolean()
  @ApiProperty({ default: false, required: true })
  HOMEBRIDGE_DEBUG: boolean;

  @IsBoolean()
  @ApiProperty({ default: false, required: true })
  HOMEBRIDGE_KEEP_ORPHANS: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ default: true, required: true })
  HOMEBRIDGE_INSECURE: boolean;

  @IsString()
  @ApiProperty({ required: false })
  ENV_DEBUG?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  ENV_NODE_OPTIONS?: string;
}
