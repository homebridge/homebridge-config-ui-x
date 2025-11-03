import { ApiProperty } from '@nestjs/swagger'
import { IsArray, IsDefined, IsIn, IsString } from 'class-validator'

export class HomebridgeMdnsSettingDto {
  @IsString()
  @IsDefined()
  @IsIn(['avahi', 'resolved', 'ciao', 'bonjour-hap'])
  @ApiProperty({ type: String })
  advertiser: 'avahi' | 'resolved' | 'ciao' | 'bonjour-hap'
}

export class HomebridgeNetworkInterfacesDto {
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ type: [String] })
  adapters: string[]
}
