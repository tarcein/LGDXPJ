import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lgdx.family',
  appName: 'LG Family Care',
  webDir: 'dist',
  server: {
    // Local Android testing uses the LAN HTTP backend; production must use HTTPS.
    androidScheme: 'http',
  },
};

export default config;
