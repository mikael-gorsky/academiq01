import { supabase } from './supabase';
import type { Person, Education, Publication, Experience } from './supabase';

function normalizeDate(dateValue: string | null | undefined): string | null {
  if (!dateValue) return null;

  const trimmed = dateValue.trim();
  if (!trimmed) return null;

  if (/^\d{4}$/.test(trimmed)) {
    return `${trimmed}-01-01`;
  }

  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return `${trimmed}-01`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const yearMatch = trimmed.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    return `${yearMatch[0]}-01-01`;
  }

  return null;
}

export interface CVFormData {
  person: {
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    birth_year?: number;
    birth_country?: string;
    marital_status?: string;
    num_children?: number;
    pdf_filename?: string;
  };
  education: Array<{
    degree_type?: string;
    institution: string;
    department?: string;
    subject?: string;
    specialization?: string;
    award_date?: string;
    honors?: string;
    country?: string;
  }>;
  publications: Array<{
    title: string;
    publication_type?: string;
    venue_name?: string;
    publication_year: number;
    volume?: string;
    issue?: string;
    pages?: string;
    co_authors?: string[];
    citation_count?: number;
    url?: string;
  }>;
  experience: Array<{
    institution: string;
    department?: string;
    position_title: string;
    start_date?: string;
    end_date?: string;
    description?: string;
    employment_type?: string;
  }>;
}

export async function checkEmailExists(email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();

  const { data, error } = await supabase
    .from('academiq_persons')
    .select('id')
    .ilike('email', normalizedEmail)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data !== null;
}

export async function insertCV(formData: CVFormData): Promise<string> {
  const normalizedEmail = formData.person.email ? formData.person.email.trim().toLowerCase() : null;

  const { data: person, error: personError } = await supabase
    .from('academiq_persons')
    .insert({
      first_name: formData.person.first_name,
      last_name: formData.person.last_name,
      email: normalizedEmail,
      phone: formData.person.phone || null,
      birth_year: formData.person.birth_year || null,
      birth_country: formData.person.birth_country || null,
      marital_status: formData.person.marital_status || null,
      num_children: formData.person.num_children || 0,
      pdf_filename: formData.person.pdf_filename || null,
    })
    .select()
    .single();

  if (personError) {
    if (personError.code === '23505') {
      throw new Error(`This CV has already been processed. A person with email "${normalizedEmail}" already exists in the database.`);
    }
    throw personError;
  }

  const personId = person.id;

  if (formData.education.length > 0) {
    const educationRecords = formData.education.map(edu => ({
      person_id: personId,
      degree_type: edu.degree_type,
      institution: edu.institution,
      department: edu.department,
      subject: edu.subject,
      specialization: edu.specialization,
      award_date: normalizeDate(edu.award_date || null),
      honors: edu.honors,
      country: edu.country,
    }));

    const { error: eduError } = await supabase
      .from('academiq_education')
      .insert(educationRecords);

    if (eduError) {
      throw eduError;
    }
  }

  if (formData.publications.length > 0) {
    const publicationRecords = formData.publications.map(pub => ({
      person_id: personId,
      ...pub,
    }));

    const { error: pubError } = await supabase
      .from('academiq_publications')
      .insert(publicationRecords);

    if (pubError) {
      throw pubError;
    }
  }

  if (formData.experience.length > 0) {
    const experienceRecords = formData.experience.map(exp => ({
      person_id: personId,
      institution: exp.institution,
      department: exp.department,
      position_title: exp.position_title,
      start_date: normalizeDate(exp.start_date || null),
      end_date: normalizeDate(exp.end_date || null),
      description: exp.description,
      employment_type: exp.employment_type,
    }));

    const { error: expError } = await supabase
      .from('academiq_experience')
      .insert(experienceRecords);

    if (expError) {
      throw expError;
    }
  }

  return personId;
}

