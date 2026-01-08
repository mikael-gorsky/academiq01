import { CheckCircle2, User, GraduationCap, BookOpen, Briefcase, Award, Users, DollarSign, FileText, X } from 'lucide-react';

interface ParsedCV {
  personal: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    birthYear: number | null;
    birthCountry: string | null;
    maritalStatus: string | null;
    numChildren: number | null;
  };
  education: Array<{
    degreeType: string;
    institution: string;
    department: string | null;
    subject: string | null;
    specialization: string | null;
    awardDate: string | null;
    honors: string | null;
    country: string | null;
  }>;
  publications: Array<{
    title: string;
    publicationType: string;
    venueName: string | null;
    publicationYear: number;
    volume: string | null;
    issue: string | null;
    pages: string | null;
    coAuthors: string[];
    citationCount: number | null;
    url: string | null;
  }>;
  experience: Array<{
    institution: string;
    department: string | null;
    positionTitle: string;
    startDate: string | null;
    endDate: string | null;
    description: string | null;
    employmentType: string;
  }>;
  grants: Array<{
    title: string;
    fundingInstitution: string;
    amount: number | null;
    currencyCode: string | null;
    awardYear: number;
    duration: string | null;
    role: string | null;
  }>;
  teaching: Array<{
    courseTitle: string;
    educationLevel: string | null;
    institution: string | null;
    teachingPeriod: string | null;
  }>;
  supervision: Array<{
    studentName: string;
    degreeLevel: string;
    thesisTitle: string | null;
    completionYear: number | null;
    role: string | null;
  }>;
  memberships: Array<{
    organization: string;
    startYear: number;
    endYear: number | null;
  }>;
  awards: Array<{
    awardName: string;
    awardingInstitution: string | null;
    awardYear: number;
    description: string | null;
  }>;
}

