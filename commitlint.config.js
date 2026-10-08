/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'backend',
        'client',
        'desktop',
        'mobile',
        'kds',
        'types',
        'utils',
        'ui',
        'db',
        'docs',
        'ci',
        'deps',
        'repo',
      ],
    ],
  },
};
