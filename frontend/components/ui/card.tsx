import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

// Institutional-Blue dark panel (see .panel in globals.css).
export function Card({ children, className = '' }: CardProps) {
  return <div className={`panel ${className}`}>{children}</div>;
}

export function CardHeader({ children, className = '' }: CardProps) {
  return (
    <div className={`px-5 py-4 ${className}`} style={{ borderBottom: '1px solid var(--border-soft)' }}>
      {children}
    </div>
  );
}

export function CardContent({ children, className = '' }: CardProps) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}
