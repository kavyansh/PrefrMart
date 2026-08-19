import { describe, expect, it } from 'vitest';
import {
  CREDENTIALS_MESSAGE,
  GENERIC_MESSAGE,
  OAUTH_NOT_LINKED_MESSAGE,
  RATE_LIMITED_MESSAGE,
  signInMessage,
} from './signInErrors';

describe('signInMessage', () => {
  it('blames the credentials only for CredentialsSignin', () => {
    expect(signInMessage('CredentialsSignin')).toBe(CREDENTIALS_MESSAGE);
  });

  it('never blames the credentials for a server-side failure', () => {
    /*
     * The regression this exists for. An AdapterError reaches the page as `Configuration`,
     * and reporting it as a wrong password sent a user hunting for an account problem that
     * did not exist while the real fault was a stale Prisma client.
     */
    expect(signInMessage('Configuration')).not.toBe(CREDENTIALS_MESSAGE);
    expect(signInMessage('Configuration')).toContain('our side');
  });

  it.each([
    'Signin',
    'OAuthSignin',
    'OAuthCallbackError',
    'OAuthCreateAccount',
    'EmailCreateAccount',
    'Callback',
    'EmailSignin',
    'SessionRequired',
    'Verification',
    'SomethingNextAuthAddedLater',
  ])('falls back to a neutral message for %s', (error) => {
    expect(signInMessage(error)).toBe(GENERIC_MESSAGE);
  });

  it('explains the deliberate refusal to link an OAuth account', () => {
    expect(signInMessage('OAuthAccountNotLinked')).toBe(OAUTH_NOT_LINKED_MESSAGE);
    expect(signInMessage('AccountNotLinked')).toBe(OAUTH_NOT_LINKED_MESSAGE);
  });

  it('surfaces throttling, which leaks nothing about the account', () => {
    expect(signInMessage(undefined, 'rate_limited')).toBe(RATE_LIMITED_MESSAGE);
    // The code wins: the error type accompanying a throttled attempt is still CredentialsSignin.
    expect(signInMessage('CredentialsSignin', 'rate_limited')).toBe(RATE_LIMITED_MESSAGE);
  });

  it('is neutral when there is no error at all', () => {
    expect(signInMessage(undefined)).toBe(GENERIC_MESSAGE);
  });
});
