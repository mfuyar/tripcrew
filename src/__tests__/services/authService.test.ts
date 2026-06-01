/**
 * SPEC: Auth Service
 *
 * Tests sign-up, sign-in, sign-out, and profile operations.
 * Covers the error cases defined in SPEC §1.1 and §1.2.
 */

const mockAuthSignUp = jest.fn();
const mockAuthSignIn = jest.fn();
const mockAuthSignOut = jest.fn();

const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockUpdate = jest.fn();
const mockUpsert = jest.fn();

const mockFrom = jest.fn(() => ({
  select: mockSelect.mockReturnThis(),
  update: mockUpdate.mockReturnThis(),
  upsert: mockUpsert,
  eq: mockEq.mockReturnThis(),
  single: mockSingle,
}));

jest.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: mockFrom,
    auth: {
      signUp: mockAuthSignUp,
      signInWithPassword: mockAuthSignIn,
      signOut: mockAuthSignOut,
    },
  },
}));

import { authService } from '../../services/authService';

beforeEach(() => jest.clearAllMocks());

describe('authService', () => {
  const userId = 'user-abc';
  const email = 'test@tripcrew.app';
  const password = 'password123';
  const fullName = 'Test User';

  describe('signUp', () => {
    // SPEC §1.1: User created, profile written, returns profile
    it('creates auth user and profile on success', async () => {
      mockAuthSignUp.mockResolvedValueOnce({
        data: { user: { id: userId } },
        error: null,
      });
      mockUpsert.mockResolvedValueOnce({ error: null });

      const { data, error } = await authService.signUp(email, password, fullName);

      expect(mockAuthSignUp).toHaveBeenCalledWith({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      expect(mockUpsert).toHaveBeenCalled();
      expect(error).toBeNull();
      expect(data?.email).toBe(email);
      expect(data?.full_name).toBe(fullName);
    });

    // SPEC §1.1: Email already in use → error
    it('returns error if auth signup fails', async () => {
      mockAuthSignUp.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Email already registered' },
      });

      const { data, error } = await authService.signUp(email, password, fullName);

      expect(data).toBeNull();
      expect(error).toBe('Email already registered');
    });

    // Profile write fails → error propagated
    it('returns error if profile upsert fails', async () => {
      mockAuthSignUp.mockResolvedValueOnce({
        data: { user: { id: userId } },
        error: null,
      });
      mockUpsert.mockResolvedValueOnce({ error: { message: 'Profile write failed' } });

      const { data, error } = await authService.signUp(email, password, fullName);

      expect(data).toBeNull();
      expect(error).toBe('Profile write failed');
    });
  });

  describe('signIn', () => {
    const mockProfile = { id: userId, email, full_name: fullName, created_at: '', updated_at: '' };

    // SPEC §1.2: Session started, profile returned
    it('returns profile on successful sign-in', async () => {
      mockAuthSignIn.mockResolvedValueOnce({
        data: { user: { id: userId } },
        error: null,
      });
      mockSingle.mockResolvedValueOnce({ data: mockProfile, error: null });

      const { data, error } = await authService.signIn(email, password);

      expect(mockAuthSignIn).toHaveBeenCalledWith({ email, password });
      expect(error).toBeNull();
      expect(data?.id).toBe(userId);
    });

    // SPEC §1.2: Wrong credentials → error
    it('returns error on wrong credentials', async () => {
      mockAuthSignIn.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Invalid login credentials' },
      });

      const { data, error } = await authService.signIn(email, password);

      expect(data).toBeNull();
      expect(error).toBe('Invalid login credentials');
    });
  });

  describe('signOut', () => {
    // SPEC §1.3: Clears session
    it('calls auth signOut and returns no error', async () => {
      mockAuthSignOut.mockResolvedValueOnce({ error: null });

      const { error } = await authService.signOut();

      expect(mockAuthSignOut).toHaveBeenCalled();
      expect(error).toBeNull();
    });
  });

  describe('getProfile', () => {
    it('returns profile for a given user id', async () => {
      const mockProfile = { id: userId, email, full_name: fullName, created_at: '', updated_at: '' };
      mockSingle.mockResolvedValueOnce({ data: mockProfile, error: null });

      const { data, error } = await authService.getProfile(userId);

      expect(mockFrom).toHaveBeenCalledWith('profiles');
      expect(error).toBeNull();
      expect(data?.id).toBe(userId);
    });

    it('returns error if profile not found', async () => {
      mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'No rows found' } });

      const { data, error } = await authService.getProfile('unknown-id');

      expect(data).toBeNull();
      expect(error).toBe('No rows found');
    });
  });

  describe('updateProfile', () => {
    it('updates and returns the updated profile', async () => {
      const updated = { id: userId, email, full_name: 'New Name', created_at: '', updated_at: '' };
      mockSingle.mockResolvedValueOnce({ data: updated, error: null });

      const { data, error } = await authService.updateProfile(userId, { full_name: 'New Name' });

      expect(mockFrom).toHaveBeenCalledWith('profiles');
      expect(error).toBeNull();
      expect(data?.full_name).toBe('New Name');
    });
  });
});
