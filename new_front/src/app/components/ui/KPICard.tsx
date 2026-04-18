import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardBody } from './Card';

interface KPICardProps {
  title: string;
  value: string;
  change?: number;
  icon: LucideIcon;
  color?: string;
  loading?: boolean;
}

export function KPICard({ title, value, change, icon: Icon, color = 'bg-primary', loading }: KPICardProps) {
  if (loading) {
    return (
      <Card>
        <CardBody>
          <div className="animate-pulse">
            <div className="h-4 bg-muted rounded w-1/2 mb-3"></div>
            <div className="h-8 bg-muted rounded w-3/4"></div>
          </div>
        </CardBody>
      </Card>
    );
  }

  const isPositive = change !== undefined && change >= 0;
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;

  return (
    <Card className="hover:shadow-md transition-shadow duration-200">
      <CardBody>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            <p className="text-2xl text-foreground mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
              {value}
            </p>
            {change !== undefined && (
              <div className={`flex items-center gap-1 text-sm ${isPositive ? 'text-severity-low' : 'text-destructive'}`}>
                <TrendIcon className="w-4 h-4" />
                <span>{Math.abs(change)}%</span>
              </div>
            )}
          </div>
          <div className={`w-12 h-12 rounded-lg ${color} flex items-center justify-center`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
