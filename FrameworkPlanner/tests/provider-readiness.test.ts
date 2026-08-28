import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the telnyx client before importing the module under test
vi.mock('../server/services/telecom/telnyx-client', () => ({
  telnyx: {
    healthCheck: async () => ({
      status: 'reachable',
      code: 'OK',
      message: 'Connection is active',
      connectionFound: true,
      connectionActive: true,
      httpStatus: 200,
    }),
  },
}));

vi.mock('../server/media/documentVault', () => ({
  documentStorageMode: () => 'db',
}));

vi.mock('../server/services/telecom/ai-config', () => {
  const parseBool = (v: string | undefined) =>
    ['1', 'true', 'yes', 'on'].includes(String(v || '').trim().toLowerCase());
  const getAiAssistantConfig = async () => {
    const enabled = parseBool(process.env.FEATURE_AI_ASSISTANT);
    const assistantId = (process.env.TELNYX_AI_ASSISTANT_ID || '').trim() || null;
    return { enabled, assistantId, source: assistantId ? 'env' : 'none', featureSource: 'env' };
  };
  return { getAiAssistantConfig };
});

vi.mock('../server/services/telecom/video', () => ({
  telnyxVideo: {
    healthCheck: async () => {
      const enabled = (process.env.TELNYX_VIDEO_ENABLED || '').trim().toLowerCase();
      if (enabled === 'true' || enabled === '1' || enabled === 'yes' || enabled === 'on') {
        return { configured: true, reachable: true, roomsApiAvailable: true };
      }
      return {
        configured: false,
        reachable: false,
        roomsApiAvailable: false,
        blocker: 'Telnyx Video is not enabled. Confirm Video API access in the Telnyx portal, then set TELNYX_VIDEO_ENABLED=true.',
      };
    },
  },
}));

import { getProviderReadiness } from '../server/services/telecom/provider-readiness';

