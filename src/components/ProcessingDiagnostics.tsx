import { CheckCircle2, XCircle, AlertCircle, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

export interface DiagnosticEvent {
  stage: string;
  message: string;
  timestamp: number;
  details?: Record<string, any>;
}

interface ProcessingDiagnosticsProps {
  events: DiagnosticEvent[];
  isProcessing: boolean;
}

export default function ProcessingDiagnostics({ events, isProcessing }: ProcessingDiagnosticsProps) {
  const [expanded, setExpanded] = useState(true);
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  if (events.length === 0) return null;

  const toggleEvent = (index: number) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const getIcon = (stage: string) => {
    if (stage === 'error' || stage === 'llm_error' || stage === 'chunk_error' || stage === 'parse_error') {
      return <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />;
    }
    if (stage === 'complete') {
      return <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />;
    }
    if (stage === 'warning') {
      return <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />;
    }
    return <Loader2 className="w-4 h-4 text-blue-600 animate-spin flex-shrink-0" />;
  };

  const getStageColor = (stage: string) => {
    if (stage === 'error' || stage === 'llm_error' || stage === 'chunk_error' || stage === 'parse_error') {
      return 'bg-red-50 border-red-200 text-red-800';
    }
    if (stage === 'complete') {
      return 'bg-emerald-50 border-emerald-200 text-emerald-800';
    }
    if (stage === 'warning') {
      return 'bg-amber-50 border-amber-200 text-amber-800';
    }
    return 'bg-blue-50 border-blue-200 text-blue-800';
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border-2 border-slate-200 overflow-hidden">
      <div
        className="bg-gradient-to-r from-slate-700 to-slate-900 p-4 flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 text-white">
          {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          <h3 className="font-bold text-lg">Processing Diagnostics</h3>
          {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
        </div>
        <span className="text-white/80 text-sm font-medium">{events.length} events</span>
      </div>

      {expanded && (
        <div className="max-h-[500px] overflow-y-auto">
          <div className="p-4 space-y-2">
            {events.map((event, index) => {
              const isExpanded = expandedEvents.has(index);
              const hasDetails = event.details && Object.keys(event.details).length > 0;
              const time = new Date(event.timestamp).toLocaleTimeString();

              return (
                <div
                  key={index}
                  className={`border rounded-lg p-3 transition-all ${getStageColor(event.stage)}`}
                >
                  <div
                    className={`flex items-start gap-3 ${hasDetails ? 'cursor-pointer' : ''}`}
                    onClick={() => hasDetails && toggleEvent(index)}
                  >
                    {getIcon(event.stage)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm uppercase tracking-wide">{event.stage}</span>
                        <span className="text-xs opacity-60">{time}</span>
                      </div>
                      <p className="text-sm mt-1 font-medium">{event.message}</p>

                      {hasDetails && isExpanded && (
                        <div className="mt-3 p-3 bg-white/50 rounded border border-current/20">
                          <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap break-words">
                            {JSON.stringify(event.details, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                    {hasDetails && (
                      <div className="flex-shrink-0">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
