export const LEGAL_LAST_UPDATED = 'June 4, 2026';

export type LegalSection = {
  title: string;
  body: string[];
};

export const PRIVACY_POLICY_SECTIONS: LegalSection[] = [
  {
    title: 'What Travel Crew does',
    body: [
      'Travel Crew helps trip members plan together, split expenses, chat, share photos/audio, post announcements, vote in polls, share live location when enabled, and discover community spots.',
      'Trip content is intended for the people in that trip. Community spots are public to Travel Crew users unless marked as AI-suggested or removed.',
    ],
  },
  {
    title: 'Information we collect',
    body: [
      'Account information: name, email address, profile details, authentication identifiers, and optional phone/avatar details.',
      'Trip information: trip names, destinations, dates, invite/join requests, families, members, roles, itinerary items, grocery and packing lists, car plans, announcements, polls, expenses, settlements, receipts, comments, and messages.',
      'Media and audio: photos, receipt images, chat photos, captions, and push-talk/audio messages that you upload or record.',
      'Location information: your current location only when you choose to use live location or location-based features such as community spots. Live location is visible only to trip members while sharing is active.',
      'Device and notification information: push notification tokens, app session/device identifiers where available, platform type, and basic technical information needed to deliver notifications and keep the app working.',
      'Moderation information: reports, moderation status, reviewer actions, and automated review signals for bad language, unsafe content, or adult imagery.',
    ],
  },
  {
    title: 'How we use information',
    body: [
      'To create and manage your account and trips.',
      'To show trip data to the correct members and apply organizer, admin, family, and global admin permissions.',
      'To deliver chat, push-talk, announcements, polls, expense updates, and push notifications.',
      'To store and display uploaded media, receipts, and community spot photos.',
      'To provide map, address, nearby spot, and location-sharing features that you choose to use.',
      'To moderate content, prevent abuse, investigate safety issues, and enforce trip privacy.',
      'To maintain, debug, secure, and improve the app.',
    ],
  },
  {
    title: 'Sharing and visibility',
    body: [
      'Trip data is shared with approved members of the trip and with organizers/admins who manage that trip.',
      'Community spots are public to Travel Crew users. You may appear by first name or as anonymous depending on the feature settings.',
      'Live location is shared only with members of the selected trip while sharing is active. Other users should treat locations as approximate.',
      'Global admins may access trip content when needed for safety, support, moderation, abuse prevention, or legal compliance.',
      'We do not sell your personal information or location data.',
      'We may share limited data with service providers that run app infrastructure, authentication, storage, maps/location features, notifications, AI assistance, and moderation tools.',
    ],
  },
  {
    title: 'AI and automated moderation disclosure',
    body: [
      'Travel Crew may use AI services to suggest nearby places, summarize community spots, parse receipts, or help moderate text and images.',
      'Obvious bad language, unsafe content, or adult imagery may be rejected automatically. Unclear cases may be held for human review.',
      'Do not submit private, sensitive, illegal, or confidential information to AI-assisted features unless you are comfortable with it being processed to provide the feature.',
    ],
  },
  {
    title: 'Photos, audio, and retention',
    body: [
      'Saved trip media remains available until deleted by a permitted user or removed by an admin/moderator.',
      'Chat photos and push-talk/audio that are not saved to the trip album are intended to expire and be deleted after about 24 hours.',
      'Deletion may not be instant because cleanup jobs, backups, caches, and signed media links can take time to expire.',
    ],
  },
  {
    title: 'Your choices',
    body: [
      'You can choose whether to upload photos, record audio, enable live location, enable push notifications, post community spots, or join a trip.',
      'You can turn live location off at any time from the Live Location screen.',
      'You can request access to a trip with an invite code, but an organizer must approve you before you can view private trip content.',
      'You can edit or delete your own supported content where the app provides controls. Organizers, admins, and global admins may have additional moderation or management controls.',
    ],
  },
  {
    title: 'Security',
    body: [
      'We use access controls, row-level permissions, private storage, signed media URLs, and authentication to protect trip data.',
      'No app can guarantee perfect security. Use strong passwords and do not share invite codes publicly.',
    ],
  },
  {
    title: 'Children',
    body: [
      'Travel Crew is not intended for children under 13. Do not create an account or submit personal information if you are under 13.',
      'Trip organizers should avoid posting children\'s personal details unless they have appropriate permission from a parent or guardian.',
    ],
  },
  {
    title: 'Limits and safety disclosure',
    body: [
      'Travel Crew is a planning and coordination tool. It is not an emergency service, financial institution, medical service, legal advisor, or safety monitoring service.',
      'Expense and settlement information is for group coordination only. Users are responsible for verifying amounts and payments.',
      'Location, maps, address search, AI suggestions, and community content may be inaccurate or outdated. Use your own judgment.',
    ],
  },
  {
    title: 'Changes and contact',
    body: [
      'We may update this policy as the app changes. Continued use after an update means you accept the updated policy.',
      'Questions or deletion requests can be sent to mfuyar@gmail.com.',
    ],
  },
];