export async function getAllPersons() {
  const { data, error } = await supabase
    .from('academiq_persons')
    .select(`
      *,
      education:academiq_education(*),
      publications:academiq_publications(*),
      experience:academiq_experience(*)
    `)
    .order('imported_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data;
}

export async function getPersonById(id: string) {
  const { data, error } = await supabase
    .from('academiq_persons')
    .select(`
      *,
      education:academiq_education(*),
      publications:academiq_publications(*),
      experience:academiq_experience(*),
      grants:academiq_grants(*),
      teaching:academiq_teaching(*),
      supervision:academiq_supervision(*),
      memberships:academiq_memberships(*),
      awards:academiq_awards(*)
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function deletePerson(id: string): Promise<void> {
  const { error } = await supabase
    .from('academiq_persons')
    .delete()
    .eq('id', id);

  if (error) {
    throw error;
  }
}

export async function deletePersons(ids: string[]): Promise<void> {
  const { error } = await supabase
    .from('academiq_persons')
    .delete()
    .in('id', ids);

  if (error) {
    throw error;
  }
}

export async function getAnalyticsData() {
  const { data: persons, error: personsError } = await supabase
    .from('academiq_persons')
    .select('id, birth_year, imported_at');

  const { data: publications, error: pubsError } = await supabase
    .from('academiq_publications')
    .select('person_id, publication_year');

  const { data: education, error: eduError } = await supabase
    .from('academiq_education')
    .select('person_id, award_date, degree_type');

  const { data: grants, error: grantsError } = await supabase
    .from('academiq_grants')
    .select('id');

  if (personsError || pubsError || eduError || grantsError) {
    throw personsError || pubsError || eduError || grantsError;
  }

  const totalPersons = persons?.length || 0;
  const totalPublications = publications?.length || 0;
  const totalGrants = grants?.length || 0;

  const currentYear = new Date().getFullYear();

  const ages = persons
    ?.filter(p => p.birth_year)
    .map(p => currentYear - p.birth_year!) || [];
  const averageAge = ages.length > 0 ? Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length) : 0;

  const ageDistribution: Record<string, number> = {};
  ages.forEach(age => {
    const bin = `${Math.floor(age / 5) * 5}-${Math.floor(age / 5) * 5 + 4}`;
    ageDistribution[bin] = (ageDistribution[bin] || 0) + 1;
  });

  const isTerminalDegree = (degreeType: string | null): boolean => {
    if (!degreeType) return false;
    const normalized = degreeType.toLowerCase().trim();
    return /\b(ph\.?d|doctorate|m\.?sc|m\.?s|master|b\.?sc|b\.?s|bachelor|mba|ma|ba)\b/i.test(normalized);
  };

  const yearsSinceDegreeData = persons?.map(p => {
    const personEdu = education?.filter(e => e.person_id === p.id && isTerminalDegree(e.degree_type));
    if (!personEdu || personEdu.length === 0) return null;
    const latestDegree = personEdu.reduce((latest, edu) => {
      if (!edu.award_date) return latest;
      if (!latest) return edu;
      return new Date(edu.award_date) > new Date(latest.award_date!) ? edu : latest;
    }, null as typeof personEdu[0] | null);
    if (!latestDegree?.award_date) return null;
    return currentYear - new Date(latestDegree.award_date).getFullYear();
  }).filter(y => y !== null) as number[] || [];

  const avgYearsSinceDegree = yearsSinceDegreeData.length > 0
    ? Math.round(yearsSinceDegreeData.reduce((sum, y) => sum + y, 0) / yearsSinceDegreeData.length)
    : 0;

  const degreeDistribution: Record<string, number> = {};
  yearsSinceDegreeData.forEach(years => {
    const bin = `${Math.floor(years / 5) * 5}-${Math.floor(years / 5) * 5 + 4}`;
    degreeDistribution[bin] = (degreeDistribution[bin] || 0) + 1;
  });

  const pubCountDistribution = {
    '0-5': 0,
    '6-10': 0,
    '11-20': 0,
    '21-50': 0,
    '50+': 0,
  };

  persons?.forEach(p => {
    const count = publications?.filter(pub => pub.person_id === p.id).length || 0;
    if (count <= 5) pubCountDistribution['0-5']++;
    else if (count <= 10) pubCountDistribution['6-10']++;
    else if (count <= 20) pubCountDistribution['11-20']++;
    else if (count <= 50) pubCountDistribution['21-50']++;
    else pubCountDistribution['50+']++;
  });

  const yearsSinceLastPubData = persons?.map(p => {
    const personPubs = publications?.filter(pub => pub.person_id === p.id);
    if (!personPubs || personPubs.length === 0) return null;
    const latestYear = Math.max(...personPubs.map(pub => pub.publication_year));
    return currentYear - latestYear;
  }).filter(y => y !== null) as number[] || [];

  const avgYearsSinceLastPub = yearsSinceLastPubData.length > 0
    ? Math.round(yearsSinceLastPubData.reduce((sum, y) => sum + y, 0) / yearsSinceLastPubData.length)
    : 0;

  const lastPubDistribution = {
    '0-2': 0,
    '3-5': 0,
    '6-10': 0,
    '10+': 0,
  };

  yearsSinceLastPubData.forEach(years => {
    if (years <= 2) lastPubDistribution['0-2']++;
    else if (years <= 5) lastPubDistribution['3-5']++;
    else if (years <= 10) lastPubDistribution['6-10']++;
    else lastPubDistribution['10+']++;
  });

  const recentPubCounts = persons?.map(p => {
    const personPubs = publications?.filter(
      pub => pub.person_id === p.id && pub.publication_year >= currentYear - 5
    );
    return personPubs?.length || 0;
  }) || [];

  const avgRecentPublications = recentPubCounts.length > 0
    ? recentPubCounts.reduce((sum, count) => sum + count, 0) / recentPubCounts.length
    : 0;

  const recentPubDistribution = {
    '0': 0,
    '1-2': 0,
    '3-5': 0,
    '6-10': 0,
    '10+': 0,
  };

  recentPubCounts.forEach(count => {
    if (count === 0) recentPubDistribution['0']++;
    else if (count <= 2) recentPubDistribution['1-2']++;
    else if (count <= 5) recentPubDistribution['3-5']++;
    else if (count <= 10) recentPubDistribution['6-10']++;
    else recentPubDistribution['10+']++;
  });

  const importDates = persons?.map(p => new Date(p.imported_at)) || [];
  const dateRange = importDates.length > 0
    ? {
        earliest: new Date(Math.min(...importDates.map(d => d.getTime()))).toISOString(),
        latest: new Date(Math.max(...importDates.map(d => d.getTime()))).toISOString(),
      }
    : null;

  return {
    totalPersons,
    totalPublications,
    totalGrants,
    avgPublicationsPerCV: totalPersons > 0 ? totalPublications / totalPersons : 0,
    averageAge,
    ageDistribution,
    avgYearsSinceDegree,
    degreeDistribution,
    pubCountDistribution,
    avgYearsSinceLastPub,
    lastPubDistribution,
    avgRecentPublications,
    recentPubDistribution,
    dateRange,
  };
}

export async function uploadPDF(file: File): Promise<string> {
  const timestamp = Date.now();
  const filename = `${timestamp}-${file.name}`;

  const { data, error } = await supabase.storage
    .from('academiq-cvs')
    .upload(filename, file, {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (error) {
    throw error;
  }

  return filename;
}

export interface ParsedCVData {
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

export interface ParseProgressEvent {
  stage: string;
  message: string;
  timestamp?: number;
  details?: Record<string, any>;
}

export async function parseCV(
  pdfFilename: string,
  onProgress?: (event: ParseProgressEvent) => void
): Promise<ParsedCVData> {
  return new Promise((resolve, reject) => {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/academiq-parse-cv?pdfFilename=${encodeURIComponent(pdfFilename)}&apikey=${import.meta.env.VITE_SUPABASE_ANON_KEY}`;

    const eventSource = new EventSource(apiUrl);

    const timeoutId = setTimeout(() => {
      eventSource.close();
      reject(new Error('CV parsing timed out after 7 minutes. Please try again or contact support.'));
    }, 420000);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (onProgress) {
          onProgress({
            stage: data.stage,
            message: data.message,
            timestamp: data.timestamp,
            details: data.details,
          });
        }

        if (data.stage === 'complete') {
          clearTimeout(timeoutId);
          eventSource.close();
          resolve(data.result);
        } else if (data.stage === 'error') {
          clearTimeout(timeoutId);
          eventSource.close();
          reject(new Error(data.message || 'CV parsing failed'));
        }
      } catch (err) {
        clearTimeout(timeoutId);
        eventSource.close();
        reject(new Error('Failed to parse server response'));
      }
    };

    eventSource.onerror = (error) => {
      clearTimeout(timeoutId);
      eventSource.close();
      reject(new Error('Connection to parsing service failed'));
    };
  });
}