interface CVPreviewProps {
  parsedData: ParsedCV;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export default function CVPreview({ parsedData, onConfirm, onCancel, isSubmitting }: CVPreviewProps) {
  const { personal, education, publications, experience, grants, teaching, supervision, memberships, awards } = parsedData;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            <h2 className="text-2xl font-bold text-slate-800">Review Processed Information</h2>
          </div>
          <button
            onClick={onCancel}
            className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-6 border border-blue-200">
            <div className="flex items-center gap-3 mb-4">
              <User className="w-5 h-5 text-blue-800" />
              <h3 className="text-lg font-bold text-slate-800">Personal Information</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-600">Name</p>
                <p className="font-semibold text-slate-800">{personal.firstName} {personal.lastName}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Email</p>
                <p className="font-semibold text-slate-800">{personal.email}</p>
              </div>
              {personal.phone && (
                <div>
                  <p className="text-sm text-slate-600">Phone</p>
                  <p className="font-semibold text-slate-800">{personal.phone}</p>
                </div>
              )}
              {personal.birthYear && (
                <div>
                  <p className="text-sm text-slate-600">Birth Year</p>
                  <p className="font-semibold text-slate-800">{personal.birthYear}</p>
                </div>
              )}
              {personal.birthCountry && (
                <div>
                  <p className="text-sm text-slate-600">Birth Country</p>
                  <p className="font-semibold text-slate-800">{personal.birthCountry}</p>
                </div>
              )}
              {personal.maritalStatus && (
                <div>
                  <p className="text-sm text-slate-600">Marital Status</p>
                  <p className="font-semibold text-slate-800">{personal.maritalStatus}</p>
                </div>
              )}
            </div>
          </div>

          {education.length > 0 && (
            <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <GraduationCap className="w-5 h-5 text-blue-800" />
                <h3 className="text-lg font-bold text-slate-800">Education ({education.length})</h3>
              </div>
              <div className="space-y-3">
                {education.map((edu, index) => (
                  <div key={index} className="bg-white rounded-lg p-4 border border-slate-200">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-slate-800">{edu.degreeType}</p>
                        <p className="text-sm text-slate-600">{edu.institution}</p>
                        {edu.subject && <p className="text-sm text-slate-500">{edu.subject}</p>}
                      </div>
                      <div className="text-right">
                        {edu.awardDate && <p className="text-sm font-medium text-slate-700">{edu.awardDate}</p>}
                        {edu.honors && <p className="text-xs text-emerald-600 font-medium">{edu.honors}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {publications.length > 0 && (
            <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <BookOpen className="w-5 h-5 text-blue-800" />
                <h3 className="text-lg font-bold text-slate-800">Publications ({publications.length})</h3>
              </div>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {publications.map((pub, index) => (
                  <div key={index} className="bg-white rounded-lg p-4 border border-slate-200">
                    <p className="font-semibold text-slate-800 mb-2">{pub.title}</p>
                    <div className="flex items-center gap-4 text-sm text-slate-600">
                      <span>{pub.publicationYear}</span>
                      <span>{pub.publicationType}</span>
                      {pub.citationCount && <span className="text-emerald-600">Cited {pub.citationCount} times</span>}
                    </div>
                    {pub.coAuthors.length > 0 && (
                      <p className="text-xs text-slate-500 mt-2">Co-authors: {pub.coAuthors.slice(0, 3).join(', ')}{pub.coAuthors.length > 3 ? '...' : ''}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {experience.length > 0 && (
            <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <Briefcase className="w-5 h-5 text-blue-800" />
                <h3 className="text-lg font-bold text-slate-800">Experience ({experience.length})</h3>
              </div>
              <div className="space-y-3">
                {experience.map((exp, index) => (
                  <div key={index} className="bg-white rounded-lg p-4 border border-slate-200">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-slate-800">{exp.positionTitle}</p>
                        {exp.institution && <p className="text-sm text-slate-600">{exp.institution}</p>}
                        {exp.department && <p className="text-sm text-slate-500">{exp.department}</p>}
                      </div>
                      <div className="text-right text-sm text-slate-600">
                        {exp.startDate} - {exp.endDate || 'Present'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {grants.length > 0 && (
            <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <DollarSign className="w-5 h-5 text-blue-800" />
                <h3 className="text-lg font-bold text-slate-800">Research Grants ({grants.length})</h3>
              </div>
              <div className="space-y-3">
                {grants.map((grant, index) => (
                  <div key={index} className="bg-white rounded-lg p-4 border border-slate-200">
                    <p className="font-semibold text-slate-800">{grant.title}</p>
                    <p className="text-sm text-slate-600">{grant.fundingInstitution}</p>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <span className="text-slate-600">{grant.awardYear}</span>
                      {grant.amount && grant.currencyCode && (
                        <span className="text-emerald-600 font-medium">{grant.amount.toLocaleString()} {grant.currencyCode}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {awards.length > 0 && (
            <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <Award className="w-5 h-5 text-blue-800" />
                <h3 className="text-lg font-bold text-slate-800">Awards & Honors ({awards.length})</h3>
              </div>
              <div className="space-y-3">
                {awards.map((award, index) => (
                  <div key={index} className="bg-white rounded-lg p-4 border border-slate-200">
                    <p className="font-semibold text-slate-800">{award.awardName}</p>
                    {award.awardingInstitution && <p className="text-sm text-slate-600">{award.awardingInstitution}</p>}
                    <p className="text-sm text-slate-500 mt-1">{award.awardYear}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {supervision.length > 0 && (
            <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <Users className="w-5 h-5 text-blue-800" />
                <h3 className="text-lg font-bold text-slate-800">Student Supervision ({supervision.length})</h3>
              </div>
              <div className="space-y-2">
                {supervision.map((student, index) => (
                  <div key={index} className="bg-white rounded-lg p-3 border border-slate-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-800">{student.studentName}</p>
                        <p className="text-sm text-slate-600">{student.degreeLevel}</p>
                      </div>
                      {student.completionYear && (
                        <p className="text-sm text-slate-600">{student.completionYear}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {memberships.length > 0 && (
            <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <FileText className="w-5 h-5 text-blue-800" />
                <h3 className="text-lg font-bold text-slate-800">Professional Memberships ({memberships.length})</h3>
              </div>
              <div className="space-y-2">
                {memberships.map((membership, index) => (
                  <div key={index} className="bg-white rounded-lg p-3 border border-slate-200 flex items-center justify-between">
                    <p className="font-semibold text-slate-800">{membership.organization}</p>
                    <p className="text-sm text-slate-600">
                      {membership.startYear} - {membership.endYear || 'Present'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 mt-8 pt-6 border-t border-slate-200">
          <button
            onClick={onConfirm}
            disabled={isSubmitting}
            className="flex-1 px-6 py-3 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Indexing Researcher...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                <span>Index This Researcher</span>
              </>
            )}
          </button>
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-6 py-3 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
