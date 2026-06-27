import Head from 'next/head';
import { AuthProvider } from '../contexts/AuthContext';
import { SaleProvider } from '../contexts/SaleContext';
import { NotificationProvider } from '../contexts/NotificationContext';
import { AppCacheProvider } from '../contexts/AppCacheContext';
import { SucursalProvider } from '../contexts/SucursalContext';
import SucursalSelectorModal from '../components/SucursalSelectorModal';
import '../styles/globals.css';

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <SucursalProvider>
        <SaleProvider>
          <NotificationProvider>
            <AppCacheProvider>
              <Head>
                <title>GestorMoto</title>
                <link rel="icon" type="image/png" href="/logo2.png" />
              </Head>
              <SucursalSelectorModal />
              <Component {...pageProps} />
            </AppCacheProvider>
          </NotificationProvider>
        </SaleProvider>
      </SucursalProvider>
    </AuthProvider>
  );
}

export default MyApp;