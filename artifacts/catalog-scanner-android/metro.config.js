const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Expo monorepo guidance for pnpm:
// https://docs.expo.dev/guides/monorepos/
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Keep hierarchical lookup so nested deps inside the pnpm store can resolve.
config.resolver.disableHierarchicalLookup = false;
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

// Prefer a single copy of these packages across the monorepo.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'expo-router': path.resolve(workspaceRoot, 'node_modules/expo-router'),
  '@expo/metro-runtime': path.resolve(workspaceRoot, 'node_modules/@expo/metro-runtime'),
  'react': path.resolve(workspaceRoot, 'node_modules/react'),
  'react-dom': path.resolve(workspaceRoot, 'node_modules/react-dom'),
  'react-native': path.resolve(workspaceRoot, 'node_modules/react-native'),
  'react-native-web': path.resolve(workspaceRoot, 'node_modules/react-native-web'),
  'whatwg-fetch': path.resolve(workspaceRoot, 'node_modules/whatwg-fetch'),
};

module.exports = config;
