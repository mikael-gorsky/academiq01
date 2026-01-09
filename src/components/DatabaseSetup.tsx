import { useState } from 'react';
import { Database, CheckCircle, XCircle, Loader, Copy, ExternalLink } from 'lucide-react';

const SQL_SCRIPT = `-- AcademiQ Database Setup Script

-- Create persons table
CREATE TABLE IF NOT EXISTS academiq_persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  birth_year integer,
  birth_country text,
  marital_status text,
  num_children integer DEFAULT 0,
  pdf_filename text,
  metadata jsonb,
  imported_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create education table
CREATE TABLE IF NOT EXISTS academiq_education (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES academiq_persons(id) ON DELETE CASCADE,
  degree_type text,
  institution text NOT NULL,
  department text,
  subject text,
  specialization text,
  award_date date,
  honors text,
  country text,
  created_at timestamptz DEFAULT now()
);

-- Create publications table
CREATE TABLE IF NOT EXISTS academiq_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES academiq_persons(id) ON DELETE CASCADE,
  title text NOT NULL,
  publication_type text,
  venue_name text,
  publication_year integer NOT NULL,
  volume text,
  issue text,
  pages text,
  co_authors text[],
  citation_count integer,
  url text,
  indexed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create experience table
CREATE TABLE IF NOT EXISTS academiq_experience (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES academiq_persons(id) ON DELETE CASCADE,
  institution text NOT NULL,
  department text,
  position_title text NOT NULL,
  start_date date,
  end_date date,
  description text,
  employment_type text,
  created_at timestamptz DEFAULT now()
);

-- Create grants table
CREATE TABLE IF NOT EXISTS academiq_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES academiq_persons(id) ON DELETE CASCADE,
  title text NOT NULL,
  funding_institution text NOT NULL,
  amount numeric,
  currency_code text,
  award_year integer,
  duration text,
  role text,
  created_at timestamptz DEFAULT now()
);

-- Create teaching table
CREATE TABLE IF NOT EXISTS academiq_teaching (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES academiq_persons(id) ON DELETE CASCADE,
  course_title text NOT NULL,
  education_level text,
  institution text,
  teaching_period text,
  created_at timestamptz DEFAULT now()
);

-- Create supervision table
CREATE TABLE IF NOT EXISTS academiq_supervision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES academiq_persons(id) ON DELETE CASCADE,
  student_name text NOT NULL,
  degree_level text,
  thesis_title text,
  completion_year integer,
  role text,
  created_at timestamptz DEFAULT now()
);

-- Create memberships table
CREATE TABLE IF NOT EXISTS academiq_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES academiq_persons(id) ON DELETE CASCADE,
  organization text NOT NULL,
  start_year integer,
  end_year integer,
  created_at timestamptz DEFAULT now()
);

-- Create awards table
CREATE TABLE IF NOT EXISTS academiq_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES academiq_persons(id) ON DELETE CASCADE,
  award_name text NOT NULL,
  awarding_institution text,
  award_year integer,
  description text,
  created_at timestamptz DEFAULT now()
);

-- Create parsing lessons table
CREATE TABLE IF NOT EXISTS academiq_parsing_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cv_filename text NOT NULL,
  issue_type text NOT NULL,
  issue_description text NOT NULL,
  expected_behavior text,
  actual_behavior text,
  resolution_notes text,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_persons_name ON academiq_persons(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_persons_email ON academiq_persons(email);
CREATE INDEX IF NOT EXISTS idx_education_person ON academiq_education(person_id);
CREATE INDEX IF NOT EXISTS idx_publications_person ON academiq_publications(person_id);
CREATE INDEX IF NOT EXISTS idx_publications_year ON academiq_publications(publication_year);
CREATE INDEX IF NOT EXISTS idx_experience_person ON academiq_experience(person_id);
CREATE INDEX IF NOT EXISTS idx_grants_person ON academiq_grants(person_id);
CREATE INDEX IF NOT EXISTS idx_teaching_person ON academiq_teaching(person_id);
CREATE INDEX IF NOT EXISTS idx_supervision_person ON academiq_supervision(person_id);
CREATE INDEX IF NOT EXISTS idx_memberships_person ON academiq_memberships(person_id);
CREATE INDEX IF NOT EXISTS idx_awards_person ON academiq_awards(person_id);

-- Disable RLS (for internal database use)
ALTER TABLE academiq_persons DISABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_education DISABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_publications DISABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_experience DISABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_grants DISABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_teaching DISABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_supervision DISABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_memberships DISABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_awards DISABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_parsing_lessons DISABLE ROW LEVEL SECURITY;

-- Grant full access to anon and authenticated roles
GRANT ALL ON TABLE academiq_persons TO anon, authenticated;
GRANT ALL ON TABLE academiq_education TO anon, authenticated;
GRANT ALL ON TABLE academiq_publications TO anon, authenticated;
GRANT ALL ON TABLE academiq_experience TO anon, authenticated;
GRANT ALL ON TABLE academiq_grants TO anon, authenticated;
GRANT ALL ON TABLE academiq_teaching TO anon, authenticated;
GRANT ALL ON TABLE academiq_supervision TO anon, authenticated;
GRANT ALL ON TABLE academiq_memberships TO anon, authenticated;
GRANT ALL ON TABLE academiq_awards TO anon, authenticated;
GRANT ALL ON TABLE academiq_parsing_lessons TO anon, authenticated;`;

