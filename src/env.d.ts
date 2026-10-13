/** 由构建工具（rollup replace / vitest define）注入的包版本号 */
declare const __VERSION__: string | undefined;

/**
 * 仅用于读取 `process.env.NODE_ENV`（由打包工具静态替换）。
 * 访问被 try/catch 包裹，裸浏览器环境下 process 不存在也不会报错。
 */
declare const process: { env: { NODE_ENV?: string } };
