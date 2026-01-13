import { useState, useEffect } from 'react';
import { GraduationCap, Plus, BarChart3, Menu, X } from 'lucide-react';
import { ToastProvider } from './components/ui/Toast';
import Dashboard from './components/Dashboard';
import UploadZone from './components/UploadZone';
import CVLibrary from './components/CVLibrary';
import Analytics from './components/Analytics';
import ResearcherDetail from './components/ResearcherDetail';
import { DatabaseSetup } from './components/DatabaseSetup';

type View = 'dashboard' | 'upload' | 'library' | 'analytics' | 'researcher';

function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedResearcherId, setSelectedResearcherId] = useState<string | null>(null);
  const [databaseReady, setDatabaseReady] = useState<boolean | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const checkDatabase = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/academiq_persons?select=id&limit=1`,
          {
            headers: {
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
          }
        );
        setDatabaseReady(response.ok);
      } catch {
        setDatabaseReady(false);
      }
    };

    checkDatabase();
  }, []);

  const handleViewResearcher = (id: string) => {
    setSelectedResearcherId(id);
    setCurrentView('researcher');
  };

  const handleBack = () => {
    setCurrentView('library');
    setSelectedResearcherId(null);
  };

  const handleNavClick = (view: View) => {
    setCurrentView(view);
    setMobileMenuOpen(false);
  };

  const navButtonClass = (view: View) =>
    `flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all ${
      currentView === view
        ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-blue-500/30'
        : 'bg-white text-slate-700 hover:bg-slate-50 border-2 border-slate-200'
    }`;

  const mobileNavButtonClass = (view: View) =>
    `flex items-center gap-3 w-full px-4 py-3 rounded-lg font-medium transition-all ${
      currentView === view
        ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white'
        : 'text-slate-700 hover:bg-slate-100'
    }`;

  if (databaseReady === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Checking database...</p>
        </div>
      </div>
    );
  }

  if (databaseReady === false) {
    return <DatabaseSetup />;
  }

  return (
    <ToastProvider>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
        <header className="bg-white border-b-2 border-slate-100 shadow-sm sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <button onClick={() => setCurrentView('dashboard')} className="flex items-center gap-4 group">
                <div className="bg-gradient-to-br from-lime-500 via-cyan-500 to-blue-600 p-4 rounded-2xl shadow-lg group-hover:shadow-xl transition-all group-hover:scale-105">
                  <GraduationCap className="w-9 h-9 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                    AcademIQ
                  </h1>
                  <p className="text-slate-500 text-sm font-medium mt-0.5">
                    Indexing brilliance, one CV at a time
                  </p>
                </div>
              </button>

              {currentView !== 'researcher' && (
                <>
                  {/* Desktop Navigation */}
                  <nav className="hidden md:flex gap-3">
                    <button onClick={() => handleNavClick('dashboard')} className={navButtonClass('dashboard')}>
                      <BarChart3 className="w-5 h-5" />
                      Dashboard
                    </button>
                    <button onClick={() => handleNavClick('library')} className={navButtonClass('library')}>
                      <GraduationCap className="w-5 h-5" />
                      Academics
                    </button>
                    <button onClick={() => handleNavClick('analytics')} className={navButtonClass('analytics')}>
                      <BarChart3 className="w-5 h-5" />
                      Analytics
                    </button>
                    <button onClick={() => handleNavClick('upload')} className={navButtonClass('upload')}>
                      <Plus className="w-5 h-5" />
                    </button>
                  </nav>

                  {/* Mobile Menu Button */}
                  <button
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    className="md:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
                    aria-label="Toggle menu"
                  >
                    {mobileMenuOpen ? (
                      <X className="w-6 h-6 text-slate-700" />
                    ) : (
                      <Menu className="w-6 h-6 text-slate-700" />
                    )}
                  </button>
                </>
              )}
            </div>

            {/* Mobile Menu Dropdown */}
            {mobileMenuOpen && currentView !== 'researcher' && (
              <div className="md:hidden border-t border-slate-200 bg-white animate-fadeIn">
                <nav className="px-4 py-3 space-y-1">
                  <button onClick={() => handleNavClick('dashboard')} className={mobileNavButtonClass('dashboard')}>
                    <BarChart3 className="w-5 h-5" />
                    Dashboard
                  </button>
                  <button onClick={() => handleNavClick('library')} className={mobileNavButtonClass('library')}>
                    <GraduationCap className="w-5 h-5" />
                    Academics
                  </button>
                  <button onClick={() => handleNavClick('analytics')} className={mobileNavButtonClass('analytics')}>
                    <BarChart3 className="w-5 h-5" />
                    Analytics
                  </button>
                  <button onClick={() => handleNavClick('upload')} className={mobileNavButtonClass('upload')}>
                    <Plus className="w-5 h-5" />
                    Upload CV
                  </button>
                </nav>
              </div>
            )}
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="animate-fadeIn">
            {currentView === 'dashboard' && <Dashboard />}
            {currentView === 'upload' && <UploadZone />}
            {currentView === 'library' && <CVLibrary onViewResearcher={handleViewResearcher} />}
            {currentView === 'analytics' && <Analytics />}
            {currentView === 'researcher' && selectedResearcherId && (
              <ResearcherDetail researcherId={selectedResearcherId} onBack={handleBack} />
            )}
          </div>
        </main>

        <footer className="mt-20 border-t-2 border-slate-100 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="text-center">
              <p className="text-slate-700 font-semibold">AcademIQ &copy; {new Date().getFullYear()}</p>
              <p className="text-xs text-slate-400 mt-2">
                Database last updated: {new Date().toLocaleString()}
              </p>
            </div>
          </div>
        </footer>
      </div>
    </ToastProvider>
  );
}

export default App;
