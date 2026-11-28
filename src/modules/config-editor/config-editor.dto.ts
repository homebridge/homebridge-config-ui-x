import { ApiProperty } from '@nestjs/swagger'
import { IsBoolean, IsDefined, IsInt, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator'

export class SetBridgeAlertDto {
  @ApiProperty({
    type: Boolean,
    description: 'Whether to hide the alert for this bridge',
    example: true,
  })
  @IsDefined()
  @IsBoolean()
  value: boolean
}

export class SetScheduledRestartCronDto {
  @ApiProperty({
    type: String,
    description: 'Cron expression for scheduled restart (or `null` to disable).',
    example: '0 5 * * *',
    required: false,
    nullable: true,
  })
  @ValidateIf(o => o.value !== null)
  @IsString()
  value: string | null
}

export class PortRangeDto {
  @ApiProperty({
    type: Number,
    description: 'Range start (inclusive). Must be a port number between 1025 and 65533.',
    required: false,
    nullable: true,
  })
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsInt()
  @Min(1025)
  @Max(65533)
  @IsOptional()
  start?: number | null

  @ApiProperty({
    type: Number,
    description: 'Range end (inclusive). Must be a port number between 1025 and 65533.',
    required: false,
    nullable: true,
  })
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsInt()
  @Min(1025)
  @Max(65533)
  @IsOptional()
  end?: number | null
}

export class SetMatterEnabledDto {
  @ApiProperty({ type: Boolean, description: 'Whether Matter is on for the main bridge' })
  @IsDefined()
  @IsBoolean()
  enabled: boolean

  @ApiProperty({ type: Boolean, required: false, description: 'Restart Homebridge first (default true)' })
  @IsOptional()
  @IsBoolean()
  restart?: boolean

  @ApiProperty({ type: Boolean, required: false, description: 'When off, keep Matter for external accessories only' })
  @IsOptional()
  @IsBoolean()
  externalsOnly?: boolean
}

export class SetHapEnabledDto extends SetMatterEnabledDto {
  @ApiProperty({ type: Boolean, required: false, description: 'Leave identifying material out of the HAP advertisement' })
  @IsOptional()
  @IsBoolean()
  disableIdentifyingMaterial?: boolean
}
