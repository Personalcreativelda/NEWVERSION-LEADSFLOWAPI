# Twilio SMS Integration - Multi-Tenant Setup Guide

## Overview
The CRM now supports SMS messaging via Twilio with **multi-tenant architecture**. Each user can configure their own Twilio credentials, making it perfect for SaaS applications where multiple users have different Twilio accounts.

## Features
- ✅ **Multi-tenant**: Each user has their own Twilio credentials
- ✅ Send SMS messages to leads
- ✅ Send MMS messages with media (images, videos, documents)
- ✅ Receive incoming SMS/MMS from leads
- ✅ Automatic lead creation from incoming SMS
- ✅ Delivery status tracking (queued, sent, delivered, failed)
- ✅ SMS icon in leads table (teal phone icon)
- ✅ Conversation history in Inbox
- ✅ AI assistant support for SMS messages
- ✅ Lead tracking for SMS interactions
- ✅ Webhook signature validation for security

## Prerequisites
Your users will need:
1. A Twilio account ([sign up here](https://www.twilio.com/try-twilio))
2. A Twilio phone number with SMS capabilities
3. Their Twilio Account SID and Auth Token

## Installation

Install the Twilio SDK in the `api/` directory:

```bash
cd api
npm install twilio
```

## Multi-Tenant Architecture

### How It Works
1. **Per-User Credentials**: Each user stores their own Twilio credentials in the database
2. **Channel-Based**: Credentials are stored in the `channels` table with type `twilio_sms`
3. **Dynamic Instantiation**: The TwilioSMSService is instantiated with user-specific credentials
4. **Webhook Routing**: Incoming SMS are routed to the correct user based on the recipient phone number

### Database Structure
Credentials are stored in the `channels.credentials` JSONB field:
```json
{
  "accountSid": "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "authToken": "your_auth_token_here",
  "phoneNumber": "+15551234567"
}
```

## Creating a Twilio SMS Channel

### Via API

Users can create their SMS channel via the Channels API:

```bash
POST /api/channels
Authorization: Bearer <user_token>
Content-Type: application/json

{
  "type": "twilio_sms",
  "name": "My Twilio SMS",
  "status": "active",
  "credentials": {
    "accountSid": "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "authToken": "your_auth_token_here",
    "phoneNumber": "+15551234567"
  }
}
```

**Response:**
```json
{
  "id": "uuid",
  "user_id": "user_uuid",
  "type": "twilio_sms",
  "name": "My Twilio SMS",
  "status": "active",
  "credentials": {
    "accountSid": "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "authToken": "your_auth_token_here",
    "phoneNumber": "+15551234567"
  },
  "created_at": "2024-01-01T00:00:00Z"
}
```

### Via Database (Development)

For testing, you can insert directly:

```sql
INSERT INTO channels (user_id, type, name, status, credentials)
VALUES (
  'your_user_id',
  'twilio_sms',
  'My Twilio SMS',
  'active',
  jsonb_build_object(
    'accountSid', 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'authToken', 'your_auth_token_here',
    'phoneNumber', '+15551234567'
  )
);
```

## Environment Configuration (Optional)

You can still set fallback credentials in `.env` for development/testing:

```bash
# Optional: Fallback Twilio credentials (not used in production)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+15551234567

# Required: Webhook URL for routing
WEBHOOK_URL=https://yourdomain.com
# or
API_URL=https://yourdomain.com
```

**Important**: In production, users should **never** use shared environment credentials. Each user must configure their own channel with their own Twilio account.

## Phone Number Format
All phone numbers must be in E.164 international format:
- Format: `+[country_code][number]`
- Examples:
  - Brazil: `+5511999887766`
  - USA: `+15551234567`
  - UK: `+447911123456`

The TwilioSMSService automatically formats phone numbers to E.164 if they're not already formatted.

## Webhook Configuration

**Important**: Each user must configure their own Twilio webhook for their specific phone number.

### Steps for Each User:

1. Log in to [Twilio Console](https://console.twilio.com/)
2. Go to Phone Numbers → Manage → Active numbers
3. Click on the phone number they're using for the CRM
4. In the "Messaging" section, under "A MESSAGE COMES IN":
   - Set Webhook URL to: `https://yourdomain.com/api/webhooks/twilio/sms`
   - Method: `POST`
   - Content-Type: `application/x-www-form-urlencoded`

5. (Optional) For delivery status updates:
   - In "Messaging" section → "Configure"
   - Set Status Callback URL to: `https://yourdomain.com/api/webhooks/twilio/status`
   - Method: `POST`

### How Webhook Routing Works

When an SMS arrives at the webhook:
1. The system extracts the recipient phone number (`To` field)
2. Searches the database for a `twilio_sms` channel with matching `credentials.phoneNumber`
3. Uses that channel's credentials to validate the webhook signature
4. Creates/finds the lead and conversation for that specific user
5. All messages are isolated per-user (multi-tenant)

### Webhook Endpoints
- **Incoming SMS**: `POST /api/webhooks/twilio/sms`
  - Receives SMS/MMS from leads
  - Creates leads automatically if new
  - Creates conversations and messages
  - Triggers AI assistant if configured
  
- **Status Updates**: `POST /api/webhooks/twilio/status`
  - Updates message delivery status
  - Statuses: `queued`, `sent`, `delivered`, `failed`, `undelivered`

## Database Requirements

The SMS integration uses the existing database schema with multi-tenant support:

- **channels** table: Stores SMS channels with `type = 'twilio_sms'`
  - `credentials` JSONB field contains: `accountSid`, `authToken`, `phoneNumber`
  - `status` field: `active`, `inactive`, `connected`
  - `user_id` field: Links channel to specific user

- **conversations** table: Supports `channel = 'twilio_sms'`
  - `remote_jid` format: `sms_<phone_number>` (e.g., `sms_5511999887766`)

- **messages** table: Stores SMS/MMS with `external_id = MessageSid`

No migration required - existing schema supports multi-tenant SMS channels.

## Usage

### Sending SMS from Inbox
1. Click the chat icon on a lead in the dashboard
2. The conversation will open in Inbox with the correct channel type (SMS)
3. Type your message and click Send
4. Messages are sent immediately via Twilio
5. Message status (sent/delivered/failed) is updated in real-time

### Sending MMS (Media Messages)
1. Open a conversation in Inbox
2. Click the attachment icon
3. Select image, video, or document (up to 20MB)
4. Media is uploaded to your storage service and sent via Twilio

### Receiving SMS
1. When a lead sends an SMS to your Twilio number, the webhook is triggered
2. Lead is automatically created/found based on phone number
3. Conversation is created/found with channel type `twilio_sms`
4. Message is saved and appears in Inbox in real-time
5. If AI assistant is configured, it processes the message automatically

### Channel Detection
Leads from SMS show a teal smartphone icon (📱) in the leads table with the label "SMS"

## Lead Tracking
SMS interactions are automatically tracked as lead interactions. Each incoming/outgoing SMS updates the lead's `last_contact_at` timestamp.

## Error Handling

### Common Issues

**1. "Twilio credentials not configured"**
- Solution: Check your `.env` file has all three Twilio variables set

**2. "The number +XXX is unverified"**
- Solution: On Twilio trial accounts, you must verify recipient phone numbers. Upgrade to a paid account or verify numbers in Twilio console.

**3. "Invalid phone number format"**
- Solution: Ensure phone numbers are in E.164 format (`+[country][number]`)

**4. Webhook not receiving messages**
- Solution: 
  - Check webhook URL is correct and publicly accessible
  - Verify webhook is set to POST method
  - Check server logs for incoming requests
  - Test webhook with Twilio's webhook testing tool

**5. Messages not sending**
- Solution:
  - Check Twilio account balance
  - Verify phone number has SMS capabilities
  - Check server logs for error details

## Development & Testing

### Testing Incoming SMS Locally
Use ngrok or similar to expose your local server:

```bash
# Start your local server
npm run dev

# In another terminal, start ngrok
ngrok http 3001

# Use the ngrok URL in Twilio webhook configuration
# Example: https://abc123.ngrok.io/api/webhooks/twilio/sms
```

### Checking Message Status
Message status is automatically updated via status webhooks. You can also manually check:

```typescript
import { TwilioSMSService } from './services/twilio-sms.service';

const twilioService = new TwilioSMSService();
const status = await twilioService.getMessageStatus('SM1234567890abcdef');
console.log(status);
```

## Security

### Webhook Signature Validation
The system automatically validates webhook signatures to ensure requests are genuinely from Twilio:

1. When a webhook is received, the system extracts the `X-Twilio-Signature` header
2. Finds the channel by recipient phoneNumber number
3. Uses that channel's `authToken` to validate the signature
4. Rejects requests with invalid signatures (403 Forbidden)

This ensures that:
- Only Twilio can send webhooks to your system
- Each user's credentials are validated independently
- No cross-tenant data leakage is possible

### Credentials Storage
- **Database**: User credentials are stored in `channels.credentials` JSONB field
- **Security Best Practice**: Consider encrypting the `authToken` in production
- **No Shared Credentials**: Each user has isolated credentials

## API Reference

### TwilioSMSService Methods

#### `sendSMS(to: string, body: string)`
Send a text-only SMS message.

```typescript
const result = await twilioSMSService.sendSMS('+5511999887766', 'Hello from CRM!');
console.log('Message SID:', result.sid);
```

#### `sendMMS(to: string, body: string, mediaUrl: string)`
Send an MMS with media attachment.

```typescript
const result = await twilioSMSService.sendMMS(
  '+5511999887766',
  'Check out this image!',
  'https://example.com/image.jpg'
);
```

#### `getMessageStatus(messageSid: string)`
Get the current delivery status of a message.

```typescript
const status = await twilioSMSService.getMessageStatus('SM1234567890abcdef');
console.log(status); // 'delivered', 'sent', 'failed', etc.
```

#### `formatPhoneNumber(phone: string)`
Convert a phone number to E.164 format.

```typescript
const formatted = twilioSMSService.formatPhoneNumber('(11) 99988-7766');
console.log(formatted); // '+5511999887766'
```

## Roadmap

Future enhancements planned:
- [ ] SMS channel creation UI in dashboard (currently API-only)
- [ ] Channel testing before activation
- [ ] Bulk SMS campaigns per user
- [ ] SMS templates with variables
- [ ] Scheduled SMS sending
- [ ] SMS analytics and reports per user
- [ ] Multiple Twilio numbers per user
- [ ] Two-way SMS business verification
- [ ] Token encryption at rest

## Cost Considerations

Since this is a multi-tenant SaaS:
- **Each user pays their own Twilio costs** from their account
- No shared billing or middleman markup
- Users maintain full control of their Twilio account
- Transparent pricing directly from Twilio

Typical Twilio SMS pricing (varies by country):
- USA: ~$0.0075 per SMS sent/received
- Brazil: ~$0.012 per SMS sent/received
- MMS costs more than standard SMS

**Recommendation**: Inform your users to monitor their Twilio usage dashboard and set up budget alerts.

## Support

For issues or questions:
1. Check user's Twilio Console logs for API errors
2. Check server logs for webhook/integration errors: `[Twilio SMS]` prefix
3. Verify channel credentials are correct in database
4. Review this documentation
5. Refer to [Twilio SMS Documentation](https://www.twilio.com/docs/sms)

## Multi-Tenant Benefits

✅ **Scalability**: Each user has isolated credentials
✅ **Security**: No shared API keys or credentials
✅ **Cost Transparency**: Users see their own Twilio billing
✅ **Flexibility**: Users can upgrade/downgrade their Twilio plans independently
✅ **Compliance**: Users maintain data ownership through their own Twilio accounts
