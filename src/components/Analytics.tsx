import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Users, BookOpen, Award, DollarSign, Loader2, Calendar, Sparkles } from 'lucide-react';
import { getAnalyticsData } from '../lib/database';

const COLORS = ['#1e40af', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6'];

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
  // Publication type-specific analytics
  avgRankedJournalPubs: number;
  rankedJournalPubCountDistribution: Record<string, number>;
  avgConferencePubs: number;
  conferencePubCountDistribution: Record<string, number>;
  avgYearsSinceLastRankedJournal: number;
  lastRankedJournalDistribution: Record<string, number>;
  avgYearsSinceLastConference: number;
  lastConferenceDistribution: Record<string, number>;
  avgRecentRankedJournalPubs: number;
  recentRankedJournalDistribution: Record<string, number>;
  avgRecentConferencePubs: number;
  recentConferenceDistribution: Record<string, number>;
}

export default function Analytics() {
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
      <div className="bg-white rounded-xl shadow-sm p-12 border border-slate-200">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-12 h-12 text-blue-800 animate-spin" />
          <p className="text-slate-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-12 border border-slate-200">
        <div className="text-center text-red-600">
          <p>Error: {error}</p>
        </div>
      </div>
    );
  }

  if (!analytics || analytics.totalPersons === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-12 border border-slate-200">
        <div className="text-center">
          <Sparkles className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-700 mb-2">No data to analyze yet</h3>
          <p className="text-slate-500">Upload some CVs to see brilliance insights</p>
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

  const ageChartData = Object.entries(analytics.ageDistribution)
    .map(([range, count]) => ({ range, count }))
    .sort((a, b) => {
      const aStart = parseInt(a.range.split('-')[0]);
      const bStart = parseInt(b.range.split('-')[0]);
      return aStart - bStart;
    });

  const degreeChartData = Object.entries(analytics.degreeDistribution)
    .map(([range, count]) => ({ range, count }))
    .sort((a, b) => {
      const aStart = parseInt(a.range.split('-')[0]);
      const bStart = parseInt(b.range.split('-')[0]);
      return aStart - bStart;
    });

  const pubCountChartData = [
    { range: '0-5', count: analytics.pubCountDistribution['0-5'] },
    { range: '6-10', count: analytics.pubCountDistribution['6-10'] },
    { range: '11-20', count: analytics.pubCountDistribution['11-20'] },
    { range: '21-50', count: analytics.pubCountDistribution['21-50'] },
    { range: '50+', count: analytics.pubCountDistribution['50+'] },
  ];

  const lastPubChartData = [
    { range: '0-2', count: analytics.lastPubDistribution['0-2'] },
    { range: '3-5', count: analytics.lastPubDistribution['3-5'] },
    { range: '6-10', count: analytics.lastPubDistribution['6-10'] },
    { range: '10+', count: analytics.lastPubDistribution['10+'] },
  ];

  const recentPubChartData = [
    { range: '0', count: analytics.recentPubDistribution['0'] },
    { range: '1-2', count: analytics.recentPubDistribution['1-2'] },
    { range: '3-5', count: analytics.recentPubDistribution['3-5'] },
    { range: '6-10', count: analytics.recentPubDistribution['6-10'] },
    { range: '10+', count: analytics.recentPubDistribution['10+'] },
  ];

  // Ranked journals chart data
  const rankedJournalPubCountChartData = [
    { range: '0-5', count: analytics.rankedJournalPubCountDistribution?.['0-5'] || 0 },
    { range: '6-10', count: analytics.rankedJournalPubCountDistribution?.['6-10'] || 0 },
    { range: '11-20', count: analytics.rankedJournalPubCountDistribution?.['11-20'] || 0 },
    { range: '21-50', count: analytics.rankedJournalPubCountDistribution?.['21-50'] || 0 },
    { range: '50+', count: analytics.rankedJournalPubCountDistribution?.['50+'] || 0 },
  ];

  const conferencePubCountChartData = [
    { range: '0-5', count: analytics.conferencePubCountDistribution?.['0-5'] || 0 },
    { range: '6-10', count: analytics.conferencePubCountDistribution?.['6-10'] || 0 },
    { range: '11-20', count: analytics.conferencePubCountDistribution?.['11-20'] || 0 },
    { range: '21-50', count: analytics.conferencePubCountDistribution?.['21-50'] || 0 },
    { range: '50+', count: analytics.conferencePubCountDistribution?.['50+'] || 0 },
  ];

  const lastRankedJournalChartData = [
    { range: '0-2', count: analytics.lastRankedJournalDistribution?.['0-2'] || 0 },
    { range: '3-5', count: analytics.lastRankedJournalDistribution?.['3-5'] || 0 },
    { range: '6-10', count: analytics.lastRankedJournalDistribution?.['6-10'] || 0 },
    { range: '10+', count: analytics.lastRankedJournalDistribution?.['10+'] || 0 },
  ];

  const lastConferenceChartData = [
    { range: '0-2', count: analytics.lastConferenceDistribution?.['0-2'] || 0 },
    { range: '3-5', count: analytics.lastConferenceDistribution?.['3-5'] || 0 },
    { range: '6-10', count: analytics.lastConferenceDistribution?.['6-10'] || 0 },
    { range: '10+', count: analytics.lastConferenceDistribution?.['10+'] || 0 },
  ];

  const recentRankedJournalChartData = [
    { range: '0', count: analytics.recentRankedJournalDistribution?.['0'] || 0 },
    { range: '1-2', count: analytics.recentRankedJournalDistribution?.['1-2'] || 0 },
    { range: '3-5', count: analytics.recentRankedJournalDistribution?.['3-5'] || 0 },
    { range: '6-10', count: analytics.recentRankedJournalDistribution?.['6-10'] || 0 },
    { range: '10+', count: analytics.recentRankedJournalDistribution?.['10+'] || 0 },
  ];

  const recentConferenceChartData = [
    { range: '0', count: analytics.recentConferenceDistribution?.['0'] || 0 },
    { range: '1-2', count: analytics.recentConferenceDistribution?.['1-2'] || 0 },
    { range: '3-5', count: analytics.recentConferenceDistribution?.['3-5'] || 0 },
    { range: '6-10', count: analytics.recentConferenceDistribution?.['6-10'] || 0 },
    { range: '10+', count: analytics.recentConferenceDistribution?.['10+'] || 0 },
  ];

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-2xl shadow-lg border-2 border-slate-200 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-gradient-to-br from-lime-500 to-teal-500 rounded-full w-14 h-14 flex items-center justify-center shadow-lg">
            <span className="text-2xl font-black text-white">01</span>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-slate-800">Average Age Analysis</h3>
            <p className="text-sm text-slate-500 font-medium">Distribution of researcher ages</p>
          </div>
        </div>
        <div className="mb-6 p-6 bg-gradient-to-br from-lime-50 to-teal-50 rounded-xl border-2 border-lime-200">
          <div className="text-sm text-slate-600 mb-2 font-semibold uppercase tracking-wide">Average Age</div>
          <div className="text-5xl font-black text-lime-600">
            {analytics.averageAge > 0 ? `${analytics.averageAge} years` : 'N/A'}
          </div>
        </div>
        {ageChartData.length > 0 && ageChartData.some(d => d.count > 0) ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ageChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="range" stroke="#64748b" style={{ fontSize: '13px', fontWeight: '600' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '13px', fontWeight: '600' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '2px solid #84cc16',
                  borderRadius: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  fontWeight: 'bold'
                }}
                cursor={{ fill: 'rgba(132, 204, 22, 0.1)' }}
              />
              <Bar dataKey="count" fill="url(#colorGradient1)" radius={[8, 8, 0, 0]} />
              <defs>
                <linearGradient id="colorGradient1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#84cc16" />
                  <stop offset="100%" stopColor="#14b8a6" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-slate-400 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 font-semibold">
            Insufficient data for distribution chart
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-lg border-2 border-slate-200 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-gradient-to-br from-teal-500 to-cyan-600 rounded-full w-14 h-14 flex items-center justify-center shadow-lg">
            <span className="text-2xl font-black text-white">02</span>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-slate-800">Years Since Latest Degree</h3>
            <p className="text-sm text-slate-500 font-medium">Experience level distribution</p>
          </div>
        </div>
        <div className="mb-6 p-6 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-xl border-2 border-teal-200">
          <div className="text-sm text-slate-600 mb-2 font-semibold uppercase tracking-wide">Average Years Since Latest Degree</div>
          <div className="text-5xl font-black text-teal-600">
            {analytics.avgYearsSinceDegree > 0 ? `${analytics.avgYearsSinceDegree} years` : 'N/A'}
          </div>
        </div>
        {degreeChartData.length > 0 && degreeChartData.some(d => d.count > 0) ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={degreeChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="range" stroke="#64748b" style={{ fontSize: '13px', fontWeight: '600' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '13px', fontWeight: '600' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '2px solid #14b8a6',
                  borderRadius: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  fontWeight: 'bold'
                }}
                cursor={{ fill: 'rgba(20, 184, 166, 0.1)' }}
              />
              <Bar dataKey="count" fill="url(#colorGradient2)" radius={[8, 8, 0, 0]} />
              <defs>
                <linearGradient id="colorGradient2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#14b8a6" />
                  <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-slate-400 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 font-semibold">
            Insufficient data for distribution chart
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-lg border-2 border-slate-200 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-gradient-to-br from-cyan-500 to-blue-500 rounded-full w-14 h-14 flex items-center justify-center shadow-lg">
            <span className="text-2xl font-black text-white">03</span>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-slate-800">Publication Count Distribution</h3>
            <p className="text-sm text-slate-500 font-medium">Research output across researchers</p>
          </div>
        </div>
        <div className="mb-6 p-6 bg-gradient-to-br from-cyan-50 to-blue-50 rounded-xl border-2 border-cyan-200">
          <div className="text-sm text-slate-600 mb-2 font-semibold uppercase tracking-wide">Average Publications per Researcher</div>
          <div className="text-5xl font-black text-cyan-600">
            {analytics.avgPublicationsPerCV.toFixed(1)}
          </div>
        </div>
        {pubCountChartData.some(d => d.count > 0) ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={pubCountChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="range" stroke="#64748b" style={{ fontSize: '13px', fontWeight: '600' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '13px', fontWeight: '600' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '2px solid #06b6d4',
                  borderRadius: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  fontWeight: 'bold'
                }}
                cursor={{ fill: 'rgba(6, 182, 212, 0.1)' }}
              />
              <Bar dataKey="count" fill="url(#colorGradient3)" radius={[8, 8, 0, 0]} />
              <defs>
                <linearGradient id="colorGradient3" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" />
                  <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-slate-400 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 font-semibold">
            Insufficient data for distribution chart
          </div>
        )}

        {/* Sub-sections for Ranked Journals and Conferences */}
        <div className="mt-8 grid md:grid-cols-2 gap-6">
          {/* Ranked Journals */}
          <div className="bg-emerald-50 rounded-xl p-6 border-2 border-emerald-200">
            <h4 className="text-lg font-bold text-emerald-800 mb-3">Ranked Journal Publications (Q1/Q2/Q3)</h4>
            <div className="mb-4 p-4 bg-white rounded-lg border border-emerald-200">
              <div className="text-xs text-slate-500 mb-1 font-semibold uppercase">Average per Researcher</div>
              <div className="text-3xl font-black text-emerald-600">
                {(analytics.avgRankedJournalPubs || 0).toFixed(1)}
              </div>
            </div>
            {rankedJournalPubCountChartData.some(d => d.count > 0) ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={rankedJournalPubCountChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d1fae5" />
                  <XAxis dataKey="range" stroke="#047857" style={{ fontSize: '11px', fontWeight: '600' }} />
                  <YAxis stroke="#047857" style={{ fontSize: '11px', fontWeight: '600' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '2px solid #10b981',
                      borderRadius: '8px',
                      fontWeight: 'bold'
                    }}
                  />
                  <Bar dataKey="count" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-emerald-400 bg-emerald-100/50 rounded-lg border-2 border-dashed border-emerald-200 font-semibold text-sm">
                No ranked journal data
              </div>
            )}
          </div>

          {/* Conferences */}
          <div className="bg-purple-50 rounded-xl p-6 border-2 border-purple-200">
            <h4 className="text-lg font-bold text-purple-800 mb-3">Conference Publications</h4>
            <div className="mb-4 p-4 bg-white rounded-lg border border-purple-200">
              <div className="text-xs text-slate-500 mb-1 font-semibold uppercase">Average per Researcher</div>
              <div className="text-3xl font-black text-purple-600">
                {(analytics.avgConferencePubs || 0).toFixed(1)}
              </div>
            </div>
            {conferencePubCountChartData.some(d => d.count > 0) ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={conferencePubCountChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e9d5ff" />
                  <XAxis dataKey="range" stroke="#7c3aed" style={{ fontSize: '11px', fontWeight: '600' }} />
                  <YAxis stroke="#7c3aed" style={{ fontSize: '11px', fontWeight: '600' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '2px solid #8b5cf6',
                      borderRadius: '8px',
                      fontWeight: 'bold'
                    }}
                  />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-purple-400 bg-purple-100/50 rounded-lg border-2 border-dashed border-purple-200 font-semibold text-sm">
                No conference data
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border-2 border-slate-200 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-full w-14 h-14 flex items-center justify-center shadow-lg">
            <span className="text-2xl font-black text-white">04</span>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-slate-800">Years Since Last Publication</h3>
            <p className="text-sm text-slate-500 font-medium">Research activity recency</p>
          </div>
        </div>
        <div className="mb-6 p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border-2 border-blue-200">
          <div className="text-sm text-slate-600 mb-2 font-semibold uppercase tracking-wide">Average Years Since Last Publication</div>
          <div className="text-5xl font-black text-blue-600">
            {analytics.avgYearsSinceLastPub > 0 ? `${analytics.avgYearsSinceLastPub} years` : 'N/A'}
          </div>
        </div>
        {lastPubChartData.some(d => d.count > 0) ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={lastPubChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="range" stroke="#64748b" style={{ fontSize: '13px', fontWeight: '600' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '13px', fontWeight: '600' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '2px solid #3b82f6',
                  borderRadius: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  fontWeight: 'bold'
                }}
                cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
              />
              <Bar dataKey="count" fill="url(#colorGradient4)" radius={[8, 8, 0, 0]} />
              <defs>
                <linearGradient id="colorGradient4" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#2563eb" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-slate-400 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 font-semibold">
            Insufficient data for distribution chart
          </div>
        )}

        {/* Sub-sections for Ranked Journals and Conferences */}
        <div className="mt-8 grid md:grid-cols-2 gap-6">
          {/* Ranked Journals */}
          <div className="bg-emerald-50 rounded-xl p-6 border-2 border-emerald-200">
            <h4 className="text-lg font-bold text-emerald-800 mb-3">Years Since Last Ranked Journal</h4>
            <div className="mb-4 p-4 bg-white rounded-lg border border-emerald-200">
              <div className="text-xs text-slate-500 mb-1 font-semibold uppercase">Average Years</div>
              <div className="text-3xl font-black text-emerald-600">
                {(analytics.avgYearsSinceLastRankedJournal || 0) > 0 ? `${analytics.avgYearsSinceLastRankedJournal} yrs` : 'N/A'}
              </div>
            </div>
            {lastRankedJournalChartData.some(d => d.count > 0) ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={lastRankedJournalChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d1fae5" />
                  <XAxis dataKey="range" stroke="#047857" style={{ fontSize: '11px', fontWeight: '600' }} />
                  <YAxis stroke="#047857" style={{ fontSize: '11px', fontWeight: '600' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '2px solid #10b981',
                      borderRadius: '8px',
                      fontWeight: 'bold'
                    }}
                  />
                  <Bar dataKey="count" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-emerald-400 bg-emerald-100/50 rounded-lg border-2 border-dashed border-emerald-200 font-semibold text-sm">
                No ranked journal data
              </div>
            )}
          </div>

          {/* Conferences */}
          <div className="bg-purple-50 rounded-xl p-6 border-2 border-purple-200">
            <h4 className="text-lg font-bold text-purple-800 mb-3">Years Since Last Conference</h4>
            <div className="mb-4 p-4 bg-white rounded-lg border border-purple-200">
              <div className="text-xs text-slate-500 mb-1 font-semibold uppercase">Average Years</div>
              <div className="text-3xl font-black text-purple-600">
                {(analytics.avgYearsSinceLastConference || 0) > 0 ? `${analytics.avgYearsSinceLastConference} yrs` : 'N/A'}
              </div>
            </div>
            {lastConferenceChartData.some(d => d.count > 0) ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={lastConferenceChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e9d5ff" />
                  <XAxis dataKey="range" stroke="#7c3aed" style={{ fontSize: '11px', fontWeight: '600' }} />
                  <YAxis stroke="#7c3aed" style={{ fontSize: '11px', fontWeight: '600' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '2px solid #8b5cf6',
                      borderRadius: '8px',
                      fontWeight: 'bold'
                    }}
                  />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-purple-400 bg-purple-100/50 rounded-lg border-2 border-dashed border-purple-200 font-semibold text-sm">
                No conference data
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border-2 border-slate-200 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-full w-14 h-14 flex items-center justify-center shadow-lg">
            <span className="text-2xl font-black text-white">05</span>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-slate-800">Publications in Last 5 Years</h3>
            <p className="text-sm text-slate-500 font-medium">Recent research productivity</p>
          </div>
        </div>
        <div className="mb-6 p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border-2 border-blue-300">
          <div className="text-sm text-slate-600 mb-2 font-semibold uppercase tracking-wide">Average Recent Publications (Last 5 Years)</div>
          <div className="text-5xl font-black text-blue-700">
            {analytics.avgRecentPublications.toFixed(1)}
          </div>
        </div>
        {recentPubChartData.some(d => d.count > 0) ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={recentPubChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="range" stroke="#64748b" style={{ fontSize: '13px', fontWeight: '600' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '13px', fontWeight: '600' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '2px solid #2563eb',
                  borderRadius: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  fontWeight: 'bold'
                }}
                cursor={{ fill: 'rgba(37, 99, 235, 0.1)' }}
              />
              <Bar dataKey="count" fill="url(#colorGradient5)" radius={[8, 8, 0, 0]} />
              <defs>
                <linearGradient id="colorGradient5" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" />
                  <stop offset="100%" stopColor="#1e3a8a" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-slate-400 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 font-semibold">
            Insufficient data for distribution chart
          </div>
        )}

        {/* Sub-sections for Ranked Journals and Conferences */}
        <div className="mt-8 grid md:grid-cols-2 gap-6">
          {/* Ranked Journals */}
          <div className="bg-emerald-50 rounded-xl p-6 border-2 border-emerald-200">
            <h4 className="text-lg font-bold text-emerald-800 mb-3">Ranked Journals (Last 5 Years)</h4>
            <div className="mb-4 p-4 bg-white rounded-lg border border-emerald-200">
              <div className="text-xs text-slate-500 mb-1 font-semibold uppercase">Average per Researcher</div>
              <div className="text-3xl font-black text-emerald-600">
                {(analytics.avgRecentRankedJournalPubs || 0).toFixed(1)}
              </div>
            </div>
            {recentRankedJournalChartData.some(d => d.count > 0) ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={recentRankedJournalChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d1fae5" />
                  <XAxis dataKey="range" stroke="#047857" style={{ fontSize: '11px', fontWeight: '600' }} />
                  <YAxis stroke="#047857" style={{ fontSize: '11px', fontWeight: '600' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '2px solid #10b981',
                      borderRadius: '8px',
                      fontWeight: 'bold'
                    }}
                  />
                  <Bar dataKey="count" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-emerald-400 bg-emerald-100/50 rounded-lg border-2 border-dashed border-emerald-200 font-semibold text-sm">
                No recent ranked journal data
              </div>
            )}
          </div>

          {/* Conferences */}
          <div className="bg-purple-50 rounded-xl p-6 border-2 border-purple-200">
            <h4 className="text-lg font-bold text-purple-800 mb-3">Conferences (Last 5 Years)</h4>
            <div className="mb-4 p-4 bg-white rounded-lg border border-purple-200">
              <div className="text-xs text-slate-500 mb-1 font-semibold uppercase">Average per Researcher</div>
              <div className="text-3xl font-black text-purple-600">
                {(analytics.avgRecentConferencePubs || 0).toFixed(1)}
              </div>
            </div>
            {recentConferenceChartData.some(d => d.count > 0) ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={recentConferenceChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e9d5ff" />
                  <XAxis dataKey="range" stroke="#7c3aed" style={{ fontSize: '11px', fontWeight: '600' }} />
                  <YAxis stroke="#7c3aed" style={{ fontSize: '11px', fontWeight: '600' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '2px solid #8b5cf6',
                      borderRadius: '8px',
                      fontWeight: 'bold'
                    }}
                  />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-purple-400 bg-purple-100/50 rounded-lg border-2 border-dashed border-purple-200 font-semibold text-sm">
                No recent conference data
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
