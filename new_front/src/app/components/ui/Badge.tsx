import { HTMLAttributes } from 'react';

type Severity = 'low' | 'medium' | 'high' | 'critical';
type BadgeVariant = Severity | 'default' | 'success' | 'info';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: React.ReactNode;
}

export function Badge({ variant = 'default', children, className = '', ...props }: BadgeProps) {
  const variants: Record<BadgeVariant, string> = {
    default: 'bg-muted text-foreground',
    success: 'bg-severity-low/10 text-severity-low border-severity-low/20',
    info: 'bg-primary/10 text-primary border-primary/20',
    low: 'bg-severity-low/10 text-severity-low border-severity-low/20',
    medium: 'bg-severity-medium/10 text-severity-medium border-severity-medium/20',
    high: 'bg-severity-high/10 text-severity-high border-severity-high/20',
    critical: 'bg-severity-critical/10 text-severity-critical border-severity-critical/20',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs border ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
