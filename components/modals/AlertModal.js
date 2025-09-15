import React from 'react';
import { createPortal } from 'react-dom';

const AlertModal = ({ isOpen, onClose, message }) => {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-50 transition-opacity duration-300">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full mx-4 transform transition-transform duration-300 scale-95">
        <p className="text-lg font-semibold text-gray-800 mb-4">{message}</p>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-md shadow-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AlertModal;