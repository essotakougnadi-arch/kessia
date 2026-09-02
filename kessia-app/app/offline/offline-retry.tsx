'use client';

import { useEffect, useState } from 'react';

export function OfflineRetry() {
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const back = () => window.location.reload();
    window.addEventListener('online', back);
    return () => window.removeEventListener('online', back);
  }, []);

  return (
    <button
      type="button"
      className="btn btn-primary"
      style={{ marginTop: 8 }}
      disabled={checking}
      onClick={() => {
        setChecking(true);
        window.location.reload();
      }}
    >
      {checking ? '…' : 'Réessayer'}
    </button>
  );
}
