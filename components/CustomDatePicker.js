import { useState, useRef, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { format, isValid, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import 'react-day-picker/dist/style.css';

const CustomDatePicker = ({ selected, onChange, placeholder = '00 / 00 / 0000', minDate }) => {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Sincronizar input con valor externo
  useEffect(() => {
    if (selected && isValid(selected)) {
      setInputValue(format(selected, 'dd / MM / yyyy'));
    } else {
      setInputValue('');
    }
  }, [selected]);

  // Cerrar al clickear fuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Manejar escritura en el input con formato automático
  const handleInputChange = (e) => {
    // Solo números
    const nums = e.target.value.replace(/\D/g, '');
    
    let formatted = '';
    if (nums.length <= 2) {
      formatted = nums;
    } else if (nums.length <= 4) {
      formatted = `${nums.slice(0, 2)} / ${nums.slice(2)}`;
    } else {
      formatted = `${nums.slice(0, 2)} / ${nums.slice(2, 4)} / ${nums.slice(4, 8)}`;
    }

    setInputValue(formatted);

    // Si tiene fecha completa, parsear y emitir
    if (nums.length === 8) {
      const parsed = parse(
        `${nums.slice(0, 2)}/${nums.slice(2, 4)}/${nums.slice(4, 8)}`,
        'dd/MM/yyyy',
        new Date()
      );
      if (isValid(parsed)) {
        onChange(parsed);
      }
    }
  };

  const handleDaySelect = (day) => {
    if (!day) return;
    onChange(day);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Input + botón flecha */}
        <div className="flex items-center border border-gray-300 rounded-lg bg-white hover:border-blue-400 transition-colors overflow-hidden"
        style={{ width: 'fit-content' }}
        >
        {/* Input de texto para escribir fecha */}
        <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            placeholder="00 / 00 / 0000"
            maxLength={20}
            className="flex-1 px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 outline-none bg-transparent"
            style={{ width: '190px', minWidth: '105px', maxWidth: '190px' }}
        />

        {/* Separador */}
        <div className="w-px h-5 bg-gray-300" />

        {/* Botón flecha para abrir calendario */}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="px-2 py-1.5 hover:bg-gray-50 transition-colors"
        >
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Calendario desplegable */}
      {open && (
        <div className="absolute top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={handleDaySelect}
            locale={es}
            disabled={minDate ? { before: minDate } : undefined}
            styles={{ root: { margin: '8px' } }}
          />
        </div>
      )}
    </div>
  );
};

export default CustomDatePicker;