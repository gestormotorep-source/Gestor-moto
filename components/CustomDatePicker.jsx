import { useState, useRef, useEffect } from 'react';
import { Calendar } from './ui/calendar';
import { format, isValid, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

const CustomDatePicker = ({
  selected,
  onChange,
  placeholder = '00 / 00 / 0000',
  minDate,
}) => {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const containerRef = useRef(null);

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

  // Formateo automático mientras escribe
  const handleInputChange = (e) => {
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

    if (nums.length === 8) {
      const parsed = parse(
        `${nums.slice(0, 2)}/${nums.slice(2, 4)}/${nums.slice(4, 8)}`,
        'dd/MM/yyyy',
        new Date()
      );
      if (isValid(parsed)) {
        onChange(parsed);
        setOpen(false);
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
      <div
        className={cn(
          'flex items-center border rounded-lg bg-white transition-colors overflow-hidden',
          open ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-300 hover:border-gray-400'
        )}
        style={{ width: 'fit-content' }}
      >
        {/* Input de texto */}
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          placeholder={placeholder}
          maxLength={14}
          className="px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 outline-none bg-transparent"
          style={{ width: '130px' }}
        />

        {/* Separador */}
        <div className="w-px h-5 bg-gray-200" />

        {/* Botón flecha */}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="px-2 py-1.5 hover:bg-gray-50 transition-colors"
        >
          <ChevronDown
            className={cn(
              'w-4 h-4 text-gray-400 transition-transform duration-200',
              open && 'rotate-180'
            )}
          />
        </button>
      </div>

      {/* Calendario shadcn desplegable */}
      {open && (
        <div className="absolute top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={handleDaySelect}
            locale={es}
            disabled={minDate ? { before: minDate } : undefined}
            initialFocus
          />
        </div>
      )}
    </div>
  );
};

export default CustomDatePicker;