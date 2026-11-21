import { describe, expect, it } from 'vitest';
import { maskContacts } from './schemas';

describe('maskContacts (FR-51)', () => {
  it.each([
    ['Mail me at leo.marin+work@example.com please', 'Mail me at [email hidden] please'],
    ['leo (at) example (dot) com', '[email hidden]'],
    ['Call +1 (415) 555-0134 tomorrow', 'Call [phone hidden] tomorrow'],
    ['WhatsApp 98765 43210', 'WhatsApp [phone hidden]'],
    ['ping 415.555.0134 or me@x.co', 'ping [phone hidden] or [email hidden]'],
  ])('hides contacts in %j', (input, expected) => {
    expect(maskContacts(input)).toEqual({ text: expected, masked: true });
  });

  it.each(['Posting on 12/03 at 5pm', 'Order #A1B2C3, 3 videos for $250', 'Delivery in 5 days, 2 revisions', 'Our 2026 spring launch'])(
    'leaves ordinary numbers alone: %j',
    (input) => {
      expect(maskContacts(input)).toEqual({ text: input, masked: false });
    },
  );
});
