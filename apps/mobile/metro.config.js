const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Watch the monorepo root packages directory so Metro bundles @portl/shared
config.watchFolders = [path.resolve(__dirname, '../../packages')];

// Enable Metro to resolve .js extension imports (from Node ESM TS packages like @portl/shared) to .ts files
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.endsWith('.js')) {
    const tsModuleName = moduleName.replace(/\.js$/, '.ts');
    try {
      return context.resolveRequest(context, tsModuleName, platform);
    } catch (e) {
      // Fallback to default resolution if .ts does not exist
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
