module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  transformIgnorePatterns: [
    '/node_modules/(?!(?:msw/|@open-draft/|cookie/|@mswjs/interceptors/|until-async/|.*[.]mjs$))',
  ],
  transform: {
    '^.+[.](?:[cm]?js|tsx?)$': [
      '@swc/jest',
      {
        jsc: { parser: { syntax: 'typescript' } },
        module: { type: 'commonjs' },
      },
    ],
  },
};
