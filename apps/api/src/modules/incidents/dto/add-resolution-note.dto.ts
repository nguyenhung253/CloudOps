import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AddResolutionNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  resolutionNote!: string;
}
