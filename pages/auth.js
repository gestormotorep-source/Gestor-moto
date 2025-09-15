// pages/auth.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import LoginForm from '../components/LoginForm';
import RegisterForm from '../components/RegisterForm';
import { useAuth } from '../contexts/AuthContext';

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.push('/productos');
    }
  }, [user, router]);

  const toggleForm = () => {
    setIsLogin(!isLogin);
  };

  if (user) {
    return <div>Redirigiendo...</div>;
  }

  return (
    <>
      {isLogin ? (
        <LoginForm onToggleForm={toggleForm} />
      ) : (
        <RegisterForm onToggleForm={toggleForm} />
      )}
    </>
  );
};

export default AuthPage;