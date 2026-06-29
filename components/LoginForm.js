import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'next/router';
import { Eye, EyeOff, Mail, Lock, ArrowRight } from 'lucide-react';

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
    <div className="min-h-screen flex bg-[#15171c]">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap');
        .font-display { font-family: 'Oswald', sans-serif; letter-spacing: 0.01em; }
        .font-mono-ticket { font-family: 'JetBrains Mono', monospace; }
        .font-body { font-family: 'Inter', sans-serif; }
      `}</style>

      {/* ───────────── Panel izquierdo: orden de acceso ───────────── */}
      <div className="font-body w-full lg:w-[46%] flex flex-col justify-center px-8 sm:px-16 py-12 bg-white relative">


        {/* logo chico solo en mobile */}
        <div className="lg:hidden flex items-center gap-3 mb-10 mt-8">
          <img src="/logo2.png" alt="GOYO MOTOR'S" className="h-20 w-auto" />
        </div>

        <div className="max-w-sm w-full mx-auto">

          <h1 className="font-display text-4xl font-semibold text-[#15171c] mb-2 uppercase">
            Inicia sesión
          </h1>


          <div className="space-y-5">

            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-[13px] font-semibold text-[#6b7280] uppercase tracking-wide">
                Correo electrónico
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-[#a8a193]" />
                </div>
                <input
                  id="email"
                  type="email"
                  className="block w-full pl-10 pr-3 py-3 bg-white border-2 border-[#e2dccd] rounded-md text-[#15171c] placeholder-[#bdb6a6] focus:outline-none focus:border-[#1f4fc4] focus:ring-2 focus:ring-[#1f4fc4]/15 transition-all duration-150"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyPress={handleKeyPress}
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-[13px] font-semibold text-[#15171c] uppercase tracking-wide">
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-[#a8a193]" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="block w-full pl-10 pr-10 py-3 bg-white border-2 border-[#e2dccd] rounded-md text-[#15171c] placeholder-[#bdb6a6] focus:outline-none focus:border-[#1f4fc4] focus:ring-2 focus:ring-[#1f4fc4]/15 transition-all duration-150"
                  placeholder="Tu contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={handleKeyPress}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#a8a193] hover:text-[#15171c] transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="bg-[#fbeae6] border-2 border-[#e8b3a6] text-[#9a3a26] px-4 py-3 rounded-md">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[#c4432f] rounded-full shrink-0" />
                  <span className="text-sm font-medium">{error}</span>
                </div>
              </div>
            )}

            {/* Submit button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className={`font-display group w-full flex justify-center items-center py-3.5 px-4 text-[15px] font-semibold uppercase tracking-wide rounded-md text-white bg-[#1f4fc4] hover:bg-[#1a41a3] transition-all duration-150 ${
                loading ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Iniciando sesión...
                </>
              ) : (
                <>
                  Iniciar sesión
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition-transform duration-150" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* perforación tipo ticket en el borde derecho del panel */}
        <div
          className="hidden lg:block absolute top-0 right-0 h-full w-px"
          style={{
            backgroundImage: 'repeating-linear-gradient(to bottom, #d9d2bf 0, #d9d2bf 6px, transparent 6px, transparent 14px)',
          }}
        />
      </div>

      {/* ───────────── Panel derecho: sello del taller ───────────── */}
      <div className="hidden lg:flex w-[54%] relative items-center justify-center overflow-hidden bg-[#15171c]">

        {/* textura metal cepillado, diagonal sutil */}
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: 'repeating-linear-gradient(115deg, #fff 0px, #fff 1px, transparent 1px, transparent 7px)',
          }}
        />

        {/* cinta de peligro, esquina superior derecha */}
        <div
          className="absolute -top-10 -right-10 w-44 h-44 rotate-45"
          style={{
            backgroundImage: 'repeating-linear-gradient(45deg, #e3a23a 0 14px, #15171c 14px 28px)',
          }}
        />
        <div className="absolute top-0 right-0 w-44 h-44 bg-[#15171c]" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} />

        {/* sello circular con el logo */}
        <div className="relative z-10 flex flex-col items-center text-center px-12">
          <div className="relative w-[30rem] h-[30rem] flex items-center justify-center mb-10">
            <svg viewBox="0 0 240 240" className="absolute inset-0 w-full h-full">
              <circle
                cx="120" cy="120" r="112"
                fill="none"
                stroke="#3a4a6b"
                strokeWidth="1.5"
                strokeDasharray="2 6"
              />
              <circle
                cx="120" cy="120" r="96"
                fill="none"
                stroke="#3a4a6b"
                strokeWidth="1"
              />
              <defs>
                <path id="circlePath" d="M120,120 m-96,0 a96,96 0 1,1 192,0 a96,96 0 1,1 -192,0" />
              </defs>

            </svg>
            <img src="/logo2.png" alt="GOYO MOTOR'S" className="relative w-64 h-auto select-none" />
          </div>

        </div>

      </div>
    </div>
  );
};

export default LoginForm;