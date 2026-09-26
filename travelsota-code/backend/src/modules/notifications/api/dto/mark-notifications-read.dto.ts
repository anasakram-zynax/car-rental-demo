import { IsArray, IsString, IsNotEmpty } from 'class-validator';

export class MarkNotificationsReadDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  ids!: string[];
}