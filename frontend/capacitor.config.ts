import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lgdx.family',
  appName: 'ZIPPY',
  webDir: 'dist',
  server: {
    url: 'https://zippy.dx6project.site',
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
};

export default config;
