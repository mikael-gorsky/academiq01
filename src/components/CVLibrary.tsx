import { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Filter,
  BookOpen,
  Award,
  GraduationCap,
  Loader2,
  X,
  ArrowRight,
  Sparkles,
  TrendingUp,
  Trash2,
  CheckSquare,
  Square,
} from 'lucide-react';
import { getAllPersons, deletePerson, deletePersons } from '../lib/database';
import ConfirmDialog from './ui/ConfirmDialog';
import { useToast } from './ui/Toast';

interface PersonData {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  birth_year?: number;
  imported_at: string;
  education: Array<{
    degree_type?: string;
    institution: string;
    subject?: string;
    award_date?: string;
  }>;
  publications: Array<{
    title: string;
    publication_year: number;
  }>;
  experience: Array<{
    position_title: string;
    institution: string;
    department?: string;
    end_date?: string;
  }>;
}

interface CVLibraryProps {
  onViewResearcher: (id: string) => void;
}

export default function CVLibrary({ onViewResearcher }: CVLibraryProps) {
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [persons, setPersons] = useState<PersonData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [personToDelete, setPersonToDelete] = useState<PersonData | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [sortBy, setSortBy] = useState<
    | 'name-asc'
    | 'name-desc'
    | 'date-new'
    | 'date-old'
    | 'pubs-high'
    | 'pubs-low'
    | 'recent-pub'
  >('date-new');

  const [filters, setFilters] = useState({
    degrees: [] as string[],
    pubCount: 'all' as 'all' | '0-10' | '11-25' | '26-50' | '50+',
    recentPubs: false,
    lastFiveYears: false,
  });

  useEffect(() => {
    loadPersons();
  }, []);

  const loadPersons = async () => {
    try {
      setLoading(true);
      const data = await getAllPersons();
      setPersons(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const getCurrentPosition = (person: PersonData) => {
    const currentExp = person.experience.find((exp) => !exp.end_date);
    return currentExp || person.experience[0];
  };

  const getLastPublicationYear = (person: PersonData) => {
    if (person.publications.length === 0) return null;
    return Math.max(...person.publications.map((pub) => pub.publication_year));
  };

  const getHighestDegree = (person: PersonData) => {
    if (!person.education || person.education.length === 0) return 'N/A';

    const degreeOrder = ['BSc', 'BA', 'MSc', 'MA', 'MBA', 'PhD'];
    const degrees = person.education.map((edu) => edu.degree_type || '');

    let highest = '';
    let highestIndex = -1;

    degrees.forEach((degree) => {
      const normalizedDegree = degree.replace(/\./g, '').replace(/\s+/g, '');
      const index = degreeOrder.findIndex((d) =>
        normalizedDegree.toLowerCase().includes(d.toLowerCase())
      );
      if (index > highestIndex) {
        highestIndex = index;
        highest = degree;
      }
    });

    return highest || degrees[0] || 'N/A';
  };

  const filteredAndSortedCVs = useMemo(() => {
    let filtered = persons.filter((person) => {
      const fullName = `${person.first_name} ${person.last_name}`.toLowerCase();
      const searchLower = searchTerm.toLowerCase();

      const matchesSearch =
        fullName.includes(searchLower) ||
        person.email.toLowerCase().includes(searchLower) ||
        person.experience.some(
          (exp) =>
            exp.position_title.toLowerCase().includes(searchLower) ||
            exp.institution.toLowerCase().includes(searchLower)
        ) ||
        person.education.some(
          (edu) =>
            (edu.subject && edu.subject.toLowerCase().includes(searchLower)) ||
            edu.institution.toLowerCase().includes(searchLower)
        );

      if (!matchesSearch) return false;

      if (filters.degrees.length > 0) {
        const hasDegree = person.education.some((edu) =>
          filters.degrees.some((deg) => edu.degree_type?.includes(deg))
        );
        if (!hasDegree) return false;
      }

      if (filters.pubCount !== 'all') {
        const pubCount = person.publications.length;
        const ranges = {
          '0-10': pubCount <= 10,
          '11-25': pubCount >= 11 && pubCount <= 25,
          '26-50': pubCount >= 26 && pubCount <= 50,
          '50+': pubCount > 50,
        };
        if (!ranges[filters.pubCount]) return false;
      }

      if (filters.recentPubs) {
        const lastYear = getLastPublicationYear(person);
        if (!lastYear || new Date().getFullYear() - lastYear > 2) return false;
      }

      if (filters.lastFiveYears) {
        const currentYear = new Date().getFullYear();
        const hasRecentPub = person.publications.some(
          (pub) => pub.publication_year >= currentYear - 5
        );
        if (!hasRecentPub) return false;
      }

      return true;
    });

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name-asc':
          return `${a.first_name} ${a.last_name}`.localeCompare(
            `${b.first_name} ${b.last_name}`
          );
        case 'name-desc':
          return `${b.first_name} ${b.last_name}`.localeCompare(
            `${a.first_name} ${a.last_name}`
          );
        case 'date-new':
          return new Date(b.imported_at).getTime() - new Date(a.imported_at).getTime();
        case 'date-old':
          return new Date(a.imported_at).getTime() - new Date(b.imported_at).getTime();
        case 'pubs-high':
          return b.publications.length - a.publications.length;
        case 'pubs-low':
          return a.publications.length - b.publications.length;
        case 'recent-pub': {
          const aLast = getLastPublicationYear(a) || 0;
          const bLast = getLastPublicationYear(b) || 0;
          return bLast - aLast;
        }
        default:
          return 0;
      }
    });

    return filtered;
  }, [persons, searchTerm, filters, sortBy]);

  const toggleDegreeFilter = (degree: string) => {
    setFilters((prev) => ({
      ...prev,
      degrees: prev.degrees.includes(degree)
        ? prev.degrees.filter((d) => d !== degree)
        : [...prev.degrees, degree],
    }));
  };

  const clearFilters = () => {
    setFilters({
      degrees: [],
      pubCount: 'all',
      recentPubs: false,
      lastFiveYears: false,
    });
  };

  const handleDeleteClick = (e: React.MouseEvent, person: PersonData) => {
    e.stopPropagation();
    setPersonToDelete(person);
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!personToDelete) return;

    try {
      await deletePerson(personToDelete.id);
      setPersons(prev => prev.filter(p => p.id !== personToDelete.id));
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(personToDelete.id);
        return newSet;
      });
      showToast(`${personToDelete.first_name} ${personToDelete.last_name} has been deleted.`, 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Failed to delete researcher',
        'error'
      );
    } finally {
      setShowDeleteDialog(false);
      setPersonToDelete(null);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAndSortedCVs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAndSortedCVs.map(p => p.id)));
    }
  };

  const handleBulkDeleteClick = () => {
    if (selectedIds.size === 0) return;
    setShowBulkDeleteDialog(true);
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    try {
      const idsToDelete = Array.from(selectedIds);
      await deletePersons(idsToDelete);
      setPersons(prev => prev.filter(p => !selectedIds.has(p.id)));
      const count = selectedIds.size;
      setSelectedIds(new Set());
      showToast(`${count} ${count === 1 ? 'researcher' : 'researchers'} deleted successfully.`, 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Failed to delete researchers',
        'error'
      );
    } finally {
      setShowBulkDeleteDialog(false);
    }
  };

  const activeFilterCount =
    filters.degrees.length +
    (filters.pubCount !== 'all' ? 1 : 0) +
    (filters.recentPubs ? 1 : 0) +
    (filters.lastFiveYears ? 1 : 0);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-12 border border-slate-200">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-12 h-12 text-cyan-600 animate-spin" />
          <p className="text-slate-600">Loading brilliant minds...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-12 border border-slate-200">
        <div className="text-center text-red-600">
          <p>Error: {error}</p>
          <button
            onClick={loadPersons}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (persons.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-12 border border-slate-200">
        <div className="text-center">
          <GraduationCap className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-700 mb-2">Ready to process some brilliance?</h3>
          <p className="text-slate-500 mb-6">Upload your first academic CV to start building your database</p>
        </div>
      </div>
    );
  }

  if (filteredAndSortedCVs.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <GraduationCap className="w-6 h-6 text-cyan-600" />
              <h2 className="text-2xl font-bold text-slate-800">Faculty</h2>
            </div>
            <div className="flex gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search faculty..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-10 py-2 w-80 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="text-center py-12">
            <Search className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-700 mb-2">No researchers found</h3>
            <p className="text-slate-500 mb-6">
              Try different keywords or clear filters
            </p>
            <button
              onClick={() => {
                setSearchTerm('');
                clearFilters();
              }}
              className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
            >
              Clear Search
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <GraduationCap className="w-6 h-6 text-cyan-600" />
            <h2 className="text-2xl font-bold text-slate-800">Faculty</h2>
            <span className="px-3 py-1 bg-cyan-100 text-cyan-800 rounded-full text-sm font-semibold">
              {filteredAndSortedCVs.length} {filteredAndSortedCVs.length === 1 ? 'member' : 'members'}
            </span>
            {selectedIds.size > 0 && (
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
                {selectedIds.size} selected
              </span>
            )}
          </div>

          <div className="flex gap-3">
            {selectedIds.size > 0 && (
              <button
                onClick={handleBulkDeleteClick}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete {selectedIds.size} {selectedIds.size === 1 ? 'researcher' : 'researchers'}
              </button>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search faculty..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-10 py-2 w-80 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
                showFilters || activeFilterCount > 0
                  ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                  : 'border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Filter className="w-5 h-5" />
              Filters
              {activeFilterCount > 0 && (
                <span className="px-2 py-0.5 bg-cyan-600 text-white rounded-full text-xs font-semibold">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {searchTerm && (
          <div className="mb-4 text-sm text-slate-600">
            {filteredAndSortedCVs.length} {filteredAndSortedCVs.length === 1 ? 'result' : 'results'} found
          </div>
        )}

        {showFilters && (
          <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200 animate-fadeIn">
            <div className="grid md:grid-cols-4 gap-6">
              <div>
                <h3 className="font-semibold text-slate-700 mb-3">Degree Type</h3>
                <div className="space-y-2">
                  {['BSc', 'MSc', 'MBA', 'PhD', 'PostDoc'].map((degree) => (
                    <label key={degree} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={filters.degrees.includes(degree)}
                        onChange={() => toggleDegreeFilter(degree)}
                        className="rounded text-cyan-600 focus:ring-cyan-500"
                      />
                      <span className="text-slate-700">{degree}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-slate-700 mb-3">Publication Count</h3>
                <div className="space-y-2">
                  {[
                    { value: 'all', label: 'All' },
                    { value: '0-10', label: '0-10' },
                    { value: '11-25', label: '11-25' },
                    { value: '26-50', label: '26-50' },
                    { value: '50+', label: '50+' },
                  ].map((option) => (
                    <label key={option.value} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="pubCount"
                        checked={filters.pubCount === option.value}
                        onChange={() =>
                          setFilters((prev) => ({ ...prev, pubCount: option.value as any }))
                        }
                        className="text-cyan-600 focus:ring-cyan-500"
                      />
                      <span className="text-slate-700">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-slate-700 mb-3">Recent Activity</h3>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={filters.recentPubs}
                      onChange={(e) =>
                        setFilters((prev) => ({ ...prev, recentPubs: e.target.checked }))
                      }
                      className="rounded text-cyan-600 focus:ring-cyan-500"
                    />
                    <span className="text-slate-700">Published last 2 years</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={filters.lastFiveYears}
                      onChange={(e) =>
                        setFilters((prev) => ({ ...prev, lastFiveYears: e.target.checked }))
                      }
                      className="rounded text-cyan-600 focus:ring-cyan-500"
                    />
                    <span className="text-slate-700">Published last 5 years</span>
                  </label>
                </div>
              </div>

              <div className="flex items-end">
                <button
                  onClick={clearFilters}
                  className="w-full px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-sm"
            >
              {selectedIds.size === filteredAndSortedCVs.length ? (
                <>
                  <CheckSquare className="w-4 h-4 text-cyan-600" />
                  Deselect All
                </>
              ) : (
                <>
                  <Square className="w-4 h-4" />
                  Select All
                </>
              )}
            </button>
            <div className="text-sm text-slate-600">
              Showing {filteredAndSortedCVs.length} of {persons.length} researchers
            </div>
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="date-new">Import Date (newest first)</option>
            <option value="date-old">Import Date (oldest first)</option>
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="pubs-high">Publication Count (highest)</option>
            <option value="pubs-low">Publication Count (lowest)</option>
            <option value="recent-pub">Most Recent Publication</option>
          </select>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAndSortedCVs.map((person) => {
            const position = getCurrentPosition(person);
            const lastPubYear = getLastPublicationYear(person);
            const isProlific = person.publications.length >= 50;

            const importDate = new Date(person.imported_at);
            const day = String(importDate.getDate()).padStart(2, '0');
            const month = String(importDate.getMonth() + 1).padStart(2, '0');
            const year = String(importDate.getFullYear()).slice(-2);
            const formattedImportDate = `${day}/${month}/${year}`;

            const isSelected = selectedIds.has(person.id);

            return (
              <div
                key={person.id}
                onClick={() => onViewResearcher(person.id)}
                className={`p-4 border rounded-lg cursor-pointer hover:border-cyan-400 hover:shadow-md transition-all hover:scale-[1.02] bg-white relative group ${
                  isSelected ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200'
                }`}
              >
                <div className="absolute top-3 right-3 flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelection(person.id);
                    }}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    title={isSelected ? 'Deselect' : 'Select'}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5 text-cyan-600" />
                    ) : (
                      <Square className="w-5 h-5 text-slate-400" />
                    )}
                  </button>
                  <button
                    onClick={(e) => handleDeleteClick(e, person)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete researcher"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-start justify-between mb-3 pr-20">
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-800 text-lg">
                      {person.first_name} {person.last_name}
                    </h3>
                    <p className="text-sm text-slate-600 line-clamp-1">
                      {position?.position_title || 'Researcher'}
                    </p>
                    <p className="text-sm text-cyan-600 font-medium line-clamp-1">
                      {position?.institution || 'Institution not specified'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-emerald-100 to-cyan-100 text-slate-700 rounded text-xs">
                    CV imported on {formattedImportDate}
                  </span>
                  {isProlific && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-semibold">
                      <TrendingUp className="w-3 h-3" />
                      Prolific
                    </span>
                  )}
                </div>

                <div className="space-y-2 text-sm text-slate-700 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <GraduationCap className="w-4 h-4 text-cyan-600" />
                      {getHighestDegree(person)}
                    </span>
                    <span className="flex items-center gap-1">
                      <BookOpen className="w-4 h-4 text-emerald-600" />
                      {person.publications.length} pubs
                    </span>
                  </div>
                  {lastPubYear && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Last publication: {lastPubYear}</span>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-200">
                  <span className="flex items-center gap-2 text-cyan-600 font-medium text-sm">
                    View Profile
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setPersonToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title={personToDelete ? `Delete ${personToDelete.first_name} ${personToDelete.last_name}?` : 'Delete Researcher'}
        message="This will permanently delete this researcher and all associated data from the database."
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
      />

      <ConfirmDialog
        isOpen={showBulkDeleteDialog}
        onClose={() => setShowBulkDeleteDialog(false)}
        onConfirm={handleConfirmBulkDelete}
        title={`Delete ${selectedIds.size} ${selectedIds.size === 1 ? 'researcher' : 'researchers'}?`}
        message={`This will permanently delete ${selectedIds.size} ${selectedIds.size === 1 ? 'researcher' : 'researchers'} and all associated data from the database.`}
        confirmText="Delete All"
        cancelText="Cancel"
        confirmVariant="danger"
      />
    </div>
  );
}
