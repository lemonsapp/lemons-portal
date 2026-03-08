// client/src/components/PWAManager.jsx
// Componente global: banner de instalación, indicador offline, toast de actualización

import { usePWA } from '../hooks/usePWA';
import { useState } from 'react';

export default function PWAManager() {
  const { canInstall, isOnline, updateAvailable, promptInstall, applyUpdate } = usePWA();
  const [installDismissed, setInstallDismissed] = useState(false);

  return (
    <>
      {/* ── Banner offline ───────────────────────────────────────── */}
      {!isOnline && (
        <div style={styles.offlineBanner}>
          <span style={styles.offlineDot} />
          Sin conexión — mostrando datos guardados
        </div>
      )}

      {/* ── Toast actualización disponible ───────────────────────── */}
      {updateAvailable && (
        <div style={styles.updateToast}>
          <span>🆕 Nueva versión disponible</span>
          <button style={styles.updateBtn} onClick={applyUpdate}>
            Actualizar
          </button>
        </div>
      )}

      {/* ── Banner instalar PWA ───────────────────────────────────── */}
      {canInstall && !installDismissed && (
        <div style={styles.installBanner}>
          <div style={styles.installLeft}>
            <img src="/icons/icon.svg" alt="Lemons" style={styles.installIcon} />
            <div>
              <div style={styles.installTitle}>Instalar Lemons Portal</div>
              <div style={styles.installSub}>Acceso rápido desde tu pantalla de inicio</div>
            </div>
          </div>
          <div style={styles.installActions}>
            <button style={styles.installBtn} onClick={promptInstall}>
              Instalar
            </button>
            <button style={styles.dismissBtn} onClick={() => setInstallDismissed(true)}>
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const styles = {
  offlineBanner: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    background: '#e67e22',
    color: '#fff',
    textAlign: 'center',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  offlineDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#fff',
    display: 'inline-block',
  },
  updateToast: {
    position: 'fixed',
    bottom: 80,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 9998,
    background: '#0f1b2d',
    border: '1px solid #f5e642',
    color: '#fff',
    borderRadius: 12,
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
    fontSize: 14,
    whiteSpace: 'nowrap',
  },
  updateBtn: {
    background: '#f5e642',
    color: '#0f1b2d',
    border: 'none',
    borderRadius: 8,
    padding: '6px 16px',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
  },
  installBanner: {
    position: 'fixed',
    bottom: 16,
    left: 16,
    right: 16,
    zIndex: 9997,
    background: '#0f1b2d',
    border: '1px solid rgba(245, 230, 66, 0.3)',
    borderRadius: 16,
    padding: '14px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    gap: 12,
  },
  installLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  installIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  installTitle: {
    color: '#f5e642',
    fontWeight: 700,
    fontSize: 14,
    marginBottom: 2,
  },
  installSub: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  installActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  installBtn: {
    background: '#f5e642',
    color: '#0f1b2d',
    border: 'none',
    borderRadius: 8,
    padding: '8px 18px',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
  },
  dismissBtn: {
    background: 'transparent',
    color: 'rgba(255,255,255,0.4)',
    border: 'none',
    fontSize: 16,
    cursor: 'pointer',
    padding: '4px 8px',
  },
};
