/**
 * Placeholder wordmark in the Webinger style. The product name and final brand colour are still
 * open (CLAUDE.md §16): change PRODUCT_NAME here, or swap in /public/logo.svg, when they are decided.
 */
export const PRODUCT_NAME = 'Webinger Collab';

export function Logo({ height = 28, inverse = false }: { height?: number; inverse?: boolean }) {
  return (
    <span
      aria-label={PRODUCT_NAME}
      role="img"
      style={{
        display: 'inline-block',
        fontSize: height,
        fontWeight: 800,
        letterSpacing: '-0.03em',
        lineHeight: 1,
        color: inverse ? '#fff' : 'var(--ink)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: 'var(--brand-red)', fontStyle: 'italic', marginRight: 1 }}>W</span>
      <span>ebinger</span>{' '}
      <span style={{ fontSize: '0.5em', fontWeight: 700, marginLeft: '0.1em', color: inverse ? 'rgba(255,255,255,0.75)' : 'var(--ink-3)', letterSpacing: '0.02em' }}>
        COLLAB
      </span>
    </span>
  );
}
