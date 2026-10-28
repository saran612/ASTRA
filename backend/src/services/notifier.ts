import net from 'node:net';

export interface SmsMessage {
  toPhoneNumber: string;
  messageBody: string;
}

export interface SmsGateway {
  sendSms(sms: SmsMessage): Promise<{ success: boolean; messageId: string }>;
}

/**
 * Stub implementation of SMS Gateway for demonstration and offline evaluation.
 * Note: Clearly labelled as stub adapter with zero claims of live telecom gateway integration.
 */
export class StubSmsGateway implements SmsGateway {
  private dispatched: SmsMessage[] = [];

  async sendSms(sms: SmsMessage): Promise<{ success: boolean; messageId: string }> {
    this.dispatched.push(sms);
    return {
      success: true,
      messageId: `STUB-SMS-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    };
  }

  getDispatchedCount(): number {
    return this.dispatched.length;
  }
}

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

/**
 * Lightweight SMTP client delivering raw RFC 5322 text to local MailHog container on port 1026.
 */
export async function sendDevEmail(msg: EmailMessage, port: number = 1026): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      socket.write(`HELO aicte.gov.in\r\n`);
      socket.write(`MAIL FROM:<vault-alerts@aicte.gov.in>\r\n`);
      socket.write(`RCPT TO:<${msg.to}>\r\n`);
      socket.write(`DATA\r\n`);
      socket.write(`From: AICTE FDR Vault <vault-alerts@aicte.gov.in>\r\n`);
      socket.write(`To: <${msg.to}>\r\n`);
      socket.write(`Subject: ${msg.subject}\r\n\r\n`);
      socket.write(`${msg.body}\r\n.\r\n`);
      socket.write(`QUIT\r\n`);
      socket.end();
      resolve(true);
    });

    socket.on('error', () => {
      // Offline fallback: resolve gracefully if MailHog is unavailable
      resolve(false);
    });
  });
}
