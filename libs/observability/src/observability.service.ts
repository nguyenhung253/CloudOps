import { Injectable } from '@nestjs/common';

@Injectable()
export class ObservabilityService {
  logInfo(message: string) {
    console.log(`[INFO] ${message}`);
  }
}
