import { InputHTMLAttributes, forwardRef } from 'react';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className = '', ...props }, ref) => {
    return (
      <label className="flex items-start gap-2 cursor-pointer group">
        <div className="relative mt-0.5 shrink-0">
          <input
            ref={ref}
            type="checkbox"
            className="peer sr-only"
            {...props}
          />
          <div className="w-5 h-5 border-2 border-border rounded bg-input-background peer-checked:bg-primary peer-checked:border-primary transition-all duration-200 flex items-center justify-center">
            <Check className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
          </div>
        </div>
        {label && (
          <span className="text-sm text-foreground group-hover:text-foreground/80">
            {label}
          </span>
        )}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