describe('Provider Readiness Service', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Set required env vars for a basic test
    process.env.TELNYX_API_KEY = 'test-api-key';
    process.env.TELNYX_CONNECTION_ID = '1234567890';
    process.env.TELNYX_MESSAGING_PROFILE_ID = 'test-profile-id';
    process.env.TELNYX_DEFAULT_FROM_NUMBER = '+15550001234';
    process.env.TELNYX_WEBHOOK_URL = 'https://example.com/webhooks';
  });

  it('returns structured readiness for all channels', async () => {
    const result = await getProviderReadiness();

    expect(result).toHaveProperty('voice');
    expect(result).toHaveProperty('sms');
    expect(result).toHaveProperty('video');
    expect(result).toHaveProperty('email');
    expect(result).toHaveProperty('documentStorage');
    expect(result).toHaveProperty('webhook');
    expect(result).toHaveProperty('featureFlags');
    expect(result).toHaveProperty('overallStatus');
    expect(result).toHaveProperty('checkedAt');
  });

  it('voice is configured with numeric connection ID', async () => {
    process.env.TELNYX_CONNECTION_ID = '1234567890';
    const result = await getProviderReadiness();

    expect(result.voice.configured).toBe(true);
    expect(result.voice.connectionType).toBe('call_control_application');
    expect(result.voice.reachable).toBe(true);
    expect(result.voice.connectionActive).toBe(true);
  });

  it('detects SIP credential connection type', async () => {
    process.env.TELNYX_CONNECTION_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const result = await getProviderReadiness();

    expect(result.voice.connectionType).toBe('sip_credential');
    expect(result.voice.blocker).toContain('SIP Credential');
  });

  it('voice reports missing env vars', async () => {
    delete process.env.TELNYX_API_KEY;
    delete process.env.TELNYX_CONNECTION_ID;
    const result = await getProviderReadiness();

    expect(result.voice.configured).toBe(false);
    expect(result.voice.blocker).toContain('Missing');
  });

  it('sms is configured when profile ID present', async () => {
    const result = await getProviderReadiness();

    expect(result.sms.configured).toBe(true);
    expect(result.sms.messagingProfilePresent).toBe(true);
  });

  it('sms reports missing profile', async () => {
    delete process.env.TELNYX_MESSAGING_PROFILE_ID;
    const result = await getProviderReadiness();

    expect(result.sms.configured).toBe(false);
    expect(result.sms.blocker).toContain('TELNYX_MESSAGING_PROFILE_ID');
  });

  it('video is not configured by default', async () => {
    delete process.env.TELNYX_VIDEO_ENABLED;
    const result = await getProviderReadiness();

    expect(result.video.configured).toBe(false);
    expect(result.video.blocker).toContain('TELNYX_VIDEO_ENABLED');
  });

  it('video is configured when enabled', async () => {
    process.env.TELNYX_VIDEO_ENABLED = 'true';
    const result = await getProviderReadiness();

    expect(result.video.configured).toBe(true);
    expect(result.video.roomsApiAvailable).toBe(true);
  });

  it('email uses resend when configured', async () => {
    process.env.RESEND_API_KEY = 'test-resend-key';
    process.env.RESEND_FROM = 'test@example.com';
    delete process.env.TELNYX_EMAIL_ENABLED;
    const result = await getProviderReadiness();

    expect(result.email.configured).toBe(true);
    expect(result.email.activeProvider).toBe('resend');
    expect(result.email.fromAddress).toBe('test@example.com');
  });

  it('email prefers telnyx when both configured', async () => {
    process.env.RESEND_API_KEY = 'test-resend-key';
    process.env.RESEND_FROM = 'test@example.com';
    process.env.TELNYX_EMAIL_ENABLED = 'true';
    const result = await getProviderReadiness();

    expect(result.email.activeProvider).toBe('telnyx');
    expect(result.email.telnyxEssionEnabled).toBe(true);
  });

  it('email reports not configured when no provider', async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.TELNYX_EMAIL_ENABLED;
    const result = await getProviderReadiness();

    expect(result.email.configured).toBe(false);
    expect(result.email.blocker).toContain('No email provider');
  });

  it('webhook is configured when URL present', async () => {
    const result = await getProviderReadiness();

    expect(result.webhook.configured).toBe(true);
    expect(result.webhook.publicUrlPresent).toBe(true);
  });

  it('webhook reports missing URL', async () => {
    delete process.env.TELNYX_WEBHOOK_URL;
    const result = await getProviderReadiness();

    expect(result.webhook.configured).toBe(false);
    expect(result.webhook.blocker).toContain('TELNYX_WEBHOOK_URL');
  });

  it('feature flags are read from env', async () => {
    process.env.FEATURE_ESIGN = 'true';
    process.env.FEATURE_VIDEO_MEETINGS = '1';
    process.env.FEATURE_RVM = 'false';
    const result = await getProviderReadiness();

    expect(result.featureFlags.esign).toBe(true);
    expect(result.featureFlags.video_meetings).toBe(true);
    expect(result.featureFlags.rvm).toBe(false);
  });

  it('overall status reflects channel states', async () => {
    // All channels configured, including the AI assistant
    process.env.TELNYX_VIDEO_ENABLED = 'true';
    process.env.RESEND_API_KEY = 'test';
    process.env.RESEND_FROM = 'test@test.com';
    process.env.FEATURE_AI_ASSISTANT = 'true';
    process.env.TELNYX_AI_ASSISTANT_ID = 'asst_1234567890abcdef';
    const result = await getProviderReadiness();

    expect(result.overallStatus).toBe('healthy');
  });

  it('ai assistant reports missing ID when feature enabled', async () => {
    process.env.FEATURE_AI_ASSISTANT = 'true';
    delete process.env.TELNYX_AI_ASSISTANT_ID;
    const result = await getProviderReadiness();

    expect(result.aiAssistant.configured).toBe(true);
    expect(result.aiAssistant.assistantIdPresent).toBe(false);
    expect(result.aiAssistant.blocker).toContain('TELNYX_AI_ASSISTANT_ID');
  });

  it('ai assistant is ready when ID present and feature enabled', async () => {
    process.env.FEATURE_AI_ASSISTANT = 'true';
    process.env.TELNYX_AI_ASSISTANT_ID = 'asst_1234567890abcdef';
    const result = await getProviderReadiness();

    expect(result.aiAssistant.configured).toBe(true);
    expect(result.aiAssistant.assistantIdPresent).toBe(true);
    expect(result.aiAssistant.assistantIdHint).toBe('asst_123…');
    expect(result.aiAssistant.blocker).toBeUndefined();
  });

  it('ai assistant is disabled when feature flag off', async () => {
    delete process.env.FEATURE_AI_ASSISTANT;
    process.env.TELNYX_AI_ASSISTANT_ID = 'asst_1234567890abcdef';
    const result = await getProviderReadiness();

    expect(result.aiAssistant.configured).toBe(false);
    expect(result.aiAssistant.featureEnabled).toBe(false);
    expect(result.aiAssistant.blocker).toContain('FEATURE_AI_ASSISTANT');
  });

  it('overall status is unconfigured when voice missing', async () => {
    delete process.env.TELNYX_API_KEY;
    delete process.env.TELNYX_CONNECTION_ID;
    delete process.env.TELNYX_MESSAGING_PROFILE_ID;
    const result = await getProviderReadiness();

    expect(result.overallStatus).toBe('unconfigured');
  });
});
