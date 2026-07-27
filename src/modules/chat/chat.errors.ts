import { DomainException } from '../../common/errors/domain-exception';

export class ConversationNotFoundException extends DomainException {
  constructor() {
    super('CONVERSATION_NOT_FOUND', 'Conversation not found', 404);
  }
}

export class ConversationForbiddenException extends DomainException {
  constructor() {
    super(
      'CONVERSATION_FORBIDDEN',
      'You are not a participant in this conversation',
      403,
    );
  }
}

export class ChatCannotMessageSelfException extends DomainException {
  constructor() {
    super(
      'CHAT_CANNOT_MESSAGE_SELF',
      'You cannot start a conversation with yourself',
      422,
    );
  }
}

export class ChatMessageEmptyException extends DomainException {
  constructor() {
    super(
      'CHAT_MESSAGE_EMPTY',
      'Message must include a body or attachment',
      422,
    );
  }
}
