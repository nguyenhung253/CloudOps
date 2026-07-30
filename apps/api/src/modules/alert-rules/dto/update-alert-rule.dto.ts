import { CreateAlertRuleDto } from './create-alert-rule.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateAlertRuleDto extends PartialType(CreateAlertRuleDto) {}
