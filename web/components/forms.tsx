"use client";

import { useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Alert, Check, Eye, EyeOff, Minus } from "./icons";
import { btn, cx } from "./ui";
import { passwordChecks, passwordStrength } from "@/lib/validation";

export const inputBase =
  "block w-full rounded-xl border bg-surface px-3.5 text-[15px] text-ink placeholder:text-faint transition-[border-color,box-shadow] duration-150 focus:outline-none focus:ring-4";

function inputState(error?: string) {
  return error
    ? "border-danger focus:border-danger focus:ring-danger/15"
    : "border-edge-strong hover:border-ink/25 focus:border-brand focus:ring-brand/15";
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  aside,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  htmlFor: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="flex items-center gap-1.5 text-[13px] text-danger" role="alert">
          <Alert size={14} /> {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({
  label,
  hint,
  error,
  aside,
  className,
  ...props
}: ComponentProps<"input"> & { label: string; hint?: ReactNode; error?: string; aside?: ReactNode }) {
  const auto = useId();
  const id = props.id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} aside={aside}>
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cx(inputBase, "h-12", inputState(error), className)}
        {...props}
      />
    </Field>
  );
}

export function TextArea({
  label,
  hint,
  error,
  className,
  ...props
}: ComponentProps<"textarea"> & { label: string; hint?: ReactNode; error?: string }) {
  const auto = useId();
  const id = props.id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <textarea
        id={id}
        aria-invalid={!!error}
        className={cx(inputBase, "min-h-[120px] resize-y py-3 leading-relaxed", inputState(error), className)}
        {...props}
      />
    </Field>
  );
}

export function SelectInput({
  label,
  error,
  children,
  ...props
}: ComponentProps<"select"> & { label: string; error?: string }) {
  const auto = useId();
  const id = props.id ?? auto;
  return (
    <Field label={label} error={error} htmlFor={id}>
      <select id={id} className={cx(inputBase, "h-12 appearance-none bg-no-repeat pr-10", inputState(error))} {...props}>
        {children}
      </select>
    </Field>
  );
}

export function PasswordInput({
  label = "Password",
  error,
  showRules = false,
  aside,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { label?: string; error?: string; showRules?: boolean; aside?: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // React resets a form after its action runs; keep the strength meter in step.
  useEffect(() => {
    const form = input.current?.form;
    const clear = () => setValue("");
    form?.addEventListener("reset", clear);
    return () => form?.removeEventListener("reset", clear);
  }, []);
  const auto = useId();
  const id = props.id ?? auto;
  const strength = passwordStrength(value);
  const checks = passwordChecks(value);
  const labels = ["Too weak", "Weak", "Okay", "Good", "Strong"];
  const colors = ["bg-edge-strong", "bg-danger", "bg-accent", "bg-success", "bg-success"];

  return (
    <Field label={label} error={error} htmlFor={id} aside={aside}>
      <div className="relative">
        <input
          ref={input}
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={!!error}
          className={cx(inputBase, "h-12 pr-12", inputState(error))}
          onChange={(e) => setValue(e.target.value)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-muted transition-colors hover:text-ink"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {showRules && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <div className="grid flex-1 grid-cols-4 gap-1">
              {[1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className={cx(
                    "h-1.5 rounded-full transition-colors duration-300",
                    value && strength >= i ? colors[strength] : "bg-edge",
                  )}
                />
              ))}
            </div>
            <span className="w-16 text-right text-xs text-muted">{value ? labels[strength] : ""}</span>
          </div>
          <ul className="grid gap-1 sm:grid-cols-3">
            {checks.map((c) => (
              <li
                key={c.id}
                className={cx("flex items-center gap-1.5 text-xs transition-colors", c.ok ? "text-success-ink" : "text-muted")}
              >
                {c.ok ? <Check size={13} /> : <Minus size={13} />}
                {c.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Field>
  );
}

export function SubmitButton({
  children,
  pendingText,
  variant = "brand",
  size = "lg",
  className,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: Parameters<typeof btn>[0];
  size?: Parameters<typeof btn>[1];
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={btn(variant, size, className)}>
      {pending && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />
      )}
      {pending ? pendingText ?? "Working…" : children}
    </button>
  );
}

export function FormMessage({ error, ok }: { error?: string; ok?: string }) {
  return (
    <AnimatePresence initial={false}>
      {(error || ok) && (
        <motion.div
          key={error ?? ok}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          role={error ? "alert" : "status"}
          className={cx(
            "flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm",
            error ? "bg-danger-soft text-danger" : "bg-success-soft text-success-ink",
          )}
        >
          {error ? <Alert size={17} className="mt-px shrink-0" /> : <Check size={17} className="mt-px shrink-0" />}
          <span>{error ?? ok}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Checkbox({
  label,
  error,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { label: ReactNode; error?: string }) {
  const auto = useId();
  const id = props.id ?? auto;
  return (
    <div>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-sm text-muted">
        <input
          id={id}
          type="checkbox"
          className="peer mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer appearance-none rounded-[5px] border border-edge-strong bg-surface transition-colors checked:border-brand checked:bg-brand focus-visible:outline-2 focus-visible:outline-brand"
          {...props}
        />
        <Check
          size={13}
          strokeWidth={3}
          className="pointer-events-none -ml-[27px] mr-[9px] mt-[3px] text-white opacity-0 peer-checked:opacity-100"
        />
        <span>{label}</span>
      </label>
      {error && <p className="mt-1.5 text-[13px] text-danger">{error}</p>}
    </div>
  );
}
