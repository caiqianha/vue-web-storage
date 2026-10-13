import { StorageSchema, StandardSchemaV1, StandardSchemaIssue, SchemaOptions, OnInvalidHook } from './types';

/**
 * 写入 / 读取时 schema 校验失败抛出的错误
 */
export class StorageValidationError extends Error {
  /** 出错的 key（不含前缀） */
  readonly key: string;
  /** Standard Schema 返回的问题列表；函数式校验器抛错时为空数组 */
  readonly issues: ReadonlyArray<StandardSchemaIssue>;
  /** 校验函数抛出的原始错误（如果有） */
  readonly cause?: unknown;

  constructor(key: string, issues: ReadonlyArray<StandardSchemaIssue> = [], cause?: unknown) {
    const detail =
      issues.length > 0
        ? issues.map(issue => formatIssue(issue)).join('; ')
        : cause instanceof Error
          ? cause.message
          : String(cause ?? 'validation failed');
    super(`[vue-web-super-storage] invalid value for key "${key}": ${detail}`);
    this.name = 'StorageValidationError';
    this.key = key;
    this.issues = issues;
    this.cause = cause;
  }
}

function formatIssue(issue: StandardSchemaIssue): string {
  const path = issue.path
    ?.map(segment => (typeof segment === 'object' && segment !== null ? String(segment.key) : String(segment)))
    .join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}

function isStandardSchema(schema: unknown): schema is StandardSchemaV1 {
  return (
    !!schema &&
    typeof schema === 'object' &&
    '~standard' in schema &&
    typeof (schema as StandardSchemaV1)['~standard']?.validate === 'function'
  );
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return !!value && typeof (value as PromiseLike<unknown>).then === 'function';
}

/**
 * 同步校验。Standard Schema 返回 Promise 时抛出错误（同步存储不支持异步 schema）。
 */
export function validateSync<T>(schema: StorageSchema<T>, value: unknown, key: string): T {
  if (isStandardSchema(schema)) {
    const result = schema['~standard'].validate(value);
    if (isPromiseLike(result)) {
      throw new TypeError(
        `[vue-web-super-storage] schema for key "${key}" is asynchronous; async schemas are only supported by the IndexedDB adapter`
      );
    }
    if (result.issues) {
      throw new StorageValidationError(key, result.issues);
    }
    return result.value as T;
  }
  try {
    return (schema as (value: unknown) => T)(value);
  } catch (error) {
    if (error instanceof StorageValidationError) throw error;
    throw new StorageValidationError(key, [], error);
  }
}

/**
 * 异步校验：支持返回 Promise 的 Standard Schema
 */
export async function validateAsync<T>(schema: StorageSchema<T>, value: unknown, key: string): Promise<T> {
  if (isStandardSchema(schema)) {
    const result = await schema['~standard'].validate(value);
    if (result.issues) {
      throw new StorageValidationError(key, result.issues);
    }
    return result.value as T;
  }
  return validateSync(schema, value, key);
}

/**
 * 是否需要迁移：实例配置了 version 且存储的版本更低
 */
export function needsMigration(storedVersion: number, options: SchemaOptions): boolean {
  return typeof options.version === 'number' && storedVersion < options.version;
}

/**
 * 执行迁移。优先 `migrations` 链（逐版本执行，缺失的步骤跳过），否则调用 `migrate`。
 * 两者都没有时原样返回（只升级版本号）。
 */
export function runMigrations<T>(value: unknown, storedVersion: number, options: SchemaOptions<T>): T {
  const target = options.version as number;
  if (options.migrations) {
    let current: unknown = value;
    for (let v = storedVersion + 1; v <= target; v++) {
      const step = options.migrations[v];
      if (typeof step === 'function') {
        current = step(current, v - 1);
      }
    }
    return current as T;
  }
  if (options.migrate) {
    return options.migrate(value, storedVersion);
  }
  return value as T;
}

/**
 * 校验 version 选项：必须是非负整数
 */
export function normalizeVersion(version: number | undefined): number | undefined {
  if (version === undefined) return undefined;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    throw new TypeError(`[vue-web-super-storage] "version" must be a non-negative integer, received ${String(version)}`);
  }
  return version;
}

/**
 * 是否处于 production 环境。依赖打包工具替换 `process.env.NODE_ENV`；
 * 在没有 `process` 的裸浏览器环境中视为开发环境。
 */
export function isProduction(): boolean {
  try {
    return process.env.NODE_ENV === 'production';
  } catch {
    return false;
  }
}

/**
 * 默认的 onInvalid：非 production 环境下 console.warn
 */
export const defaultOnInvalid: OnInvalidHook = (key, error) => {
  if (isProduction()) return;
  console.warn(`[vue-web-super-storage] stored value for key "${key}" is invalid and was ignored:`, error);
};

/**
 * 读取流程中 迁移 + 校验 的公共部分（同步版）。
 * 返回处理后的值；失败时触发 onInvalid 并返回 undefined。
 */
export function prepareReadSync<T>(
  value: unknown,
  storedVersion: number,
  key: string,
  options: SchemaOptions<T>,
  schemaOverride?: StorageSchema<T>
): { ok: true; value: T; migrated: boolean } | { ok: false } {
  const schema = schemaOverride ?? options.schema;
  try {
    let current: unknown = value;
    let migrated = false;
    if (needsMigration(storedVersion, options)) {
      current = runMigrations(current, storedVersion, options);
      migrated = true;
    }
    if (schema) {
      current = validateSync(schema, current, key);
    }
    return { ok: true, value: current as T, migrated };
  } catch (error) {
    (options.onInvalid ?? defaultOnInvalid)(key, error);
    return { ok: false };
  }
}

/**
 * 读取流程中 迁移 + 校验 的公共部分（异步版，供 IndexedDB 使用）
 */
export async function prepareReadAsync<T>(
  value: unknown,
  storedVersion: number,
  key: string,
  options: SchemaOptions<T>,
  schemaOverride?: StorageSchema<T>
): Promise<{ ok: true; value: T; migrated: boolean } | { ok: false }> {
  const schema = schemaOverride ?? options.schema;
  try {
    let current: unknown = value;
    let migrated = false;
    if (needsMigration(storedVersion, options)) {
      current = runMigrations(current, storedVersion, options);
      migrated = true;
    }
    if (schema) {
      current = await validateAsync(schema, current, key);
    }
    return { ok: true, value: current as T, migrated };
  } catch (error) {
    (options.onInvalid ?? defaultOnInvalid)(key, error);
    return { ok: false };
  }
}
