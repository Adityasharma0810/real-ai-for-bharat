// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Fix: "Cannot destructure property '__extends' of 'tslib.default' as it is undefined"
//
// Root cause: Expo SDK 54 enables `unstable_enablePackageExports` by default. This
// causes Metro to read the `"exports"` field in tslib's package.json, which under
// the "import" condition resolves to `tslib.es6.mjs` (ESM). Supabase's compiled
// CJS code then does `require('tslib').default` which is undefined in ESM context.
//
// Fix 1: Disable package exports resolution so Metro always uses the `main` field
// (tslib.js = CJS) instead of the exports field (tslib.es6.mjs = ESM).
config.resolver.unstable_enablePackageExports = false;

// Fix 2: Belt-and-suspenders — explicitly resolve any import of 'tslib' to the CJS build.
const path = require('path');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'tslib') {
    return {
      filePath: require.resolve('tslib/tslib.js'),
      type: 'sourceFile',
    };
  }

  // Redirect native-only camera libraries to web stubs when running on web
  if (platform === 'web') {
    if (moduleName === 'react-native-vision-camera') {
      return {
        filePath: path.resolve(__dirname, 'src/mocks/react-native-vision-camera.web.ts'),
        type: 'sourceFile',
      };
    }
    if (moduleName === 'react-native-vision-camera-face-detector') {
      return {
        filePath: path.resolve(__dirname, 'src/mocks/react-native-vision-camera-face-detector.web.ts'),
        type: 'sourceFile',
      };
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

