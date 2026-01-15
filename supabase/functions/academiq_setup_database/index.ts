import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const statements = [
      `CREATE TABLE IF NOT EXISTS academiq_persons (
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
      )`,
      `CREATE TABLE IF NOT EXISTS academiq_education (
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
      )`,
      `CREATE TABLE IF NOT EXISTS academiq_publications (
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
      )`,
      `CREATE TABLE IF NOT EXISTS academiq_experience (
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
      )`,
      `CREATE TABLE IF NOT EXISTS academiq_grants (
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
      )`,
      `CREATE TABLE IF NOT EXISTS academiq_teaching (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        person_id uuid NOT NULL REFERENCES academiq_persons(id) ON DELETE CASCADE,
        course_title text NOT NULL,
        education_level text,
        institution text,
        teaching_period text,
        created_at timestamptz DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS academiq_supervision (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        person_id uuid NOT NULL REFERENCES academiq_persons(id) ON DELETE CASCADE,
        student_name text NOT NULL,
        degree_level text,
        thesis_title text,
        completion_year integer,
        role text,
        created_at timestamptz DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS academiq_memberships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        person_id uuid NOT NULL REFERENCES academiq_persons(id) ON DELETE CASCADE,
        organization text NOT NULL,
        start_year integer,
        end_year integer,
        created_at timestamptz DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS academiq_awards (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        person_id uuid NOT NULL REFERENCES academiq_persons(id) ON DELETE CASCADE,
        award_name text NOT NULL,
        awarding_institution text,
        award_year integer,
        description text,
        created_at timestamptz DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS academiq_parsing_lessons (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        cv_filename text NOT NULL,
        issue_type text NOT NULL,
        issue_description text NOT NULL,
        expected_behavior text,
        actual_behavior text,
        resolution_notes text,
        created_at timestamptz DEFAULT now()
      )`,
    ];

    const indexStatements = [
      `CREATE INDEX IF NOT EXISTS idx_persons_name ON academiq_persons(first_name, last_name)`,
      `CREATE INDEX IF NOT EXISTS idx_persons_email ON academiq_persons(email)`,
      `CREATE INDEX IF NOT EXISTS idx_education_person ON academiq_education(person_id)`,
      `CREATE INDEX IF NOT EXISTS idx_publications_person ON academiq_publications(person_id)`,
      `CREATE INDEX IF NOT EXISTS idx_publications_year ON academiq_publications(publication_year)`,
      `CREATE INDEX IF NOT EXISTS idx_experience_person ON academiq_experience(person_id)`,
      `CREATE INDEX IF NOT EXISTS idx_grants_person ON academiq_grants(person_id)`,
      `CREATE INDEX IF NOT EXISTS idx_teaching_person ON academiq_teaching(person_id)`,
      `CREATE INDEX IF NOT EXISTS idx_supervision_person ON academiq_supervision(person_id)`,
      `CREATE INDEX IF NOT EXISTS idx_memberships_person ON academiq_memberships(person_id)`,
      `CREATE INDEX IF NOT EXISTS idx_awards_person ON academiq_awards(person_id)`,
    ];

    const securityStatements = [
      `ALTER TABLE academiq_persons DISABLE ROW LEVEL SECURITY`,
      `ALTER TABLE academiq_education DISABLE ROW LEVEL SECURITY`,
      `ALTER TABLE academiq_publications DISABLE ROW LEVEL SECURITY`,
      `ALTER TABLE academiq_experience DISABLE ROW LEVEL SECURITY`,
      `ALTER TABLE academiq_grants DISABLE ROW LEVEL SECURITY`,
      `ALTER TABLE academiq_teaching DISABLE ROW LEVEL SECURITY`,
      `ALTER TABLE academiq_supervision DISABLE ROW LEVEL SECURITY`,
      `ALTER TABLE academiq_memberships DISABLE ROW LEVEL SECURITY`,
      `ALTER TABLE academiq_awards DISABLE ROW LEVEL SECURITY`,
      `ALTER TABLE academiq_parsing_lessons DISABLE ROW LEVEL SECURITY`,
      `GRANT ALL ON TABLE academiq_persons TO anon, authenticated`,
      `GRANT ALL ON TABLE academiq_education TO anon, authenticated`,
      `GRANT ALL ON TABLE academiq_publications TO anon, authenticated`,
      `GRANT ALL ON TABLE academiq_experience TO anon, authenticated`,
      `GRANT ALL ON TABLE academiq_grants TO anon, authenticated`,
      `GRANT ALL ON TABLE academiq_teaching TO anon, authenticated`,
      `GRANT ALL ON TABLE academiq_supervision TO anon, authenticated`,
      `GRANT ALL ON TABLE academiq_memberships TO anon, authenticated`,
      `GRANT ALL ON TABLE academiq_awards TO anon, authenticated`,
      `GRANT ALL ON TABLE academiq_parsing_lessons TO anon, authenticated`,
    ];

    return new Response(
      JSON.stringify({
        success: false,
        error: "Direct SQL execution is not available. Please create tables using migrations or the Supabase dashboard.",
        sql: [...statements, ...indexStatements, ...securityStatements].join(';\n\n') + ';'
      }),
      {
        status: 501,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});