import type { ReactNode } from 'react';

import './rack.css';

export type RackProps = {
  ariaLabel?: string;
  children: ReactNode;
};

export function Rack({ ariaLabel = 'StringSight module rack', children }: RackProps) {
  return (
    <div aria-label={ariaLabel} className="ss-rack" role="group">
      <div aria-hidden="true" className="ss-rack-rail ss-rack-rail--left" />
      <div aria-hidden="true" className="ss-rack-rail ss-rack-rail--right" />
      <div className="ss-rack-stack">{children}</div>
    </div>
  );
}
