import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { telnyxVideo } from '../server/services/telecom/video';

describe('Telnyx Video Service', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.TELNYX_API_KEY = 'test-api-key';
    process.env.TELNYX_VIDEO_ENABLED = 'true';
    mockFetch.mockReset();
  });

  describe('createRoom', () => {
    it('creates a room successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: 'room-123',
            unique_name: 'Test Meeting',
            max_participants: 10,
          },
        }),
      });

      const result = await telnyxVideo.createRoom({ name: 'Test Meeting', maxParticipants: 10 });

      expect(result.roomId).toBe('room-123');
      expect(result.roomSid).toBe('room-123');
      expect(result.name).toBe('Test Meeting');
      expect(result.maxParticipants).toBe(10);

      // Verify the fetch call
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.telnyx.com/v2/rooms',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        }),
      );
    });

    it('throws when video is not enabled', async () => {
      delete process.env.TELNYX_VIDEO_ENABLED;

      await expect(
        telnyxVideo.createRoom({ name: 'Test' }),
      ).rejects.toThrow('TELNYX_VIDEO_ENABLED');
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          errors: [{ title: 'Invalid request' }],
        }),
      });

      await expect(
        telnyxVideo.createRoom({ name: 'Test' }),
      ).rejects.toThrow('Invalid request');
    });
  });

  describe('getJoinToken', () => {
    it('gets a join token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            token: 'join-token-abc',
          },
        }),
      });

      const result = await telnyxVideo.getJoinToken('room-123', 'user@example.com');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.telnyx.com/v2/rooms/room-123/actions/generate_join_client_token',
        expect.objectContaining({ method: 'POST' }),
      );

      expect(result.token).toBe('join-token-abc');
      expect(result.roomId).toBe('room-123');
      expect(result.identity).toBe('user@example.com');
    });

    it('throws when video is not enabled', async () => {
      delete process.env.TELNYX_VIDEO_ENABLED;

      await expect(
        telnyxVideo.getJoinToken('room-123', 'user'),
      ).rejects.toThrow('TELNYX_VIDEO_ENABLED');
    });
  });

  describe('endRoom', () => {
    it('ends a room', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      await expect(telnyxVideo.endRoom('room-123')).resolves.not.toThrow();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.telnyx.com/v2/rooms/room-123',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          errors: [{ title: 'Room not found' }],
        }),
      });

      await expect(telnyxVideo.endRoom('nonexistent')).rejects.toThrow('Room not found');
    });
  });

  describe('healthCheck', () => {
    it('returns healthy when video is configured and reachable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const result = await telnyxVideo.healthCheck();

      expect(result.configured).toBe(true);
      expect(result.reachable).toBe(true);
      expect(result.roomsApiAvailable).toBe(true);
      expect(result.blocker).toBeUndefined();
    });

    it('returns not configured when TELNYX_VIDEO_ENABLED is false', async () => {
      process.env.TELNYX_VIDEO_ENABLED = 'false';

      const result = await telnyxVideo.healthCheck();

      expect(result.configured).toBe(false);
      expect(result.blocker).toContain('TELNYX_VIDEO_ENABLED');
    });

    it('returns not configured when API key missing', async () => {
      delete process.env.TELNYX_API_KEY;

      const result = await telnyxVideo.healthCheck();

      expect(result.configured).toBe(false);
      expect(result.blocker).toContain('TELNYX_API_KEY');
    });

    it('returns unreachable on auth failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const result = await telnyxVideo.healthCheck();

      expect(result.configured).toBe(true);
      expect(result.reachable).toBe(false);
      expect(result.blocker).toContain('permissions');
    });

    it('returns unreachable on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await telnyxVideo.healthCheck();

      expect(result.configured).toBe(true);
      expect(result.reachable).toBe(false);
      expect(result.blocker).toContain('Network error');
    });
  });
});
