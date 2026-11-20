const env = import.meta.env || {};
export const CONFIG = {
  supabaseUrl: env.VITE_SUPABASE_URL || 'https://gcrqhvfdqhtjowfhiebu.supabase.co',
  supabaseKey: env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_uiQ22Z3jxNvDUXac_BMarQ_9lumU4HV',
  campusUrl: env.VITE_CAMPUS_URL || 'https://gcrqhvfdqhtjowfhiebu.supabase.co/storage/v1/object/public/campus/v1/campus.json',
  imageryUrl: env.VITE_IMAGERY_URL || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  imageryAttribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
  googleOAuth: env.VITE_GOOGLE_OAUTH === '1',
  // Okta / Notre Dame NetID single sign-on (SAML through Supabase Auth). Empty until ND connects it.
  sso: { provider: env.VITE_SSO || '', domain: env.VITE_SSO_DOMAIN || '', providerId: env.VITE_SSO_PROVIDER_ID || '' },
  weatherUrl: 'https://api.open-meteo.com/v1/forecast?latitude=41.7030&longitude=-86.2390&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m,is_day&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FNew_York',
};
