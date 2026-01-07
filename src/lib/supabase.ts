import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Person = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  birth_year?: number;
  birth_country?: string;
  marital_status?: string;
  num_children?: number;
  imported_at: string;
  pdf_filename?: string;
  metadata?: Record<string, unknown>;
};

export type Education = {
  id: string;
  person_id: string;
  degree_type?: string;
  institution: string;
  department?: string;
  subject?: string;
  specialization?: string;
  award_date?: string;
  honors?: string;
  country?: string;
};

export type Publication = {
  id: string;
  person_id: string;
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
  indexed_at: string;
};

export type Experience = {
  id: string;
  person_id: string;
  institution: string;
  department?: string;
  position_title: string;
  start_date?: string;
  end_date?: string;
  description?: string;
  employment_type?: string;
};

export type Grant = {
  id: string;
  person_id: string;
  title: string;
  funding_institution: string;
  amount?: number;
  currency_code?: string;
  award_year?: number;
  duration?: string;
  role?: string;
};

export type Teaching = {
  id: string;
  person_id: string;
  course_title: string;
  education_level?: string;
  institution?: string;
  teaching_period?: string;
};

export type Supervision = {
  id: string;
  person_id: string;
  student_name: string;
  degree_level?: string;
  thesis_title?: string;
  completion_year?: number;
  role?: string;
};

export type Membership = {
  id: string;
  person_id: string;
  organization: string;
  start_year?: number;
  end_year?: number;
};

export type Award = {
  id: string;
  person_id: string;
  award_name: string;
  awarding_institution?: string;
  award_year?: number;
  description?: string;
};
