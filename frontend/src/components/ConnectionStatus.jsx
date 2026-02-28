import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

function ConnectionStatus({ isConnected, isReconnecting }) {
  if (isConnected) {
    return (
      <div className="flex items-center gap-2 text-emerald-700 text-sm">
        <Wifi size={16} />
        <span>Conectado</span>
      </div>
    );
  }

  if (isReconnecting) {
    return (
      <div className="flex items-center gap-2 text-warning text-sm">
        <RefreshCw size={16} className="animate-spin" />
        <span>Reconectando...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-error text-sm">
      <WifiOff size={16} />
      <span>Sin conexion</span>
    </div>
  );
}

export default ConnectionStatus;
