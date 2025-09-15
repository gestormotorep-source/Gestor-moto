import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import NotificationDropdown from './NotificationDropdown';
import {
  HomeIcon,
  CubeIcon,
  ArrowRightOnRectangleIcon,
  ArrowLeftOnRectangleIcon,
  Bars3Icon,
  UsersIcon,
  BuildingStorefrontIcon,
  DocumentTextIcon,
  BanknotesIcon,
  ChartBarIcon,
  UserGroupIcon,
  CreditCardIcon,
  ClipboardDocumentListIcon,
  PrinterIcon,
  Cog6ToothIcon,
  ChevronDownIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';

const Sidebar = ({ isOpen, toggleSidebar }) => {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [openSubmenu, setOpenSubmenu] = useState(null);

  const isAdmin = user?.email === 'admin@gmail.com';

  // Bloquear el scroll del body cuando el sidebar está abierto en mobile
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [isOpen]);

  const handleLogout = async () => {
    await logout();
    router.push('/auth');
  };

  const toggleSubmenu = (submenu) => {
    setOpenSubmenu(openSubmenu === submenu ? null : submenu);
  };

  const navigateTo = (path) => {
    router.push(path);
    // Cerrar sidebar después de navegar
    if (isOpen) {
      toggleSidebar();
    }
  };

  // Definición de todos los elementos del menú en un solo lugar
  const menuItems = [
    {
      name: 'Productos',
      icon: CubeIcon,
      adminOnly: false,
      submenu: [
        { name: 'Productos', path: '/productos' },
        { name: 'Faltos', path: '/productos/faltos' }
      ]
    },
    {
      name: 'Ingresos',
      icon: ClipboardDocumentListIcon,
      adminOnly: true,
      submenu: [
        { name: 'Ingresos', path: '/inventario/ingresos' },
        { name: 'Lotes', path: '/inventario/stock' }
      ]
    },
    {
      name: 'Cotizaciones',
      icon: DocumentTextIcon,
      adminOnly: false,
      path: '/cotizaciones'
    },
    {
      name: 'Ventas',
      icon: BanknotesIcon,
      adminOnly: false,
      path: '/ventas' 
    },
    {
      name: 'Devoluciones',
      icon: BanknotesIcon,
      adminOnly: false,
      path: '/devoluciones' 
    },
    {
      name: 'Clientes',
      icon: UsersIcon,
      adminOnly: false,
      path: '/clientes' 
    },
    {
      name: 'Proveedores',
      icon: BuildingStorefrontIcon,
      adminOnly: false,
      path: '/proveedores'
    },
    {
      name: 'Créditos',
      icon: CreditCardIcon,
      adminOnly: false,
      path: '/creditos/activos'
    },
    {
      name: 'Empleados',
      icon: UserGroupIcon,
      adminOnly: false,
      path: '/empleados'
    },
    {
      name: 'Caja',
      icon: ChartBarIcon,
      adminOnly: true,
      path: '/caja'
    }
  ];

  return (
    <>
      {/* Overlay: aparece cuando el sidebar está abierto */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 touch-none"
          onClick={toggleSidebar}
          style={{ 
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
            KhtmlUserSelect: 'none',
            MozUserSelect: 'none',
            MsUserSelect: 'none',
            userSelect: 'none'
          }}
        />
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed inset-y-0 left-0
        z-50
        w-64 
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        touch-none
      `}
      style={{ 
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        KhtmlUserSelect: 'none',
        MozUserSelect: 'none',
        MsUserSelect: 'none',
        userSelect: 'none'
      }}>
        
        {/* Sidebar Content - Flex container que ocupa toda la altura */}
        <div className="flex flex-col h-full bg-gray-900 text-white">
          
          {/* Header - Fixed height */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-gray-700 flex-shrink-0">
            <h1 className="text-xl font-bold text-blue-400">GestorMoto</h1>
            
            {/* Contenedor para notificaciones y botón cerrar */}
            <div className="flex items-center space-x-2">
              {/* Componente de notificaciones - solo visible para admin */}
              {isAdmin && <NotificationDropdown />}
              
              {/* Botón para cerrar el sidebar */}
              <button
                onClick={toggleSidebar}
                className="p-2 rounded-md hover:bg-gray-800 touch-manipulation"
                title="Cerrar Menú"
              >
                <ArrowLeftOnRectangleIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* User Info - Fixed height */}
          <div className="p-4 border-b border-gray-700 flex-shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium">
                  {user?.displayName ? user.displayName.charAt(0).toUpperCase() : user?.email.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium">{user?.displayName || 'Usuario'}</p>
                <p className="text-xs text-gray-400">{isAdmin ? 'Administrador' : 'Empleado'}</p>
              </div>
            </div>
          </div>

          {/* Navigation - Scrollable area */}
          <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto overflow-x-hidden min-h-0 overscroll-contain">
            <div className="space-y-2">
              {menuItems.map((item) => {
                if (item.adminOnly && !isAdmin) return null;

                return (
                  <div key={item.name}>
                    {item.submenu ? (
                      <div>
                        <button
                          onClick={() => toggleSubmenu(item.name)}
                          className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md hover:bg-gray-800 transition-colors touch-manipulation"
                        >
                          <div className="flex items-center space-x-3">
                            <item.icon className="h-5 w-5 flex-shrink-0" />
                            <span>{item.name}</span>
                          </div>
                          {openSubmenu === item.name ? (
                            <ChevronDownIcon className="h-4 w-4 flex-shrink-0" />
                          ) : (
                            <ChevronRightIcon className="h-4 w-4 flex-shrink-0" />
                          )}
                        </button>

                        <div className={`mt-2 ml-8 space-y-1 overflow-hidden transition-all duration-200 ${openSubmenu === item.name ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                          {item.submenu.map((subItem) => {
                            if (subItem.adminOnly && !isAdmin) return null;

                            return (
                              <button
                                key={subItem.name}
                                onClick={() => navigateTo(subItem.path)}
                                className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-md transition-colors touch-manipulation"
                              >
                                {subItem.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => navigateTo(item.path)}
                        className="w-full flex items-center space-x-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-gray-800 transition-colors touch-manipulation"
                      >
                        <item.icon className="h-5 w-5 flex-shrink-0" />
                        <span>{item.name}</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </nav>

          {/* Logout - Fixed at bottom */}
          <div className="p-4 border-t border-gray-700 flex-shrink-0">
            <button
              onClick={handleLogout}
              className="w-full flex items-center space-x-3 px-3 py-2 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-gray-800 rounded-md transition-colors touch-manipulation"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5 flex-shrink-0" />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;