export function DatabaseSetup() {
  const [status, setStatus] = useState<'idle' | 'checking' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [tables, setTables] = useState<{ name: string; exists: boolean }[]>([]);
  const [copied, setCopied] = useState(false);

  const projectId = import.meta.env.VITE_SUPABASE_URL?.split('//')[1]?.split('.')[0] || '';

  const checkDatabase = async () => {
    setStatus('checking');
    setMessage('Checking database tables...');

    const tableNames = [
      'academiq_persons',
      'academiq_education',
      'academiq_publications',
      'academiq_experience',
      'academiq_grants',
      'academiq_teaching',
      'academiq_supervision',
      'academiq_memberships',
      'academiq_awards',
      'academiq_parsing_lessons',
    ];

    const results = await Promise.all(
      tableNames.map(async (name) => {
        try {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${name}?select=id&limit=1`,
            {
              headers: {
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              },
            }
          );
          return { name, exists: response.ok };
        } catch {
          return { name, exists: false };
        }
      })
    );

    setTables(results);

    const allExist = results.every(t => t.exists);
    if (allExist) {
      setStatus('success');
      setMessage('All tables exist! Database is ready.');
    } else {
      setStatus('error');
      setMessage(`${results.filter(t => !t.exists).length} tables are missing.`);
    }
  };

  const copySQL = () => {
    navigator.clipboard.writeText(SQL_SCRIPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl p-8 max-w-4xl w-full">
        <div className="flex items-center gap-3 mb-6">
          <Database className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-slate-900">Database Setup Required</h1>
        </div>

        <p className="text-slate-600 mb-6">
          Your AcademiQ database needs to be initialized. Follow these steps to create the required tables:
        </p>

        <div className="space-y-6">
          <button
            onClick={checkDatabase}
            disabled={status === 'checking'}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-md"
          >
            {status === 'checking' ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Checking Database...
              </>
            ) : (
              <>
                <Database className="w-5 h-5" />
                Check Database Status
              </>
            )}
          </button>

          {tables.length > 0 && (
            <div className="border border-slate-200 rounded-lg p-5 space-y-2 bg-slate-50">
              <h3 className="font-bold text-slate-900 mb-4 text-lg">Table Status</h3>
              <div className="grid grid-cols-2 gap-3">
                {tables.map((table) => (
                  <div key={table.name} className="flex items-center justify-between py-2 px-3 bg-white rounded border border-slate-100">
                    <span className="text-sm text-slate-700 font-mono">{table.name}</span>
                    {table.exists ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {message && (
            <div
              className={`p-4 rounded-lg font-medium ${
                status === 'success'
                  ? 'bg-green-50 text-green-800 border-2 border-green-200'
                  : status === 'error'
                  ? 'bg-red-50 text-red-800 border-2 border-red-200'
                  : 'bg-blue-50 text-blue-800 border-2 border-blue-200'
              }`}
            >
              {message}
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="bg-slate-50 border-2 border-slate-200 rounded-lg p-5">
                <h3 className="font-bold text-slate-900 mb-3 text-lg">Setup Instructions</h3>
                <ol className="space-y-3 text-slate-700">
                  <li className="flex gap-3">
                    <span className="font-bold text-blue-600 min-w-[24px]">1.</span>
                    <span>Click the "Copy SQL" button below to copy the database setup script</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="font-bold text-blue-600 min-w-[24px]">2.</span>
                    <span>Click "Open Supabase SQL Editor" to open your project's SQL editor</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="font-bold text-blue-600 min-w-[24px]">3.</span>
                    <span>Paste the SQL script into the editor and click "Run"</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="font-bold text-blue-600 min-w-[24px]">4.</span>
                    <span>Come back here and click "Check Database Status" to verify</span>
                  </li>
                </ol>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={copySQL}
                  className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-md"
                >
                  <Copy className="w-5 h-5" />
                  {copied ? 'Copied!' : 'Copy SQL Script'}
                </button>

                <a
                  href={`https://supabase.com/dashboard/project/${projectId}/sql/new`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-md"
                >
                  <ExternalLink className="w-5 h-5" />
                  Open Supabase SQL Editor
                </a>
              </div>

              <details className="bg-slate-50 border border-slate-200 rounded-lg">
                <summary className="cursor-pointer p-4 font-semibold text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
                  View SQL Script
                </summary>
                <div className="p-4 pt-0">
                  <pre className="text-xs bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
                    {SQL_SCRIPT}
                  </pre>
                </div>
              </details>
            </div>
          )}

          {status === 'success' && (
            <a
              href="/"
              className="block w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg text-center transition-colors shadow-md"
            >
              Continue to Dashboard
            </a>
          )}
        </div>
      </div>
    </div>
  );
}