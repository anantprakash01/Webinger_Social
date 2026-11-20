import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';
import { LuCheck, LuEye, LuEyeOff } from 'react-icons/lu';
import { Input, cx } from '@/components/ui';
import { PASSWORD_RULES } from '../schemas';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string;
  error?: string;
  /** Show the live rule checklist (new passwords only). */
  rulesFor?: string;
};

/** Password input with show/hide toggle and, for new passwords, the live rule list. */
export const PasswordField = forwardRef<HTMLInputElement, Props>(function PasswordField({ label, error, rulesFor, ...rest }, ref) {
  const [show, setShow] = useState(false);
  const rulesId = useId();
  return (
    <>
      <div className="pw">
        <Input
          ref={ref}
          label={label}
          type={show ? 'text' : 'password'}
          error={error}
          aria-describedby={rulesFor !== undefined ? rulesId : undefined}
          style={{ paddingRight: 44, width: '100%' }}
          {...rest}
        />
        {!error && (
          <button type="button" className="pw__toggle" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
            {show ? <LuEyeOff size={18} /> : <LuEye size={18} />}
          </button>
        )}
      </div>
      {rulesFor !== undefined && (
        <ul id={rulesId} className="pw-rules">
          {PASSWORD_RULES.map((r) => {
            const met = r.test(rulesFor);
            return (
              <li key={r.id} className={cx(met && 'is-met')}>
                <LuCheck aria-hidden /> {r.text}
                <span className="sr-only">{met ? ' (done)' : ' (not yet)'}</span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
});