export async function checkDuplicateCV(pdfFilename: string): Promise<void> {
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-duplicate-cv`;
  const headers = {
    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pdfFilename }),
    });

    if (!response.ok) {
      const errorData = await response.json();

      if (response.status === 409 && errorData.error === 'DUPLICATE_CV') {
        throw new Error(`A person with this name has already been processed. ${errorData.existingPerson?.name || ''} was already imported on ${errorData.existingPerson?.processedAt ? new Date(errorData.existingPerson.processedAt).toLocaleDateString() : 'a previous date'}.`);
      }

      throw new Error(errorData.message || 'Failed to check for duplicates');
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to check for duplicates');
  }
}

export async function saveParsedCV(parsedData: ParsedCVData, pdfFilename: string): Promise<string> {
  const normalizedEmail = parsedData.personal.email ? parsedData.personal.email.trim().toLowerCase() : null;

  const { data: person, error: personError } = await supabase
    .from('academiq_persons')
    .insert({
      first_name: parsedData.personal.firstName,
      last_name: parsedData.personal.lastName,
      email: normalizedEmail,
      phone: parsedData.personal.phone,
      birth_year: parsedData.personal.birthYear,
      birth_country: parsedData.personal.birthCountry,
      marital_status: parsedData.personal.maritalStatus,
      num_children: parsedData.personal.numChildren || 0,
      pdf_filename: pdfFilename,
    })
    .select()
    .single();

  if (personError) {
    if (personError.code === '23505') {
      throw new Error(`This CV has already been processed. A person with email "${normalizedEmail}" already exists in the database.`);
    }
    throw personError;
  }

  const personId = person.id;

  if (parsedData.education.length > 0) {
    const educationRecords = parsedData.education
      .filter(edu => edu.institution)
      .map(edu => ({
        person_id: personId,
        degree_type: edu.degreeType,
        institution: edu.institution,
        department: edu.department,
        subject: edu.subject,
        specialization: edu.specialization,
        award_date: normalizeDate(edu.awardDate),
        honors: edu.honors,
        country: edu.country,
      }));

    if (educationRecords.length > 0) {
      const { error: eduError } = await supabase
        .from('academiq_education')
        .insert(educationRecords);

      if (eduError) {
        throw eduError;
      }
    }
  }

  if (parsedData.publications.length > 0) {
    const publicationRecords = parsedData.publications
      .filter(pub => pub.publicationYear && pub.title)
      .map(pub => ({
        person_id: personId,
        title: pub.title,
        publication_type: pub.publicationType,
        venue_name: pub.venueName,
        publication_year: pub.publicationYear,
        volume: pub.volume,
        issue: pub.issue,
        pages: pub.pages,
        co_authors: pub.coAuthors,
        citation_count: pub.citationCount,
        url: pub.url,
      }));

    if (publicationRecords.length > 0) {
      const { error: pubError } = await supabase
        .from('academiq_publications')
        .insert(publicationRecords);

      if (pubError) {
        throw pubError;
      }
    }
  }

  if (parsedData.experience.length > 0) {
    const experienceRecords = parsedData.experience
      .filter(exp => exp.institution && exp.positionTitle)
      .map(exp => ({
        person_id: personId,
        institution: exp.institution,
        department: exp.department,
        position_title: exp.positionTitle,
        start_date: normalizeDate(exp.startDate),
        end_date: normalizeDate(exp.endDate),
        description: exp.description,
        employment_type: exp.employmentType,
      }));

    if (experienceRecords.length > 0) {
      const { error: expError } = await supabase
        .from('academiq_experience')
        .insert(experienceRecords);

      if (expError) {
        throw expError;
      }
    }
  }

  if (parsedData.grants.length > 0) {
    const grantRecords = parsedData.grants
      .filter(grant => grant.title && grant.fundingInstitution)
      .map(grant => ({
        person_id: personId,
        title: grant.title,
        funding_institution: grant.fundingInstitution,
        amount: grant.amount,
        currency_code: grant.currencyCode,
        award_year: grant.awardYear,
        duration: grant.duration,
        role: grant.role,
      }));

    if (grantRecords.length > 0) {
      const { error: grantError } = await supabase
        .from('academiq_grants')
        .insert(grantRecords);

      if (grantError) {
        throw grantError;
      }
    }
  }

  if (parsedData.teaching.length > 0) {
    const teachingRecords = parsedData.teaching
      .filter(teach => teach.courseTitle)
      .map(teach => ({
        person_id: personId,
        course_title: teach.courseTitle,
        education_level: teach.educationLevel,
        institution: teach.institution,
        teaching_period: teach.teachingPeriod,
      }));

    if (teachingRecords.length > 0) {
      const { error: teachError } = await supabase
        .from('academiq_teaching')
        .insert(teachingRecords);

      if (teachError) {
        throw teachError;
      }
    }
  }

  if (parsedData.supervision.length > 0) {
    const supervisionRecords = parsedData.supervision
      .filter(sup => sup.studentName)
      .map(sup => ({
        person_id: personId,
        student_name: sup.studentName,
        degree_level: sup.degreeLevel,
        thesis_title: sup.thesisTitle,
        completion_year: sup.completionYear,
        role: sup.role,
      }));

    if (supervisionRecords.length > 0) {
      const { error: supError } = await supabase
        .from('academiq_supervision')
        .insert(supervisionRecords);

      if (supError) {
        throw supError;
      }
    }
  }

  if (parsedData.memberships.length > 0) {
    const membershipRecords = parsedData.memberships
      .filter(mem => mem.organization)
      .map(mem => ({
        person_id: personId,
        organization: mem.organization,
        start_year: mem.startYear,
        end_year: mem.endYear,
      }));

    if (membershipRecords.length > 0) {
      const { error: memError } = await supabase
        .from('academiq_memberships')
        .insert(membershipRecords);

      if (memError) {
        throw memError;
      }
    }
  }

  if (parsedData.awards.length > 0) {
    const awardRecords = parsedData.awards
      .filter(award => award.awardName)
      .map(award => ({
        person_id: personId,
        award_name: award.awardName,
        awarding_institution: award.awardingInstitution,
        award_year: award.awardYear,
        description: award.description,
      }));

    if (awardRecords.length > 0) {
      const { error: awardError } = await supabase
        .from('academiq_awards')
        .insert(awardRecords);

      if (awardError) {
        throw awardError;
      }
    }
  }

  return personId;
}