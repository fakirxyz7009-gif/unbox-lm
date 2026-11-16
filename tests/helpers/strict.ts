/** The environment flag that turns missing environment-gated coverage into a single failing check. */
export const STRICT_COVERAGE_ENV = 'UNBOX_REQUIRE_FULL_COVERAGE';

export function strictCoverage(): boolean {
  return /^(1|true|yes|on)$/i.test(process.env[STRICT_COVERAGE_ENV] ?? '');
}
