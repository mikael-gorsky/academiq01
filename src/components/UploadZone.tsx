import { useState, useRef } from 'react';
import { Upload, FileText, X, Loader2, CheckCircle } from 'lucide-react';
import { uploadPDF, parseCV, saveParsedCV, type ParsedCVData } from '../lib/database';
import { useToast } from './ui/Toast';

const playSound = (frequency: number, duration: number) => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
  } catch (error) {
    console.log('Audio not supported');
  }
};

const playStartSound = () => playSound(440, 0.15);
const playCompleteSound = () => {
  playSound(523.25, 0.1);
  setTimeout(() => playSound(659.25, 0.15), 100);
};

interface FileUpload {
  file: File;
  status: 'pending' | 'uploading' | 'extracting' | 'identifying' | 'chunking' | 'parsing-base' | 'parsing-pubs' | 'finalizing' | 'completed' | 'error' | 'duplicate';
  uploadedFilename?: string;
  parsedData?: ParsedCVData;
  error?: string;
  progressDetail?: string;
  duplicateInfo?: {
    id: string;
    name: string;
    email: string;
    importedAt: string;
  };
}

export default function UploadZone() {
  const { showToast } = useToast();
  const [fileQueue, setFileQueue] = useState<FileUpload[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  const validateFile = (file: File): string | null => {
    if (file.type !== 'application/pdf') {
      return 'File must be in PDF format';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File must be under 10MB';
    }
    return null;
  };

  const handleFiles = async (files: File[]) => {
    const validFiles: FileUpload[] = [];

    for (const file of files) {
      const validationError = validateFile(file);
      if (validationError) {
        validFiles.push({
          file,
          status: 'error',
          error: validationError
        });
      } else {
        validFiles.push({
          file,
          status: 'pending'
        });
      }
    }

    const startIndex = fileQueue.length;
    setFileQueue(prev => [...prev, ...validFiles]);

    for (let i = 0; i < validFiles.length; i++) {
      const fileUpload = validFiles[i];
      if (fileUpload.status === 'error') continue;

      const queueIndex = startIndex + i;

      setFileQueue(prev => {
        const updated = [...prev];
        updated[queueIndex] = { ...updated[queueIndex], status: 'uploading' };
        return updated;
      });

      playStartSound();

      try {
        const filename = await uploadPDF(fileUpload.file);

        // Stage: Extracting text
        setFileQueue(prev => {
          const updated = [...prev];
          updated[queueIndex] = {
            ...updated[queueIndex],
            status: 'extracting',
            uploadedFilename: filename,
            progressDetail: 'Extracting text from PDF...'
          };
          return updated;
        });
        await new Promise(resolve => setTimeout(resolve, 300));

        // Stage: Identifying sections
        setFileQueue(prev => {
          const updated = [...prev];
          updated[queueIndex] = {
            ...updated[queueIndex],
            status: 'identifying',
            progressDetail: 'Identifying CV sections...'
          };
          return updated;
        });
        await new Promise(resolve => setTimeout(resolve, 300));

        // Stage: Chunking
        setFileQueue(prev => {
          const updated = [...prev];
          updated[queueIndex] = {
            ...updated[queueIndex],
            status: 'chunking',
            progressDetail: 'Chunking publications...'
          };
          return updated;
        });
        await new Promise(resolve => setTimeout(resolve, 300));

        // Stage: Parsing base data
        setFileQueue(prev => {
          const updated = [...prev];
          updated[queueIndex] = {
            ...updated[queueIndex],
            status: 'parsing-base',
            progressDetail: 'Parsing personal info and education...'
          };
          return updated;
        });

        const parsedData = await parseCV(filename);

        // Stage: Parsing publications
        setFileQueue(prev => {
          const updated = [...prev];
          updated[queueIndex] = {
            ...updated[queueIndex],
            status: 'parsing-pubs',
            progressDetail: `Found ${parsedData.publications?.length || 0} publications...`
          };
          return updated;
        });
        await new Promise(resolve => setTimeout(resolve, 300));

        // Stage: Finalizing
        setFileQueue(prev => {
          const updated = [...prev];
          updated[queueIndex] = {
            ...updated[queueIndex],
            status: 'finalizing',
            progressDetail: 'Saving to database...'
          };
          return updated;
        });

        await saveParsedCV(parsedData, filename);

        setFileQueue(prev => {
          const updated = [...prev];
          updated[queueIndex] = {
            ...updated[queueIndex],
            status: 'completed',
            parsedData,
            progressDetail: undefined
          };
          return updated;
        });

        const name = `${parsedData.personal.firstName} ${parsedData.personal.lastName}`;
        showToast(`Brilliance successfully indexed! ${name} added to database.`, 'success');

        playCompleteSound();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to process file';
        const isDuplicate = errorMessage.includes('already been indexed') || errorMessage.includes('already exists');

        setFileQueue(prev => {
          const updated = [...prev];
          updated[queueIndex] = {
            ...updated[queueIndex],
            status: isDuplicate ? 'duplicate' : 'error',
            error: errorMessage,
            progressDetail: undefined
          };
          return updated;
        });
      }
    }
  };

  const removeFile = (index: number) => {
    setFileQueue(prev => prev.filter((_, i) => i !== index));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFiles(Array.from(files));
    }
  };

  const getStatusColor = (status: FileUpload['status']) => {
    switch (status) {
      case 'pending': return 'bg-slate-100 text-slate-600';
      case 'uploading': return 'bg-amber-100 text-amber-700';
      case 'extracting': return 'bg-blue-100 text-blue-700';
      case 'identifying': return 'bg-indigo-100 text-indigo-700';
      case 'chunking': return 'bg-purple-100 text-purple-700';
      case 'parsing-base': return 'bg-cyan-100 text-cyan-700';
      case 'parsing-pubs': return 'bg-teal-100 text-teal-700';
      case 'finalizing': return 'bg-lime-100 text-lime-700';
      case 'completed': return 'bg-emerald-100 text-emerald-700';
      case 'duplicate': return 'bg-amber-100 text-amber-700';
      case 'error': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  const getStatusText = (status: FileUpload['status']) => {
    switch (status) {
      case 'pending': return 'Queued';
      case 'uploading': return 'Uploading...';
      case 'extracting': return 'Extracting...';
      case 'identifying': return 'Identifying...';
      case 'chunking': return 'Chunking...';
      case 'parsing-base': return 'Parsing...';
      case 'parsing-pubs': return 'Publications...';
      case 'finalizing': return 'Finalizing...';
      case 'completed': return 'Completed';
      case 'duplicate': return 'Duplicate';
      case 'error': return 'Error';
      default: return status;
    }
  };

  const isActiveStatus = (status: FileUpload['status']) => {
    return ['uploading', 'extracting', 'identifying', 'chunking', 'parsing-base', 'parsing-pubs', 'finalizing'].includes(status);
  };

  const getStatusIcon = (status: FileUpload['status']) => {
    if (status === 'completed') {
      return <CheckCircle className="w-4 h-4 text-emerald-600" />;
    }
    if (isActiveStatus(status)) {
      return <Loader2 className="w-4 h-4 animate-spin" />;
    }
    return null;
  };

  const completedCount = fileQueue.filter(f => f.status === 'completed').length;
  const uploadingCount = fileQueue.filter(f => f.status === 'uploading').length;
  const parsingCount = fileQueue.filter(f =>
    ['extracting', 'identifying', 'chunking', 'parsing-base', 'parsing-pubs', 'finalizing'].includes(f.status)
  ).length;

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-2xl shadow-lg border-2 border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-lime-500 via-cyan-500 to-blue-600 p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 text-white">
            <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl">
              <Upload className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold">CV Import</h2>
              <p className="text-white/90 text-sm font-medium mt-1">Upload academic CVs for intelligent indexing</p>
            </div>
            {fileQueue.length > 0 && (
              <div className="sm:ml-auto bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full">
                <span className="text-sm font-bold">
                  {completedCount}/{fileQueue.length} completed
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full px-6 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-bold hover:shadow-lg hover:shadow-blue-500/30 transition-all hover:scale-[1.02] flex items-center justify-center gap-3 text-lg"
          >
            <Upload className="w-6 h-6" />
            Select CVs to Import
          </button>
        </div>
      </div>

      {(uploadingCount > 0 || parsingCount > 0) && (
        <div className="p-4 sm:p-5 bg-gradient-to-r from-cyan-50 to-blue-50 border-2 border-cyan-200 rounded-2xl flex items-center gap-4 shadow-md">
          <div className="animate-spin rounded-full h-6 w-6 border-3 border-cyan-600 border-t-transparent flex-shrink-0"></div>
          <span className="text-cyan-900 font-bold text-base sm:text-lg">
            {uploadingCount > 0 && `Uploading ${uploadingCount} file${uploadingCount !== 1 ? 's' : ''}...`}
            {uploadingCount > 0 && parsingCount > 0 && ' '}
            {parsingCount > 0 && `Analyzing ${parsingCount} file${parsingCount !== 1 ? 's' : ''}...`}
          </span>
        </div>
      )}

      {fileQueue.length > 0 && (
        <div className="bg-white rounded-2xl shadow-lg border-2 border-slate-200 p-4 sm:p-6">
          <h3 className="text-lg sm:text-xl font-bold text-slate-800 mb-5 flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-600" />
            Processing Queue ({fileQueue.length})
          </h3>
          <div className="space-y-3">
            {fileQueue.map((fileUpload, index) => (
              <div
                key={index}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 bg-slate-50 rounded-xl border-2 border-slate-200 hover:border-slate-300 transition-all gap-3"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="bg-white p-3 rounded-lg shadow-sm border-2 border-slate-200 flex-shrink-0">
                    <FileText className="w-5 h-5 text-slate-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">
                      {fileUpload.file.name}
                    </p>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      {(fileUpload.file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 ${getStatusColor(fileUpload.status)}`}>
                    {getStatusIcon(fileUpload.status)}
                    {getStatusText(fileUpload.status)}
                  </span>

                  {fileUpload.progressDetail && (
                    <div className="text-xs text-slate-600 font-medium italic">
                      {fileUpload.progressDetail}
                    </div>
                  )}

                  {fileUpload.status === 'duplicate' && (
                    <div className="text-xs text-amber-700 font-semibold">
                      Already exists
                    </div>
                  )}

                  {fileUpload.status === 'error' && fileUpload.error && (
                    <div className="text-xs text-red-600 max-w-xs truncate font-semibold" title={fileUpload.error}>
                      {fileUpload.error}
                    </div>
                  )}

                  {(fileUpload.status === 'completed' || fileUpload.status === 'error' || fileUpload.status === 'duplicate') && (
                    <button
                      onClick={() => removeFile(index)}
                      className="p-2 text-slate-400 hover:text-red-600 transition-colors hover:bg-red-50 rounded-lg"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
