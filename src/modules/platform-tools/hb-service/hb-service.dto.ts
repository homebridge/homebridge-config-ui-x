import { ApiProperty } from '@nestjs/swagger'
import { IsBoolean, IsOptional, IsString } from 'class-validator'

export class HbServiceStartupSettings {
  @IsBoolean()
  @ApiProperty({ default: false, required: true, type: Boolean })
  HOMEBRIDGE_DEBUG: boolean

  @IsBoolean()
  @ApiProperty({ default: false, required: true, type: Boolean })
  HOMEBRIDGE_KEEP_ORPHANS: boolean

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ default: true, required: true, type: Boolean })
  HOMEBRIDGE_INSECURE: boolean

  @IsString()
  @ApiProperty({ required: false, type: String })
  ENV_DEBUG?: string

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false, type: String })
  ENV_NODE_OPTIONS?: string
}
