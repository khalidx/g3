export function hasErrorCode <Code extends string | number> (error: unknown, code: Code): error is { code: Code } {
  return (typeof error === 'object' && error !== null && 'code' in error && error.code === code)
}
