import Modal from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'danger' | 'primary';
  details?: string[];
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'primary',
  details,
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const confirmButtonClass =
    confirmVariant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : 'bg-cyan-600 hover:bg-cyan-700 text-white';

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <div className="space-y-4">
        <h3 className="text-xl font-bold text-slate-800">{title}</h3>
        <p className="text-slate-600">{message}</p>

        {details && details.length > 0 && (
          <div className="bg-slate-50 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium text-slate-700">This will permanently remove:</p>
            <ul className="text-sm text-slate-600 space-y-1">
              {details.map((detail, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-slate-400 mt-1">•</span>
                  <span>{detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {confirmVariant === 'danger' && (
          <p className="text-sm text-red-600 font-medium">
            This action cannot be undone.
          </p>
        )}

        <div className="flex gap-3 justify-end pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${confirmButtonClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
