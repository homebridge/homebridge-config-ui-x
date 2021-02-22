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
  @IsIn(['ciao', 'bonjour-hap'])
  @ApiProperty()
  advertiser: 'ciao' | 'bonjour-hap';
}
