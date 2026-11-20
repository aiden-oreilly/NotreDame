// One place for every way to sign in. The rest of the app only calls signIn(key) and reads store.user.
//
// Okta (Notre Dame NetID) is wired as a SAML 2.0 single sign-on provider through Supabase Auth, which is how
// Supabase supports enterprise identity providers. Turning it on needs no code change here:
//   1. ND OIT registers Domer OS as a SAML app in Okta (ACS URL and Entity ID come from Supabase).
//   2. Add the Okta metadata URL in Supabase: `supabase sso add --type saml --metadata-url <okta-url> --domains nd.edu`
//   3. Set VITE_SSO=okta and VITE_SSO_DOMAIN=nd.edu in Vercel and redeploy.
// The button then switches from "Coming soon" to live, and the NetID claims land in profiles.netid.
import { CONFIG } from '../config.js';
import { supabase } from './store.js';

const back = (hash = '') => location.origin + location.pathname + hash;

export const PROVIDERS = [
  {
    key: 'okta', label: 'Notre Dame NetID', note: 'Okta single sign-on',
    enabled: () => CONFIG.sso.provider === 'okta' && !!(CONFIG.sso.domain || CONFIG.sso.providerId),
    soon: 'Ready for Okta. Turns on when Notre Dame connects it.',
    run: () => supabase.auth.signInWithSSO(CONFIG.sso.providerId ? { providerId: CONFIG.sso.providerId, options: { redirectTo: back() } } : { domain: CONFIG.sso.domain, options: { redirectTo: back() } })
      .then(({ data, error }) => { if (data?.url) location.href = data.url; return { error }; }),
  },
  {
    key: 'google', label: 'Google', note: 'Also reads your calendar if you allow it',
    enabled: () => CONFIG.googleOAuth,
    soon: 'Turns on once the Google sign-in key is added.',
    run: (calendar = false) => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: back(calendar ? '#calendar' : ''), scopes: calendar ? 'https://www.googleapis.com/auth/calendar.readonly' : undefined, queryParams: calendar ? { access_type: 'offline', prompt: 'consent' } : undefined } }),
  },
  {
    key: 'email', label: 'Email link', note: 'No password. We send a one-time link.',
    enabled: () => true,
    run: (email) => supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: back() } }),
  },
];
export const provider = key => PROVIDERS.find(p => p.key === key);
export async function signIn(key, arg) {
  const p = provider(key); if (!p) return { error: new Error('Unknown sign-in method') };
  if (!p.enabled()) return { error: new Error(p.soon || 'Not available yet') };
  return p.run(arg);
}
export const signOut = () => supabase.auth.signOut();

// Who the person is at Notre Dame, from whichever provider they used. Okta SAML attributes arrive in
// user_metadata / identities; we normalise the few the app needs.
export function ndIdentity(user) {
  if (!user) return null;
  const md = { ...(user.user_metadata || {}), ...(user.identities?.find(i => i.provider?.startsWith('sso'))?.identity_data || {}) };
  const email = user.email || md.email || '';
  return {
    netid: md.netid || md.uid || (email.endsWith('@nd.edu') ? email.split('@')[0] : null),
    name: md.full_name || md.name || [md.given_name, md.family_name].filter(Boolean).join(' ') || null,
    affiliation: md.eduPersonPrimaryAffiliation || md.affiliation || null,
    viaSSO: !!user.identities?.some(i => i.provider?.startsWith('sso')),
  };
}
