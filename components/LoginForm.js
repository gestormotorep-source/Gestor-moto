import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'next/router';
import { Eye, EyeOff, Mail, Lock, Zap } from 'lucide-react';

const LoginForm = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async () => {
    if (loading) return;
    
    setError('');
    setLoading(true);

    if (!email || !password) {
      setError('Por favor completa todos los campos');
      setLoading(false);
      return;
    }

    try {
      const result = await login(email, password);
      
      if (result.success) {
        router.push('/productos');
      } else {
        setError(result.error || 'Credenciales incorrectas');
      }
    } catch (err) {
      console.error('Error en login:', err);
      setError('Error al iniciar sesión. Verifica tus credenciales.');
    }
    
    setLoading(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      
      {/* Motorcycle themed background elements */}
      <div className="absolute inset-0">
        {/* Tire tracks */}
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-transparent via-gray-600 to-transparent opacity-30"></div>
        <div className="absolute bottom-0 left-0 w-full h-2 bg-gradient-to-r from-transparent via-gray-600 to-transparent opacity-30"></div>
        
        {/* Engine-like shapes */}
        <div className="absolute top-20 right-20 w-32 h-32 border-2 border-orange-500/20 transform rotate-45 rounded-lg"></div>
        <div className="absolute bottom-20 left-20 w-24 h-24 border-2 border-red-500/20 transform rotate-12 rounded-full"></div>
        <div className="absolute top-1/2 right-10 w-16 h-16 bg-gradient-to-br from-orange-500/10 to-red-500/10 transform -rotate-12 rounded-lg"></div>
      </div>

      <div className="max-w-md w-full space-y-8 relative z-10">
        
        {/* Main card */}
        <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-xl p-8 shadow-2xl">
          
          {/* Header */}
          <div className="text-center mb-8">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-orange-600 to-red-600 rounded-xl flex items-center justify-center mb-6 shadow-lg transform rotate-3">
              <Zap className="w-8 h-8 text-white transform -rotate-3" />
            </div>
            <h2 className="text-3xl font-bold text-white">
              GestorMotoRep
            </h2>
            <p className="mt-2 text-gray-400">
              Gestión de repuestos y accesorios
            </p>
          </div>
          
          <div className="space-y-6">
            
            {/* Email */}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-gray-300">
                Correo electrónico
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-500" />
                </div>
                <input
                  id="email"
                  type="email"
                  className="block w-full pl-10 pr-3 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyPress={handleKeyPress}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-gray-300">
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-500" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="block w-full pl-10 pr-10 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200"
                  placeholder="Tu contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={handleKeyPress}
                />
                <div
                  className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-500 hover:text-gray-400 transition-colors" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-500 hover:text-gray-400 transition-colors" />
                  )}
                </div>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="bg-red-900/30 border border-red-600/50 text-red-300 px-4 py-3 rounded-lg">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span className="text-sm">{error}</span>
                </div>
              </div>
            )}

            {/* Submit button */}
            <div
              onClick={handleSubmit}
              className={`group relative w-full flex justify-center items-center py-3 px-4 text-sm font-medium rounded-lg text-white bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 transition-all duration-200 shadow-lg cursor-pointer ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-xl transform hover:-translate-y-0.5'}`}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Iniciando sesión...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5 mr-2 group-hover:rotate-12 transition-transform duration-200" />
                  Iniciar Sesión
                </>
              )}
            </div>

            
          </div>
        </div>

      </div>

      {/* Decorative text */}
      <div className="absolute bottom-10 right-10 text-gray-700 text-6xl font-bold opacity-10 select-none transform rotate-12">
        MOTO
      </div>
      <div className="absolute top-10 left-10 text-gray-700 text-4xl font-bold opacity-10 select-none transform -rotate-12">
        PARTS
      </div>
    </div>
  );
};

export default LoginForm;