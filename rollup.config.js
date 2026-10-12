const typescript = require('@rollup/plugin-typescript');
const { nodeResolve } = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const replace = require('@rollup/plugin-replace');
const terser = require('@rollup/plugin-terser').default;
const dts = require('rollup-plugin-dts').default;

const pkg = require('./package.json');

const banner = `/*!
 * ${pkg.name} v${pkg.version}
 * (c) 2025 caiqianha
 * Released under the MIT License.
 */`;

const versionReplace = () =>
  replace({
    preventAssignment: true,
    values: {
      __VERSION__: JSON.stringify(pkg.version)
    }
  });

module.exports = [
  // ES Module build
  {
    input: 'src/index.ts',
    output: {
      file: pkg.module,
      format: 'es',
      banner,
      sourcemap: true
    },
    plugins: [
      versionReplace(),
      nodeResolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false
      })
    ],
    external: ['vue']
  },
  // UMD build
  {
    input: 'src/index.ts',
    output: {
      file: pkg.main,
      format: 'umd',
      name: 'VueWebStorage',
      banner,
      sourcemap: true,
      exports: 'named',
      globals: {
        vue: 'Vue'
      }
    },
    plugins: [
      versionReplace(),
      nodeResolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false
      }),
      terser()
    ],
    external: ['vue']
  },
  // TypeScript declarations
  {
    input: 'src/index.ts',
    output: {
      file: pkg.types,
      format: 'es'
    },
    plugins: [dts()]
  }
];
