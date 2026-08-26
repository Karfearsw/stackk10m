import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the storage module so the resolver never touches the DB in tests.
const { getAppSetting } = vi.hoisted(() => ({ getAppSetting: vi.fn() }));
vi.mock('../server/storage.js', () => ({
  storage: { getAppSetting: (...args: any[]) => getAppSetting(...args) },
}));

import { getAiAssistantConfig } from '../server/services/telecom/ai-config';

describe('getAiAssistantConfig', () => {
  beforeEach(() => {
    getAppSetting.mockReset();
    getAppSetting.mockResolvedValue(null);
    vi.stubEnv('FEATURE_AI_ASSISTANT', 'true');
    vi.stubEnv('TELNYX_AI_ASSISTANT_ID', 'asst_env_123');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses env vars when no DB override exists', async () => {
    getAppSetting.mockResolvedValue(null);
    const cfg = await getAiAssistantConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.assistantId).toBe('asst_env_123');
    expect(cfg.source).toBe('env');
    expect(cfg.featureSource).toBe('env');
  });

  it('DB override wins for both the flag and the assistant id', async () => {
    getAppSetting.mockImplementation(async (key: string) => {
      if (key === 'FEATURE_AI_ASSISTANT') return 'false';
      if (key === 'TELNYX_AI_ASSISTANT_ID') return 'asst_db_456';
      return null;
    });
    const cfg = await getAiAssistantConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.assistantId).toBe('asst_db_456');
    expect(cfg.source).toBe('db');
    expect(cfg.featureSource).toBe('db');
  });

  it('falls back to env assistant id when the DB value is blank', async () => {
    getAppSetting.mockImplementation(async (key: string) => {
      if (key === 'FEATURE_AI_ASSISTANT') return 'false';
      if (key === 'TELNYX_AI_ASSISTANT_ID') return '   ';
      return null;
    });
    const cfg = await getAiAssistantConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.assistantId).toBe('asst_env_123');
    expect(cfg.source).toBe('env');
    expect(cfg.featureSource).toBe('db');
  });

  it('returns none when nothing is configured anywhere', async () => {
    vi.stubEnv('FEATURE_AI_ASSISTANT', '');
    vi.stubEnv('TELNYX_AI_ASSISTANT_ID', '');
    getAppSetting.mockResolvedValue(null);
    const cfg = await getAiAssistantConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.assistantId).toBeNull();
    expect(cfg.source).toBe('none');
  });

  it('gracefully falls back to env when the settings read throws', async () => {
    getAppSetting.mockRejectedValue(new Error('table missing'));
    const cfg = await getAiAssistantConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.assistantId).toBe('asst_env_123');
    expect(cfg.source).toBe('env');
  });
});
