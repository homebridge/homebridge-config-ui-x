import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsDefined, IsFQDN, IsIn, IsOptional, IsString, MaxLength } from 'class-validator'

export const DIRECT_CONNECTION_VARIANTS = ['named', 'quick'] as const

export type DirectConnectionVariant = typeof DIRECT_CONNECTION_VARIANTS[number]

export const DIRECT_CONNECTION_STATES = [
  'stopped',
  'starting',
  'connected',
  'reconnecting',
  'error',
] as const

export type DirectConnectionState = typeof DIRECT_CONNECTION_STATES[number]

export class DirectConnectionSettingsDto {
  @IsDefined()
  @IsString()
  @IsIn(DIRECT_CONNECTION_VARIANTS)
  @ApiProperty({ type: String, enum: DIRECT_CONNECTION_VARIANTS })
  variant: DirectConnectionVariant

  // Only used by named tunnels. An empty string clears it.
  @IsOptional()
  @IsString()
  @MaxLength(253)
  @IsFQDN({
    require_tld: true,
    allow_underscores: false,
    allow_trailing_dot: false,
    allow_wildcard: false,
  }, { message: 'hostname must be a fully qualified domain name' })
  @ApiPropertyOptional({ type: String, example: 'homebridge.example.com' })
  hostname?: string
}

// Every property names its type: tsx (used by `npm run watch`) emits no
// design:type metadata, and swagger treats a missing type as a circular ref.
export class DirectConnectionStatusDto {
  @ApiProperty({ type: Boolean, description: 'Whether a cloudflared binary is available for this platform.' })
  supported: boolean

  @ApiProperty({
    type: String,
    enum: ['auth-disabled'],
    nullable: true,
    description: 'Set when the UI cannot be exposed (for example, authentication is disabled).',
  })
  blockedReason: 'auth-disabled' | null

  @ApiProperty({ type: Boolean })
  enabled: boolean

  @ApiProperty({ type: String, enum: DIRECT_CONNECTION_VARIANTS })
  variant: DirectConnectionVariant

  @ApiProperty({ type: String })
  hostname: string

  @ApiProperty({ type: String, nullable: true })
  tunnelId: string | null

  @ApiProperty({ type: Boolean, description: 'Whether this server holds a Cloudflare account certificate.' })
  loggedIn: boolean

  @ApiProperty({ type: Boolean })
  loginInProgress: boolean

  @ApiProperty({ type: String, nullable: true })
  loginUrl: string | null

  @ApiProperty({ type: String, enum: DIRECT_CONNECTION_STATES })
  state: DirectConnectionState

  @ApiProperty({ type: String, nullable: true })
  publicUrl: string | null

  @ApiProperty({ type: String, nullable: true })
  lastError: string | null
}
