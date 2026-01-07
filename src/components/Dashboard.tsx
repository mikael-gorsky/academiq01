import { useState, useEffect } from 'react';
import { Users, BookOpen, Award, Calendar, Loader2, Sparkles, TrendingUp } from 'lucide-react';
import { getAnalyticsData } from '../lib/database';

interface AnalyticsData {
  totalPersons: number;
  totalPublications: number;
  totalCitations: number;
  totalGrants: number;
  avgPublicationsPerCV: number;
  avgCitationsPerCV: number;
  averageAge: number;
  ageDistribution: Record<string, number>;
  avgYearsSinceDegree: number;
  degreeDistribution: Record<string, number>;
  pubCountDistribution: Record<string, number>;
  avgYearsSinceLastPub: number;
  lastPubDistribution: Record<string, number>;
  avgRecentPublications: number;
  recentPubDistribution: Record<string, number>;
  dateRange: { earliest: string; latest: string } | null;
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const data = await getAnalyticsData();
      setAnalytics(data as AnalyticsData);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-12 border-2 border-slate-200">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-12 h-12 text-cyan-600 animate-spin" />
          <p className="text-slate-600 font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-12 border-2 border-slate-200">
        <div className="text-center text-red-600">
          <p>Error: {error}</p>
        </div>
      </div>
    );
  }

  if (!analytics || analytics.totalPersons === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-12 border-2 border-slate-200">
        <div className="text-center">
          <Sparkles className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-700 mb-2">No data to display yet</h3>
          <p className="text-slate-500">Import CVs to see your dashboard</p>
        </div>
      </div>
    );
  }

  const formatDateRange = (range: { earliest: string; latest: string } | null) => {
    if (!range) return 'N/A';
    const earliest = new Date(range.earliest).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const latest = new Date(range.latest).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    return earliest === latest ? earliest : `${earliest} - ${latest}`;
  };

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-2xl shadow-lg border-2 border-slate-200 p-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-gradient-to-br from-lime-500 via-cyan-500 to-blue-600 p-3 rounded-xl shadow-lg">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-slate-800">
            Brilliant academicians' CV imported: <span className="text-cyan-600">{analytics.totalPersons}</span>
          </h2>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border-2 border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-lime-500 via-cyan-500 to-blue-600 p-6">
          <div className="flex items-center gap-3 text-white">
            <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl">
              <TrendingUp className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-3xl font-bold">Brilliance Insights</h2>
              <p className="text-white/90 text-sm font-medium mt-1">Comprehensive analytics across all indexed researchers</p>
            </div>
          </div>
        </div>

        <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-5">
          <div className="relative bg-gradient-to-br from-lime-500 to-lime-600 rounded-2xl p-5 shadow-lg border-2 border-lime-400">
            <div className="absolute -top-3 -left-3 bg-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg border-2 border-lime-500">
              <span className="text-lg font-black text-lime-600">01</span>
            </div>
            <div className="mt-6">
              <Users className="w-6 h-6 text-white mb-3" />
              <p className="text-white/90 text-xs font-bold uppercase tracking-wide mb-1">Total Researchers</p>
              <p className="text-4xl font-black text-white">{analytics.totalPersons}</p>
              <p className="text-xs text-white/80 mt-2 font-semibold">Indexed in database</p>
            </div>
          </div>

          <div className="relative bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl p-5 shadow-lg border-2 border-teal-400">
            <div className="absolute -top-3 -left-3 bg-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg border-2 border-teal-500">
              <span className="text-lg font-black text-teal-600">02</span>
            </div>
            <div className="mt-6">
              <BookOpen className="w-6 h-6 text-white mb-3" />
              <p className="text-white/90 text-xs font-bold uppercase tracking-wide mb-1">Total Publications</p>
              <p className="text-4xl font-black text-white">{analytics.totalPublications.toLocaleString()}</p>
              <p className="text-xs text-white/80 mt-2 font-semibold">Across all researchers</p>
            </div>
          </div>

          <div className="relative bg-gradient-to-br from-cyan-500 to-blue-500 rounded-2xl p-5 shadow-lg border-2 border-cyan-400">
            <div className="absolute -top-3 -left-3 bg-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg border-2 border-cyan-500">
              <span className="text-lg font-black text-cyan-600">03</span>
            </div>
            <div className="mt-6">
              <Award className="w-6 h-6 text-white mb-3" />
              <p className="text-white/90 text-xs font-bold uppercase tracking-wide mb-1">Avg Publications</p>
              <p className="text-4xl font-black text-white">{analytics.avgPublicationsPerCV.toFixed(1)}</p>
              <p className="text-xs text-white/80 mt-2 font-semibold">Per researcher</p>
            </div>
          </div>

          <div className="relative bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 shadow-lg border-2 border-blue-500">
            <div className="absolute -top-3 -left-3 bg-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg border-2 border-blue-600">
              <span className="text-lg font-black text-blue-600">04</span>
            </div>
            <div className="mt-6">
              <Calendar className="w-6 h-6 text-white mb-3" />
              <p className="text-white/90 text-xs font-bold uppercase tracking-wide mb-1">Date Range</p>
              <p className="text-xl font-black text-white">{formatDateRange(analytics.dateRange)}</p>
              <p className="text-xs text-white/80 mt-2 font-semibold">Import timeline</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
