// pages/_app.js
import { AuthProvider } from '../contexts/AuthContext';
import { SaleProvider } from '../contexts/SaleContext';
import { NotificationProvider } from '../contexts/NotificationContext';
import '../styles/globals.css';

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <SaleProvider>
        <NotificationProvider>
          <Component {...pageProps} />
        </NotificationProvider>
      </SaleProvider>
    </AuthProvider>
  );
}

export default MyApp;