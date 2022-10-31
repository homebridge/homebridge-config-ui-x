import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDefined, IsIn, IsString } from 'class-validator';

export class HomebridgeNetworkInterfacesDto {
  @IsArray()
  @IsString({ each: true })
  @ApiProperty()
  adapters: string[];
}

export class HomebridgeMdnsSettingDto {
  @IsString()
  @IsDefined()
  @IsIn(['avahi', 'resolved', 'ciao', 'bonjour-hap'])
  @ApiProperty()
  advertiser: 'avahi' | 'resolved'  | 'ciao' | 'bonjour-hap';
}
