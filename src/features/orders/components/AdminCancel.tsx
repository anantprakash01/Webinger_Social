/** FR-37: an admin cancels an accepted order (creator unresponsive, fraud, etc.) with a full refund. */
import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LuBan } from 'react-icons/lu';
import { api, newIdempotencyKey } from '@/api/client';
import { toast, useConfirm } from '@/components/feedback';
import { Button } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import type { OrderDetail } from '@/types';

export function AdminCancel({ o }: { o: OrderDetail }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const key = useRef<string | null>(null);
  const cancel = useMutation({
    mutationFn: (reason: string) => api.admin.cancelOrder(o.id, reason, (key.current ??= newIdempotencyKey())),
    onSuccess: (r) => {
      key.current = null;
      void qc.invalidateQueries();
      toast(`Order cancelled. ${formatMoney(r.refundedCents, o.money.currency)} refunded to the brand.`);
    },
  });
  return (
    <>
      <Button
        variant="ghost"
        loading={cancel.isPending}
        onClick={async () => {
          const reason = await confirm.ask({
            title: 'Cancel this order and refund the brand?',
            body: `${formatMoney(o.money.totalCents, o.money.currency)} goes back to ${o.payment.methodLabel}. The creator is not paid. Both sides are notified, and this is recorded in the audit log.`,
            confirmLabel: 'Cancel and refund',
            reasonLabel: 'Reason (shown to both sides)',
            reasonMin: 10,
          });
          if (reason) cancel.mutate(reason);
        }}
      >
        <LuBan aria-hidden /> Cancel and refund
      </Button>
      {cancel.error && <span className="small" role="alert">{cancel.error.message}</span>}
      {confirm.dialog}
    </>
  );
}
