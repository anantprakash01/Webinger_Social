import { describe, expect, it } from 'vitest';
import {
  accountBalance,
  captureLines,
  findUnbalancedTxns,
  LedgerImbalanceError,
  payoutLines,
  postTxn,
  refundLines,
  releaseLines,
  txnBalance,
  type LedgerEntry,
} from './ledger';

const meta = (txnId: string) => ({ txnId, orderId: 'O1', memo: 'test', at: '2026-11-20T00:00:00.000Z' });

describe('ledger builders', () => {
  it('each builder sums to zero', () => {
    expect(txnBalance(captureLines(22_000))).toBe(0);
    expect(txnBalance(releaseLines({ escrowCents: 22_000, creatorPayoutCents: 17_000 }))).toBe(0);
    expect(txnBalance(refundLines(22_000))).toBe(0);
    expect(txnBalance(payoutLines(17_000))).toBe(0);
  });

  it('release splits escrow into platform revenue and creator balance ($200 example)', () => {
    const lines = releaseLines({ escrowCents: 22_000, creatorPayoutCents: 17_000 });
    expect(lines).toEqual([
      { account: 'ESCROW', debitCents: 0, creditCents: 22_000 },
      { account: 'PLATFORM_REVENUE', debitCents: 5_000, creditCents: 0 },
      { account: 'CREATOR_BALANCE', debitCents: 17_000, creditCents: 0 },
    ]);
  });

  it('refuses a release that pays the creator more than escrow holds', () => {
    expect(() => releaseLines({ escrowCents: 100, creatorPayoutCents: 200 })).toThrow(LedgerImbalanceError);
  });
});

describe('postTxn', () => {
  it('stamps balanced entries', () => {
    const entries = postTxn(captureLines(22_000), meta('T1'));
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.txnId === 'T1' && e.orderId === 'O1')).toBe(true);
  });

  it('throws on an unbalanced transaction', () => {
    expect(() =>
      postTxn(
        [
          { account: 'ESCROW', debitCents: 100, creditCents: 0 },
          { account: 'BRAND_CHARGE', debitCents: 0, creditCents: 99 },
        ],
        meta('T2'),
      ),
    ).toThrow(/off by 1 cents/);
  });

  it('throws on fractional, negative or two-sided entries', () => {
    expect(() =>
      postTxn(
        [
          { account: 'ESCROW', debitCents: 10.5, creditCents: 0 },
          { account: 'BRAND_CHARGE', debitCents: 0, creditCents: 10.5 },
        ],
        meta('T3'),
      ),
    ).toThrow(/integer cents/);
    expect(() =>
      postTxn(
        [
          { account: 'ESCROW', debitCents: -5, creditCents: 0 },
          { account: 'BRAND_CHARGE', debitCents: -5, creditCents: 0 },
        ],
        meta('T4'),
      ),
    ).toThrow(LedgerImbalanceError);
    expect(() =>
      postTxn(
        [
          { account: 'ESCROW', debitCents: 5, creditCents: 5 },
          { account: 'BRAND_CHARGE', debitCents: 0, creditCents: 0 },
        ],
        meta('T5'),
      ),
    ).toThrow(LedgerImbalanceError);
  });
});

describe('dev checks', () => {
  it('finds unbalanced transactions and computes account balances', () => {
    const good = [...postTxn(captureLines(22_000), meta('A')), ...postTxn(releaseLines({ escrowCents: 22_000, creatorPayoutCents: 17_000 }), meta('B'))];
    const bad: LedgerEntry = { ...good[0], txnId: 'C', creditCents: 1, debitCents: 0 };
    expect(findUnbalancedTxns(good)).toEqual([]);
    expect(findUnbalancedTxns([...good, bad])).toEqual(['C']);
    expect(accountBalance(good, 'ESCROW')).toBe(0);
    expect(accountBalance(good, 'CREATOR_BALANCE')).toBe(17_000);
    expect(accountBalance(good, 'PLATFORM_REVENUE')).toBe(5_000);
    expect(accountBalance(good, 'BRAND_CHARGE')).toBe(-22_000);
  });
});
