import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lgdx.family',
  appName: 'ZIPPY',
  webDir: 'dist',
  server: {
    // Keep native origins secure on both platforms. API traffic uses the public HTTPS backend.
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
};

export default config;
