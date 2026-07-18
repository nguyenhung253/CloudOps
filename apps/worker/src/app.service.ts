import { Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
export class AppService implements OnModuleInit {
  onModuleInit() {
    console.log('Worker AppService initialized. Ready to process jobs.');
  }
}
