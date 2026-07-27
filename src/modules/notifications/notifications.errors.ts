import { DomainException } from '../../common/errors/domain-exception';

export class NotificationNotFoundException extends DomainException {
  constructor() {
    super('NOTIFICATION_NOT_FOUND', 'Notification not found', 404);
  }
}
