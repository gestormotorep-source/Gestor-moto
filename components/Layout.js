// components/Layout.js
import { useState } from 'react';
import Sidebar from './Sidebar';
import { Bars3Icon } from '@heroicons/react/24/outline';
import Head from 'next/head';

const Layout = ({ children, title = 'GestorMoto' }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>

      <div className="flex min-h-screen bg-gray-100">
        {/* Sidebar */}
        <Sidebar isOpen={sidebarOpen} toggleSidebar={toggleSidebar} />

        {/* Contenido principal: Siempre sin margen izquierdo, ya que el sidebar se superpone */}
        <div className={`flex flex-col flex-1 overflow-hidden transition-all duration-300 ease-in-out
                         ml-0 /* Siempre ml-0 */
        `}>
          {/* Header principal */}
          <header className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm z-30">
            {/* Botón para abrir el sidebar (siempre visible) */}
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-red-500"
              title="Abrir Menú"
            >
              <Bars3Icon className="h-6 w-6" />
            </button>

            <h2 className="text-xl font-semibold text-gray-800 flex-grow text-center">{title.split(' - ')[0]}</h2>

            {/* Este div spacer ya no es necesario si el botón de abrir siempre está a la izquierda */}
            <div className="w-10 h-6"></div> {/* Mantener un spacer si deseas centrar el título mejor */}
          </header>

          {/* Contenedor principal del contenido, con padding */}
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </>
  );
};

export default Layout;