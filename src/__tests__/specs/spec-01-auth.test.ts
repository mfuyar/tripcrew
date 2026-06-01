/**
 * SPEC §1 — Authentication
 *
 * §1.1 Sign Up: full_name, email, password (min 8 chars)
 * §1.2 Login: email, password; specific error messages
 * §1.3 Logout: clears session
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

const email = 'user@tripcrew.app';
const password = 'password123';
const fullName = 'Test User';
const userId = 'user-uuid-1';

// ─── §1.1 Sign Up ─────────────────────────────────────────────────────────────

describe('SPEC §1.1 — Sign Up', () => {
  it('creates user and profile on success', async () => {
    mockAuthSignUp.mockResolvedValueOnce({ data: { user: { id: userId } }, error: null });
    mockUpsert.mockResolvedValueOnce({ error: null });

    const { data, error } = await authService.signUp(email, password, fullName);

    expect(error).toBeNull();
    expect(data?.id).toBe(userId);
    expect(data?.email).toBe(email);
    expect(data?.full_name).toBe(fullName);
  });

  it('propagates "Email already registered" from Supabase', async () => {
    mockAuthSignUp.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'User already registered' },
    });

    const { data, error } = await authService.signUp(email, password, fullName);

    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });

  it('propagates weak password error from Supabase', async () => {
    mockAuthSignUp.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Password should be at least 6 characters' },
    });

    const { data, error } = await authService.signUp(email, 'weak', fullName);

    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });

  it('returns error if profile write fails after auth succeeds', async () => {
    mockAuthSignUp.mockResolvedValueOnce({ data: { user: { id: userId } }, error: null });
    mockUpsert.mockResolvedValueOnce({ error: { message: 'Profile write failed' } });

    const { data, error } = await authService.signUp(email, password, fullName);

    expect(data).toBeNull();
    expect(error).toBe('Profile write failed');
  });

  it('returns error if no user returned after signup', async () => {
    mockAuthSignUp.mockResolvedValueOnce({ data: { user: null }, error: null });

    const { data, error } = await authService.signUp(email, password, fullName);

    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });
});

// ─── §1.2 Login ───────────────────────────────────────────────────────────────

describe('SPEC §1.2 — Login', () => {
  it('returns profile on successful login', async () => {
    const mockProfile = { id: userId, email, full_name: fullName, created_at: '', updated_at: '' };
    mockAuthSignIn.mockResolvedValueOnce({ data: { user: { id: userId } }, error: null });
    mockSingle.mockResolvedValueOnce({ data: mockProfile, error: null });

    const { data, error } = await authService.signIn(email, password);

    expect(error).toBeNull();
    expect(data?.id).toBe(userId);
  });

  it('returns error on wrong credentials', async () => {
    mockAuthSignIn.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Invalid login credentials' },
    });

    const { data, error } = await authService.signIn(email, 'wrongpass');

    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });

  it('returns error for unverified email', async () => {
    mockAuthSignIn.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Email not confirmed' },
    });

    const { data, error } = await authService.signIn(email, password);

    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });
});

// ─── §1.3 Logout ──────────────────────────────────────────────────────────────

describe('SPEC §1.3 — Logout', () => {
  it('calls auth.signOut to clear the session', async () => {
    mockAuthSignOut.mockResolvedValueOnce({ error: null });

    const { error } = await authService.signOut();

    expect(mockAuthSignOut).toHaveBeenCalledTimes(1);
    expect(error).toBeNull();
  });

  it('returns error message if signOut fails', async () => {
    mockAuthSignOut.mockResolvedValueOnce({ error: { message: 'Network error' } });

    const { error } = await authService.signOut();

    expect(error).toBe('Network error');
  });
});
