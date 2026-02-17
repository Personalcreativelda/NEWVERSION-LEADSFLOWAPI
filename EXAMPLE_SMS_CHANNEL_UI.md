# Example: SMS Channel Creation UI

This document provides an example of how to implement a UI for users to add their Twilio SMS credentials.

## Frontend Component Example (React)

```tsx
import { useState } from 'react';
import { api } from '../services/api';

interface TwilioSMSFormProps {
  onSuccess?: () => void;
}

export function TwilioSMSChannelForm({ onSuccess }: TwilioSMSFormProps) {
  const [formData, setFormData] = useState({
    name: 'My Twilio SMS',
    accountSid: '',
    authToken: '',
    phoneNumber: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/channels', {
        type: 'twilio_sms',
        name: formData.name,
        status: 'active',
        credentials: {
          accountSid: formData.accountSid,
          authToken: formData.authToken,
          phoneNumber: formData.phoneNumber
        }
      });

      console.log('SMS Channel created:', response.data);
      onSuccess?.();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create SMS channel');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">
          Channel Name
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full border rounded px-3 py-2"
          placeholder="My Twilio SMS"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Twilio Account SID
          <a 
            href="https://console.twilio.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-500 text-xs ml-2"
          >
            (Find in Twilio Console)
          </a>
        </label>
        <input
          type="text"
          value={formData.accountSid}
          onChange={(e) => setFormData({ ...formData, accountSid: e.target.value })}
          className="w-full border rounded px-3 py-2 font-mono text-sm"
          placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          required
        />
        <p className="text-xs text-gray-500 mt-1">
          Found on your Twilio Console dashboard
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Auth Token
        </label>
        <input
          type="password"
          value={formData.authToken}
          onChange={(e) => setFormData({ ...formData, authToken: e.target.value })}
          className="w-full border rounded px-3 py-2 font-mono text-sm"
          placeholder="********************************"
          required
        />
        <p className="text-xs text-gray-500 mt-1">
          Your Twilio Auth Token (kept secure)
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Twilio Phone Number
        </label>
        <input
          type="tel"
          value={formData.phoneNumber}
          onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
          className="w-full border rounded px-3 py-2 font-mono text-sm"
          placeholder="+15551234567"
          required
        />
        <p className="text-xs text-gray-500 mt-1">
          Must be in E.164 format (e.g., +15551234567)
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded text-sm">
          {error}
        </div>
      )}

      <div className="bg-blue-50 p-4 rounded text-sm">
        <p className="font-medium mb-2">📋 Next Steps After Creating Channel:</p>
        <ol className="list-decimal list-inside space-y-1 text-gray-700">
          <li>Go to your <a href="https://console.twilio.com/us1/develop/phone-numbers/manage/incoming" target="_blank" className="text-blue-600 underline">Twilio Phone Numbers</a></li>
          <li>Click on the phone number you entered above</li>
          <li>In "Messaging Configuration", set webhook URL to:</li>
          <li className="ml-4 font-mono text-xs bg-white p-2 rounded mt-1">
            {window.location.origin}/api/webhooks/twilio/sms
          </li>
          <li>Set method to <strong>POST</strong></li>
          <li>Save configuration</li>
        </ol>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-teal-600 text-white py-2 rounded hover:bg-teal-700 disabled:opacity-50"
      >
        {loading ? 'Creating Channel...' : 'Create SMS Channel'}
      </button>
    </form>
  );
}
```

## Integration in Channels Page

```tsx
import { TwilioSMSChannelForm } from './TwilioSMSChannelForm';
import { useState } from 'react';

export function ChannelsPage() {
  const [showSMSForm, setShowSMSForm] = useState(false);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Communication Channels</h1>
        <button
          onClick={() => setShowSMSForm(true)}
          className="bg-teal-600 text-white px-4 py-2 rounded flex items-center gap-2"
        >
          <SmartphoneIcon className="w-4 h-4" />
          Add SMS Channel
        </button>
      </div>

      {/* Modal for SMS Form */}
      {showSMSForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Add Twilio SMS Channel</h2>
              <button
                onClick={() => setShowSMSForm(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <TwilioSMSChannelForm
              onSuccess={() => {
                setShowSMSForm(false);
                // Refresh channels list
                window.location.reload();
              }}
            />
          </div>
        </div>
      )}

      {/* Existing channels list */}
      <div className="grid gap-4">
        {/* Your existing channel cards */}
      </div>
    </div>
  );
}
```

## Channel Card Display

