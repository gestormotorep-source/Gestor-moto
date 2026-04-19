import { AuthProvider } from '../contexts/AuthContext';
import { SaleProvider } from '../contexts/SaleContext';
import { NotificationProvider } from '../contexts/NotificationContext';
import { AppCacheProvider } from '../contexts/AppCacheContext';
import '../styles/globals.css';

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <SaleProvider>
        <NotificationProvider>
          <AppCacheProvider>
            <Component {...pageProps} />
          </AppCacheProvider>
        </NotificationProvider>
      </SaleProvider>
    </AuthProvider>
  );
}

export default MyApp;