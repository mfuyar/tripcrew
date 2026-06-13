export const AUTH_REDIRECT_URL = 'travelcrew://auth/callback';

// Tapping this opens the app directly (if installed) with the invite code
// pre-filled on the "Request Trip Access" modal.
export function buildTripInviteLink(inviteCode: string): string {
  return `travelcrew://join?code=${encodeURIComponent(inviteCode)}`;
}
