import { Injectable } from '@nestjs/common';

@Injectable()
export class CommonService {
  formatDate(date: Date): string {
    return date.toISOString();
  }
}
