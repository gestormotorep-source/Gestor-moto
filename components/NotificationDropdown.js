// components/NotificationDropdown.js
import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNotifications } from '../contexts/NotificationContext';
import { useRouter } from 'next/router';
import {
  BellIcon,
  XMarkIcon,
  CheckIcon,
  GiftIcon,
  ExclamationTriangleIcon,
  CubeIcon
} from '@heroicons/react/24/outline';

// Config visual por tipo de notificación: color de acento, ícono y fondo del ícono.
// Centralizado acá para no repetir lógica condicional en el JSX.
const TYPE_CONFIG = {
  birthday_today: {
    icon: GiftIcon,
    accent: 'border-l-pink-500',
    iconBg: 'bg-pink-50',
    iconColor: 'text-pink-600',
    dot: 'bg-pink-500',
  },
  birthday_tomorrow: {
    icon: GiftIcon,
    accent: 'border-l-pink-300',
    iconBg: 'bg-pink-50',
    iconColor: 'text-pink-500',
    dot: 'bg-pink-400',
  },
  low_stock: {
    icon: CubeIcon,
    accent: 'border-l-amber-500',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    dot: 'bg-amber-500',
  },
  default: {
    icon: BellIcon,
    accent: 'border-l-blue-500',
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    dot: 'bg-blue-500',
  },
};

const getTypeConfig = (type) => TYPE_CONFIG[type] || TYPE_CONFIG.default;

const formatNotificationTime = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMinutes = Math.floor((now - date) / (1000 * 60));

  if (diffInMinutes < 1) return 'ahora';
  if (diffInMinutes < 60) return `hace ${diffInMinutes} min`;
  if (diffInMinutes < 1440) return `hace ${Math.floor(diffInMinutes / 60)} h`;
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};

