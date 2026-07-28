import { TwilioClient } from '../../adapters/sms/twilio-client.js';

let cached: TwilioClient | null = null;

export function getSmsAdapter(): TwilioClient {
  cached ??= new TwilioClient(process.env.TWILIO_AUTH_TOKEN ?? '', process.env.TWILIO_ACCOUNT_SID ?? '');
  return cached;
}
