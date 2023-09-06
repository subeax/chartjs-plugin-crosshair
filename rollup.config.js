const terser = require('rollup-plugin-terser').terser;
const pkg = require('./package.json');

let name = pkg.name.split("/")
name = name.length > 1 ? name[1] : name[0]

const banner = `/*!
 * ${name} v${pkg.version}
 * ${pkg.homepage}
 * (c) ${new Date().getFullYear()} Chart.js Contributors
 * Released under the ${pkg.license} license
 */`;
 
 const external = [
  'chart.js',
  'chart.js/helpers'
];
const globals = {
  'chart.js': 'Chart',
  'chart.js/helpers': 'Chart.helpers'
}

module.exports = [

	{
		input: 'src/index.js',
		output: {
			name: 'ChartCrosshair',
			file: `dist/${name}.js`,
			banner: banner,
			format: 'umd',
			indent: false,
			globals: globals
		},
		external: external
	},

	{
		input: 'src/index.js',
		output: {
			name: 'ChartCrosshair',
			file: `dist/${name}.min.js`,
			format: 'umd',
			indent: false,
			globals: globals,
			},
			plugins: [
				terser({
					output: {
						preamble: banner
					}
				})
			],
			external: external
	},
	{
    input: 'src/index.esm.js',
    output: {
      name: 'ChartCrosshair',
      file: `dist/${name}.esm.js`,
      format: 'esm',
      indent: false
    },
    external: external
  },
];