const NotificationRow = ({ notification, onSelect, onRemove }) => {
  const config = getTypeConfig(notification.type);
  const Icon = config.icon;
  const isCritical = notification.priority === 'high';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(notification)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(notification); }}
      className={`group relative flex gap-3 px-4 py-3 cursor-pointer border-l-[3px] transition-colors
        ${notification.read ? 'border-l-transparent hover:bg-gray-50' : `${config.accent} bg-gray-50/60 hover:bg-gray-100`}
        focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500`}
    >
      <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${config.iconBg}`}>
        <Icon className={`h-4 w-4 ${config.iconColor}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-[13px] leading-snug ${notification.read ? 'text-gray-600' : 'text-gray-900 font-medium'}`}>
            {notification.message}
          </p>
          {!notification.read && (
            <span className={`mt-1 h-1.5 w-1.5 rounded-full flex-shrink-0 ${config.dot}`} aria-hidden="true" />
          )}
        </div>

        {notification.codigoInfo && notification.codigoInfo.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {notification.codigoInfo.map((codigo, i) => (
              <span key={i} className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                {codigo}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[11px] text-gray-400">{formatNotificationTime(notification.date)}</span>
          {isCritical && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600">Urgente</span>
          )}
        </div>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onRemove(notification.id); }}
        className="absolute top-2.5 right-2.5 h-6 w-6 flex items-center justify-center rounded-md text-gray-300 hover:text-gray-600 hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
        title="Descartar"
        aria-label="Descartar notificación"
      >
        <XMarkIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

const NotificationDropdown = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // all | stock | birthday
  const [mounted, setMounted] = useState(false);
  const [panelStyle, setPanelStyle] = useState(null);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    removeNotification
  } = useNotifications();

  // El portal necesita 'document', que no existe en el render de servidor (SSR).
  // Marcamos mounted=true recién en el cliente para evitar mismatch de hidratación.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Calcula la posición del panel en base a la ubicación real del botón
  // de campana, para que el dropdown aparezca "colgando" justo debajo de
  // él (como un dropdown normal) en vez de fijo en una esquina arbitraria.
  useEffect(() => {
    if (!isOpen) return;

    const PANEL_WIDTH = 352; // 22rem
    const MARGIN = 12;

    const updatePosition = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const isMobile = viewportWidth < 640; // breakpoint sm de Tailwind

      if (isMobile) {
        setPanelStyle({
          top: rect.bottom + 8,
          left: 12,
          right: 12,
          width: 'auto',
        });
        return;
      }

      // En desktop: anclado debajo del botón, pero sin desbordar la pantalla
      let left = rect.left;
      if (left + PANEL_WIDTH + MARGIN > viewportWidth) {
        left = viewportWidth - PANEL_WIDTH - MARGIN;
      }
      if (left < MARGIN) left = MARGIN;

      setPanelStyle({
        top: rect.bottom + 8,
        left,
        width: PANEL_WIDTH,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const clickedButton = containerRef.current && containerRef.current.contains(event.target);
      const clickedPanel = panelRef.current && panelRef.current.contains(event.target);
      if (!clickedButton && !clickedPanel) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const stockCount = useMemo(() => notifications.filter(n => n.type === 'low_stock').length, [notifications]);
  const birthdayCount = useMemo(
    () => notifications.filter(n => n.type === 'birthday_today' || n.type === 'birthday_tomorrow').length,
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'stock') return notifications.filter(n => n.type === 'low_stock');
    if (activeTab === 'birthday') return notifications.filter(n => n.type === 'birthday_today' || n.type === 'birthday_tomorrow');
    return notifications;
  }, [notifications, activeTab]);

  const handleSelect = (notification) => {
    markAsRead(notification.id);
    if (notification.type.startsWith('birthday') && notification.clienteId) {
      router.push(`/clientes/${notification.clienteId}`);
    } else if (notification.type === 'low_stock' && notification.productoId) {
      router.push(`/productos/${notification.productoId}`);
    }
    setIsOpen(false);
  };

  const tabs = [
    { id: 'all', label: 'Todas', count: notifications.length },
    { id: 'stock', label: 'Stock', count: stockCount },
    { id: 'birthday', label: 'Cumpleaños', count: birthdayCount },
  ];

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        title="Notificaciones"
        aria-expanded={isOpen}
      >
        <BellIcon className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] leading-none rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center font-semibold ring-2 ring-gray-900">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* El panel se renderiza vía portal directamente en document.body.
          Esto es necesario porque el Sidebar tiene `transform` (para la animación
          de apertura/cierre con translate-x), y cualquier ancestro con transform
          se convierte en el contenedor de referencia para los hijos `fixed`.
          Sin el portal, este panel quedaría "atrapado" dentro del ancho del
          sidebar (256px) en vez de posicionarse respecto al viewport completo.
          La posición (panelStyle) se calcula a partir de la ubicación real del
          botón de campana, para que el panel "cuelgue" de él como un dropdown
          normal en vez de aparecer fijo en una esquina de la pantalla. */}
      {isOpen && mounted && panelStyle && createPortal(
        <>
          {/* Backdrop transparente para capturar clicks fuera del panel en cualquier tamaño de pantalla */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          {/* Panel: posicionado dinámicamente debajo del botón que lo abrió. */}
          <div
            ref={panelRef}
            className="fixed z-50 max-h-[75vh]
                       bg-white rounded-xl shadow-2xl border border-gray-200
                       flex flex-col overflow-hidden"
            style={{
              top: panelStyle.top,
              left: panelStyle.left,
              right: panelStyle.right,
              width: panelStyle.width,
            }}
            role="dialog"
            aria-label="Notificaciones"
          >

            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-2 pb-3 sm:pt-3.5 border-b border-gray-100">
              <h3 className="text-[15px] font-semibold text-gray-900">Notificaciones</h3>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    <CheckIcon className="h-3.5 w-3.5" />
                    Marcar leídas
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600 -mr-1"
                  aria-label="Cerrar"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Tabs de filtro — solo si hay algo que filtrar */}
            {notifications.length > 0 && (
              <div className="flex gap-1 px-3 pt-2.5 border-b border-gray-100">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-t-md transition-colors border-b-2 -mb-px
                      ${activeTab === tab.id
                        ? 'text-gray-900 border-blue-500'
                        : 'text-gray-400 border-transparent hover:text-gray-600'}`}
                  >
                    {tab.label}
                    {tab.count > 0 && (
                      <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                        activeTab === tab.id ? 'bg-gray-100 text-gray-700' : 'bg-gray-50 text-gray-400'
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {loading ? (
                <div className="flex justify-center items-center py-12">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-200 border-t-blue-500" />
                </div>
              ) : filteredNotifications.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <div className="h-10 w-10 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3">
                    <BellIcon className="h-5 w-5 text-gray-300" />
                  </div>
                  <p className="text-sm text-gray-500">
                    {activeTab === 'all' ? 'Sin notificaciones por ahora' : 'Nada en esta categoría'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {filteredNotifications.slice(0, 20).map((notification) => (
                    <NotificationRow
                      key={notification.id}
                      notification={notification}
                      onSelect={handleSelect}
                      onRemove={removeNotification}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {filteredNotifications.length > 20 && (
              <div className="px-4 py-2.5 border-t border-gray-100 text-center">
                <p className="text-[11px] text-gray-400">Mostrando 20 de {filteredNotifications.length}</p>
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
};

export default NotificationDropdown;