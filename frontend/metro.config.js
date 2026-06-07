const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const localModulesDir = path.resolve(__dirname, 'modules');

config.watchFolders = [...(config.watchFolders ?? []), localModulesDir];

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  'anchor-screen-time': path.join(localModulesDir, 'anchor-screen-time'),
};

module.exports = config;
