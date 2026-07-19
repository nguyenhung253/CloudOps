import { Module } from '@nestjs/common';
import { DatabaseModule } from '@app/database';
import { UsersService } from './users.service';

@Module({
  imports: [DatabaseModule],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
