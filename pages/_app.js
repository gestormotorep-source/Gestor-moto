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