```tsx
interface SMSChannelCardProps {
  channel: {
    id: string;
    name: string;
    status: string;
    credentials: {
      phoneNumber: string;
      accountSid: string;
    };
    created_at: string;
  };
}

export function SMSChannelCard({ channel }: SMSChannelCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-teal-100 p-3 rounded-lg">
            <SmartphoneIcon className="w-6 h-6 text-teal-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">{channel.name}</h3>
            <p className="text-sm text-gray-600 font-mono">
              {channel.credentials.phoneNumber}
            </p>
            <span className={`inline-block mt-1 px-2 py-1 text-xs rounded ${
              channel.status === 'active' 
                ? 'bg-green-100 text-green-700' 
                : 'bg-gray-100 text-gray-700'
            }`}>
              {channel.status}
            </span>
          </div>
        </div>

        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-blue-600 text-sm underline"
        >
          {showDetails ? 'Hide' : 'Show'} Details
        </button>
      </div>

      {showDetails && (
        <div className="mt-4 pt-4 border-t space-y-2 text-sm">
          <div>
            <span className="text-gray-600">Account SID:</span>
            <p className="font-mono text-xs mt-1">{channel.credentials.accountSid}</p>
          </div>
          <div>
            <span className="text-gray-600">Webhook URL:</span>
            <p className="font-mono text-xs mt-1 bg-gray-50 p-2 rounded">
              {window.location.origin}/api/webhooks/twilio/sms
            </p>
          </div>
          <div>
            <span className="text-gray-600">Created:</span>
            <p className="text-xs mt-1">
              {new Date(channel.created_at).toLocaleString()}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
```

## API Service Integration

```typescript
// services/api.ts
export const channelsApi = {
  createSMSChannel: async (credentials: {
    name: string;
    accountSid: string;
    authToken: string;
    phoneNumber: string;
  }) => {
    const response = await api.post('/channels', {
      type: 'twilio_sms',
      name: credentials.name,
      status: 'active',
      credentials: {
        accountSid: credentials.accountSid,
        authToken: credentials.authToken,
        phoneNumber: credentials.phoneNumber
      }
    });
    return response.data;
  },

  updateSMSChannel: async (channelId: string, updates: any) => {
    const response = await api.put(`/channels/${channelId}`, updates);
    return response.data;
  },

  deleteSMSChannel: async (channelId: string) => {
    const response = await api.delete(`/channels/${channelId}`);
    return response.data;
  },

  testSMSChannel: async (channelId: string, testPhone: string) => {
    const response = await api.post(`/channels/${channelId}/test`, {
      phoneNumber: testPhone,
      message: 'Test message from CRM'
    });
    return response.data;
  }
};
```

## Phone Number Validation

```typescript
export function validateE164PhoneNumber(phone: string): boolean {
  // E.164 format: +[country code][number]
  // Examples: +15551234567, +5511999887766
  const e164Regex = /^\+[1-9]\d{10,14}$/;
  return e164Regex.test(phone);
}

export function formatToE164(phone: string, defaultCountryCode: string = '1'): string {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '');
  
  // Add country code if missing
  if (!phone.startsWith('+')) {
    if (cleaned.length === 10 || cleaned.length === 11) {
      cleaned = defaultCountryCode + cleaned;
    }
  }
  
  return '+' + cleaned;
}
```

## Testing Component

```tsx
export function TestSMSChannelButton({ channelId }: { channelId: string }) {
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState('');

  const handleTest = async () => {
    if (!validateE164PhoneNumber(testPhone)) {
      setResult('❌ Invalid phone number. Use E.164 format (+15551234567)');
      return;
    }

    setTesting(true);
    setResult('');

    try {
      await channelsApi.testSMSChannel(channelId, testPhone);
      setResult('✅ Test message sent successfully! Check your phone.');
    } catch (err: any) {
      setResult(`❌ Failed: ${err.response?.data?.error || 'Unknown error'}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-4 bg-gray-50 rounded">
      <h4 className="font-medium mb-2">Test SMS Channel</h4>
      <div className="flex gap-2">
        <input
          type="tel"
          value={testPhone}
          onChange={(e) => setTestPhone(e.target.value)}
          placeholder="+15551234567"
          className="flex-1 border rounded px-3 py-2 text-sm"
        />
        <button
          onClick={handleTest}
          disabled={testing || !testPhone}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
        >
          {testing ? 'Sending...' : 'Send Test'}
        </button>
      </div>
      {result && (
        <p className="mt-2 text-sm">{result}</p>
      )}
    </div>
  );
}
```

## Best Practices

1. **Validation**: Always validate E.164 format before submission
2. **Security**: Never display full auth token in UI
3. **Instructions**: Provide clear webhook setup instructions
4. **Testing**: Allow users to test before going live
5. **Error Handling**: Show clear error messages
6. **Help Links**: Link to Twilio Console for easy access
7. **Status Indicators**: Show channel status clearly

## User Experience Flow

1. User clicks "Add SMS Channel"
2. Modal opens with form
3. User enters Twilio credentials
4. Form validates E.164 format
5. POST request creates channel
6. Instructions shown for webhook setup
7. User configures webhook in Twilio Console
8. Channel is ready to receive SMS
9. User can test with test message button
