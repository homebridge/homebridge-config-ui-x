import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsDefined, IsFQDN, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator'

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

export const DIRECT_CONNECTION_PROTECTIONS = ['cloudflare-access', 'two-factor', 'password-only'] as const

export type DirectConnectionProtection = typeof DIRECT_CONNECTION_PROTECTIONS[number]

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

  // Optional Cloudflare Access. Both empty turns it off.
  @IsOptional()
  @IsString()
  @MaxLength(253)
  @Matches(/^$|^(?:https?:\/\/)?[\w.-]+\/?$/i, { message: 'accessTeamDomain must be a team name or domain' })
  @ApiPropertyOptional({ type: String, example: 'myteam.cloudflareaccess.com' })
  accessTeamDomain?: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(/^$|^[0-9a-f]{32,128}$/i, { message: 'accessAudience must be the Application Audience (AUD) tag' })
  @ApiPropertyOptional({ type: String })
  accessAudience?: string
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

  @ApiProperty({ type: Boolean, description: 'Whether the named tunnel for this hostname exists and its credentials are on this server.' })
  provisioned: boolean

  @ApiProperty({
    type: String,
    enum: DIRECT_CONNECTION_PROTECTIONS,
    description: 'What protects the UI besides its password: Cloudflare Access, two-factor on every admin, or nothing.',
  })
  protection: DirectConnectionProtection

  @ApiProperty({ type: String })
  accessTeamDomain: string

  @ApiProperty({ type: String })
  accessAudience: string

  @ApiProperty({ type: Boolean, description: 'Whether this server holds a Cloudflare account certificate. It is removed once the tunnel is created.' })
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
