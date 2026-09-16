module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // react-native-reanimated exige que o plugin dele seja SEMPRE o último da lista.
    plugins: ['react-native-reanimated/plugin'],
  };
};
