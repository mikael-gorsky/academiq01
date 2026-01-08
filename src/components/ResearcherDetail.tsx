import { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Mail,
  Phone,
  Calendar,
  GraduationCap,
  FileText,
  Briefcase,
  DollarSign,
  BookOpen,
  Users,
  Award,
  Network,
  Edit,
  Trash2,
  Loader2,
} from 'lucide-react';
import { getPersonById, deletePerson } from '../lib/database';
import ConfirmDialog from './ui/ConfirmDialog';
import { useToast } from './ui/Toast';

interface ResearcherDetailProps {
  researcherId: string;
  onBack: () => void;
}

export default function ResearcherDetail({ researcherId, onBack }: ResearcherDetailProps) {
  const { showToast } = useToast();

  const [researcher, setResearcher] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [pubSort, setPubSort] = useState<'year-desc' | 'year-asc'>('year-desc');

  useEffect(() => {
    if (researcherId) {
      loadResearcher();
    }
  }, [researcherId]);

  const loadResearcher = async () => {
    try {
      setLoading(true);
      const data = await getPersonById(researcherId);
      if (!data) {
        setError('Researcher not found');
      } else {
        setResearcher(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load researcher');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deletePerson(researcherId);
      showToast('Researcher deleted successfully', 'success');
      onBack();
    } catch (err) {
      showToast('Failed to delete researcher', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-12 h-12 text-cyan-600 animate-spin" />
      </div>
    );
  }

  if (error || !researcher) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 text-lg">{error || 'Researcher not found'}</p>
        <button
          onClick={onBack}
          className="mt-4 text-cyan-600 hover:text-cyan-700 font-medium"
        >
          ← Back to Library
        </button>
      </div>
    );
  }

  const currentPosition = researcher.experience?.find((exp: any) => !exp.end_date);

  const sortedPublications = [...(researcher.publications || [])].sort((a, b) => {
    if (pubSort === 'year-desc') return b.publication_year - a.publication_year;
    return a.publication_year - b.publication_year;
  });

  const sortedEducation = [...(researcher.education || [])].sort((a, b) => {
    const dateA = a.award_date ? new Date(a.award_date).getTime() : 0;
    const dateB = b.award_date ? new Date(b.award_date).getTime() : 0;
    return dateB - dateA;
  });

  const getPublicationIcon = (type: string) => {
    const iconClass = 'w-5 h-5';
    if (type?.toLowerCase().includes('journal')) return <FileText className={iconClass} />;
    if (type?.toLowerCase().includes('conference')) return <Users className={iconClass} />;
    if (type?.toLowerCase().includes('book')) return <BookOpen className={iconClass} />;
    return <FileText className={iconClass} />;
  };

  const getPublicationAge = (year: number) => {
    const age = new Date().getFullYear() - year;
    if (age <= 2) return 'text-emerald-600';
    if (age <= 5) return 'text-cyan-600';
    return 'text-slate-500';
  };

  const deleteDetails = [
    'Personal profile',
    `${researcher.publications?.length || 0} publications`,
    `${researcher.education?.length || 0} education records`,
    `${researcher.experience?.length || 0} experience records`,
    'All related data',
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-200">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-cyan-600 hover:text-cyan-700 font-medium mb-6 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Processed Researchers
        </button>

        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-4xl font-bold text-blue-900 mb-2">
              {researcher.first_name} {researcher.last_name}
            </h1>
            {currentPosition && (
              <p className="text-xl text-slate-700 mb-4">
                {currentPosition.position_title}
                {currentPosition.institution && (
                  <span className="text-slate-500"> at {currentPosition.institution}</span>
                )}
              </p>
            )}
            <div className="flex flex-wrap gap-4 text-slate-600">
              {researcher.email && (
                <a
                  href={`mailto:${researcher.email}`}
                  className="flex items-center gap-2 hover:text-cyan-600 transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  {researcher.email}
                </a>
              )}
              {researcher.phone && (
                <span className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  {researcher.phone}
                </span>
              )}
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Processed on {new Date(researcher.imported_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => showToast('Edit functionality coming soon', 'info')}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium transition-colors"
            >
              <Edit className="w-4 h-4" />
              Edit
            </button>
            <button
              onClick={() => setShowDeleteDialog(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>
      </div>

      {sortedEducation.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-200">
          <div className="flex items-center gap-2 mb-6">
            <GraduationCap className="w-6 h-6 text-cyan-600" />
            <h2 className="text-2xl font-bold text-slate-800">Education</h2>
          </div>
          <div className="space-y-4">
            {sortedEducation.map((edu: any, index: number) => (
              <div
                key={index}
                className="border border-slate-200 rounded-lg p-4 hover:border-cyan-300 transition-colors"
              >
                <h3 className="text-lg font-bold text-slate-800">
                  {edu.degree_type}
                  {edu.subject && ` in ${edu.subject}`}
                </h3>
                <p className="text-slate-700">
                  {edu.institution}
                  {edu.country && `, ${edu.country}`}
                </p>
                {edu.award_date && (
                  <p className="text-sm text-slate-500 mt-1">
                    {new Date(edu.award_date).getFullYear()}
                  </p>
                )}
                {edu.specialization && (
                  <p className="text-sm text-slate-600 mt-2">
                    <span className="font-medium">Specialization:</span> {edu.specialization}
                  </p>
                )}
                {edu.honors && (
                  <p className="text-sm text-emerald-600 font-medium mt-2">{edu.honors}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {sortedPublications.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <FileText className="w-6 h-6 text-cyan-600" />
              <h2 className="text-2xl font-bold text-slate-800">
                Publications ({sortedPublications.length})
              </h2>
            </div>
            <select
              value={pubSort}
              onChange={(e) => setPubSort(e.target.value as any)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="year-desc">Year (newest first)</option>
              <option value="year-asc">Year (oldest first)</option>
            </select>
          </div>
          <div className="space-y-4">
            {sortedPublications.map((pub: any, index: number) => (
              <div
                key={index}
                className="border-l-4 border-cyan-500 pl-4 py-2 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className={getPublicationAge(pub.publication_year)}>
                    {getPublicationIcon(pub.publication_type)}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-800">{pub.title}</h3>
                    <p className="text-sm text-slate-600 mt-1">
                      {pub.venue_name && <span>{pub.venue_name}</span>}
                      {pub.volume && <span>, Vol. {pub.volume}</span>}
                      {pub.issue && <span>({pub.issue})</span>}
                      {pub.pages && <span>, pp. {pub.pages}</span>}
                      <span className={`ml-2 font-medium ${getPublicationAge(pub.publication_year)}`}>
                        ({pub.publication_year})
                      </span>
                    </p>
                    {pub.url && (
                      <a
                        href={pub.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-cyan-600 hover:text-cyan-700 mt-1 inline-block"
                      >
                        View publication →
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {researcher.experience && researcher.experience.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-200">
          <div className="flex items-center gap-2 mb-6">
            <Briefcase className="w-6 h-6 text-cyan-600" />
            <h2 className="text-2xl font-bold text-slate-800">Professional Experience</h2>
          </div>
          <div className="space-y-4">
            {researcher.experience
              .sort((a: any, b: any) => {
                const dateA = a.start_date ? new Date(a.start_date).getTime() : 0;
                const dateB = b.start_date ? new Date(b.start_date).getTime() : 0;
                return dateB - dateA;
              })
              .map((exp: any, index: number) => (
                <div key={index} className="flex gap-4">
                  <div className="text-sm text-slate-600 min-w-[140px]">
                    {exp.start_date && new Date(exp.start_date).getFullYear()}
                    {' - '}
                    {exp.end_date ? (
                      new Date(exp.end_date).getFullYear()
                    ) : (
                      <span className="text-emerald-600 font-medium">Present</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-800">{exp.position_title}</h3>
                    <p className="text-slate-700">
                      {exp.institution}
                      {exp.department && `, ${exp.department}`}
                    </p>
                    {exp.description && (
                      <p className="text-sm text-slate-600 mt-1">{exp.description}</p>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {researcher.grants && researcher.grants.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-200">
          <div className="flex items-center gap-2 mb-6">
            <DollarSign className="w-6 h-6 text-cyan-600" />
            <h2 className="text-2xl font-bold text-slate-800">Research Grants</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {researcher.grants
              .sort((a: any, b: any) => b.award_year - a.award_year)
              .map((grant: any, index: number) => (
                <div
                  key={index}
                  className="border border-slate-200 rounded-lg p-4 hover:border-cyan-300 transition-colors"
                >
                  <h3 className="font-bold text-slate-800">{grant.title}</h3>
                  <p className="text-sm text-slate-600 mt-1">{grant.funding_institution}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm text-slate-500">{grant.award_year}</span>
                    {grant.amount && (
                      <span className="text-lg font-bold text-emerald-600">
                        {grant.currency_code || '$'}
                        {grant.amount.toLocaleString()}
                      </span>
                    )}
                  </div>
                  {grant.role && (
                    <p className="text-xs text-slate-500 mt-2">Role: {grant.role}</p>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {researcher.teaching && researcher.teaching.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-200">
          <div className="flex items-center gap-2 mb-6">
            <BookOpen className="w-6 h-6 text-cyan-600" />
            <h2 className="text-2xl font-bold text-slate-800">Teaching Experience</h2>
          </div>
          <ul className="space-y-3">
            {researcher.teaching.map((teach: any, index: number) => (
              <li key={index} className="flex items-start gap-3">
                <span className="text-cyan-600 mt-1">•</span>
                <div>
                  <p className="font-medium text-slate-800">{teach.course_title}</p>
                  {(teach.institution || teach.education_level) && (
                    <p className="text-sm text-slate-600">
                      {teach.institution}
                      {teach.education_level && `, ${teach.education_level}`}
                    </p>
                  )}
                  {teach.teaching_period && (
                    <p className="text-xs text-slate-500">{teach.teaching_period}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {researcher.supervision && researcher.supervision.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-200">
          <div className="flex items-center gap-2 mb-6">
            <Users className="w-6 h-6 text-cyan-600" />
            <h2 className="text-2xl font-bold text-slate-800">Students Supervised</h2>
          </div>
          <div className="space-y-4">
            {researcher.supervision
              .sort((a: any, b: any) => (b.completion_year || 9999) - (a.completion_year || 9999))
              .map((sup: any, index: number) => (
                <div key={index} className="border-l-4 border-cyan-500 pl-4 py-2">
                  <h3 className="font-bold text-slate-800">
                    {sup.degree_level} - {sup.student_name}
                    {sup.completion_year ? (
                      <span className="text-slate-500 font-normal ml-2">
                        ({sup.completion_year})
                      </span>
                    ) : (
                      <span className="text-cyan-600 font-normal ml-2">(Ongoing)</span>
                    )}
                  </h3>
                  {sup.thesis_title && (
                    <p className="text-sm text-slate-600 mt-1 italic">"{sup.thesis_title}"</p>
                  )}
                  {sup.role && <p className="text-xs text-slate-500 mt-1">Role: {sup.role}</p>}
                </div>
              ))}
          </div>
        </div>
      )}

      {researcher.awards && researcher.awards.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-200">
          <div className="flex items-center gap-2 mb-6">
            <Award className="w-6 h-6 text-cyan-600" />
            <h2 className="text-2xl font-bold text-slate-800">Awards & Honors</h2>
          </div>
          <div className="space-y-3">
            {researcher.awards
              .sort((a: any, b: any) => b.award_year - a.award_year)
              .map((award: any, index: number) => (
                <div
                  key={index}
                  className="flex items-start gap-4 p-3 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <span className="text-amber-500 text-lg mt-1">🏆</span>
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-800">{award.award_name}</h3>
                    {award.awarding_institution && (
                      <p className="text-sm text-slate-600">{award.awarding_institution}</p>
                    )}
                    {award.description && (
                      <p className="text-sm text-slate-600 mt-1">{award.description}</p>
                    )}
                  </div>
                  <span className="text-sm text-slate-500">{award.award_year}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {researcher.memberships && researcher.memberships.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-200">
          <div className="flex items-center gap-2 mb-6">
            <Network className="w-6 h-6 text-cyan-600" />
            <h2 className="text-2xl font-bold text-slate-800">Professional Memberships</h2>
          </div>
          <ul className="space-y-2">
            {researcher.memberships
              .sort((a: any, b: any) => b.start_year - a.start_year)
              .map((mem: any, index: number) => (
                <li key={index} className="flex items-center justify-between py-2">
                  <span className="text-slate-800">{mem.organization}</span>
                  <span className="text-sm text-slate-500">
                    {mem.start_year}
                    {mem.end_year ? ` - ${mem.end_year}` : ' - Present'}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Delete Researcher?"
        message={`Are you sure you want to delete ${researcher.first_name} ${researcher.last_name} from AcademIQ?`}
        confirmText="Delete Permanently"
        confirmVariant="danger"
        details={deleteDetails}
      />
    </div>
  );
}
