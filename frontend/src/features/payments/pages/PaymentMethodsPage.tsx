/**
 * /brand/payment-methods — saved cards (RBI-compliant Razorpay tokens) and UPI IDs (v2.0, India).
 * Methods are saved by ticking "save for next time" at checkout; here they can be reviewed and removed.
 */
import { LuCreditCard, LuSmartphone, LuTrash2 } from 'react-icons/lu';
import { useConfirm } from '@/components/feedback';
import { Button, Card, EmptyState, ErrorState, PageHeader, PageSkeleton } from '@/components/ui';
import { useRemoveSavedMethod, useSavedMethods } from '../hooks';

export function PaymentMethodsPage() {
  const { data, isPending, isError, error, refetch } = useSavedMethods();
  const remove = useRemoveSavedMethod();
  const confirm = useConfirm();
  if (isPending) return <PageSkeleton />;
  if (isError) return <div className="page"><ErrorState message={error.message} onRetry={() => void refetch()} /></div>;

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <PageHeader title="Payment methods" />
      <p className="small muted">
        Pay for orders by UPI, debit or credit card, netbanking or a wallet app (Paytm, PhonePe, Amazon Pay, MobiKwik). Payments are processed by Razorpay and held until the
        creator accepts.
      </p>
      <Card title="Saved for faster checkout">
        {data.content.length === 0 ? (
          <EmptyState title="Nothing saved">Tick “save for next time” when you pay by card or UPI.</EmptyState>
        ) : (
          <ul className="list">
            {data.content.map((m) => (
              <li key={m.id} className="list__item">
                <span className="wallet-txn__icon" aria-hidden>
                  {m.type === 'CARD' ? <LuCreditCard /> : <LuSmartphone />}
                </span>
                <div className="list__main">
                  <div className="list__title">{m.label}</div>
                  <div className="list__meta">{m.type === 'CARD' ? `Expires ${m.expiry} · saved as a secure token, not the card number` : 'UPI ID'}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon
                  aria-label={`Remove ${m.label}`}
                  onClick={async () => {
                    if (await confirm.ask({ title: `Remove ${m.label}?`, body: 'You can save it again the next time you pay.', confirmLabel: 'Remove' })) remove.mutate(m.id);
                  }}
                >
                  <LuTrash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {confirm.dialog}
    </div>
  );
}
