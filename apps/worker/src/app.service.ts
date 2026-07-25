import { Injectable } from '@nestjs/common';

/** Placeholder retained for Nest scaffolding compatibility. */
@Injectable()
export class AppService {
  getStatus() {
    return { status: 'worker-ready' };
  }
}
