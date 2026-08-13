const SUBJECTS: Record<string, string> = {
  signup: 'Verify your email — TD IT Solution Insurance',
  recovery: 'Reset your password — TD IT Solution Insurance',
  invite: 'You\'re invited to TD IT Solution Insurance',
  magiclink: 'Your secure sign-in link — TD IT Solution Insurance',
  email_change: 'Confirm your new email address',
  reauthentication: 'Your verification code — TD IT Solution Insurance',
};

export function subjectFor(actionType: string): string {
  return SUBJECTS[actionType] ?? 'TD IT Solution Insurance — account notification';
}
