const SUBJECTS: Record<string, string> = {
  signup: 'Verify your TD IT Solution Insurance account',
  recovery: 'Reset your TD IT Solution Insurance password',
  invite: 'You have been invited to TD IT Solution Insurance',
  magiclink: 'Your TD IT Solution Insurance sign-in link',
  email_change: 'Confirm your new email address',
  reauthentication: 'Your verification code',
};

export function subjectFor(actionType: string): string {
  return SUBJECTS[actionType] ?? 'TD IT Solution Insurance notification';
}
