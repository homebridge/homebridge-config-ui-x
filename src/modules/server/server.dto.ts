import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDefined, IsString } from 'class-validator';

// tslint:disable-next-line: max-classes-per-file
export class HomebridgeNetworkInterfacesDto {
  @IsArray()
  @IsString({ each: true })
  @ApiProperty()
  adapters: string[];
}

// tslint:disable-next-line: max-classes-per-file
export class HomebridgeMdnsSettingDto {
  @IsBoolean()
  @IsDefined()
  @ApiProperty()
  legacyAdvertiser: boolean;
}