import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as pdfjsLib from "npm:pdfjs-dist@4.0.379";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  model: "gpt-5.2-2025-12-11",
  maxRetries: 3,
  retryDelayMs: 1000,
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

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
    currencyCode: string;
    awardYear: number | null;
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
    degreeLevel: string | null;
    thesisTitle: string | null;
    completionYear: number | null;
    role: string | null;
  }>;
  memberships: Array<{
    organization: string;
    startYear: number | null;
    endYear: number | null;
  }>;
  awards: Array<{
    awardName: string;
    awardingInstitution: string | null;
    awardYear: number | null;
    description: string | null;
  }>;
}

// ============================================================================
// PDF TEXT EXTRACTION
// ============================================================================

async function extractTextFromPDF(arrayBuffer: ArrayBuffer): Promise<string> {
  const uint8Array = new Uint8Array(arrayBuffer);

  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    useSystemFonts: true,
    disableFontFace: true,
    standardFontDataUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/standard_fonts/",
  });

  const pdf = await loadingTask.promise;
  const allLines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });

    // Extract items with position
    const items = textContent.items
      .filter((item: any) => 'str' in item && item.str.trim().length > 0)
      .map((item: any) => ({
        text: item.str,
        x: item.transform[4],
        y: Math.round(viewport.height - item.transform[5]),
      }));

    // Group by Y position to form lines
    const lineMap = new Map<number, any[]>();
    for (const item of items) {
      const yKey = Math.round(item.y / 8) * 8;
      if (!lineMap.has(yKey)) lineMap.set(yKey, []);
      lineMap.get(yKey)!.push(item);
    }

    // Sort and join
    const sortedYs = Array.from(lineMap.keys()).sort((a, b) => a - b);
    for (const y of sortedYs) {
      const lineItems = lineMap.get(y)!.sort((a, b) => a.x - b.x);
      const lineText = lineItems.map(item => item.text).join(' ').trim();
      if (lineText.length > 0) {
        allLines.push(lineText);
      }
    }
    
    allLines.push(`\n[PAGE ${pageNum} END]\n`);
  }

  return allLines.join('\n');
}

function removeSensitiveData(text: string): string {
  let cleaned = text;
  // Remove Israeli ID numbers
  cleaned = cleaned.replace(/\bID\s*#?\s*\d{9}\b/gi, '[ID REDACTED]');
  cleaned = cleaned.replace(/\b\d{9}\b/g, '[ID REDACTED]');
  // Remove formatted IDs
  cleaned = cleaned.replace(/\b\d{2,3}[-.\s]\d{3,6}[-.\s]\d{3,4}\b/g, '[ID REDACTED]');
  // Remove home addresses
  cleaned = cleaned.replace(/Home\s*Address[:\s]+[^\n]+/gi, '[ADDRESS REDACTED]');
  return cleaned;
}

// ============================================================================
// SINGLE LLM CALL - FULL EXTRACTION
// ============================================================================

async function extractAllFromCV(cvText: string): Promise<ParsedCV> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const systemPrompt = `You are an expert CV parser for an academic research database. Extract ALL information from this academic CV into structured JSON.

CRITICAL INSTRUCTIONS:
1. The person's NAME is at the top of the CV. Ignore titles like "Ph.D.", "Dr.", "Prof." when extracting first/last name.
2. Extract EVERY education entry - look for Ph.D., M.A., M.Sc., B.A., B.Sc., certificates, etc.
3. Extract EVERY work position - academic appointments, professional experience, administrative roles.
4. For dates: use the year (e.g., "2024") or year range start (e.g., "2020" from "2020-present").
5. Pay attention to section headers - they may be numbered (1. 2. 3.) or lettered (A. B. C.) or have various names.

=== PUBLICATIONS - STRICT DEFINITION ===

INCLUDE as publications ONLY these types of scholarly work authored by the candidate:
- Journal articles (refereed and non-refereed)
- Conference papers published in proceedings
- Books authored or co-authored
- Book chapters
- Technical reports and working papers
- Preprints

NEVER INCLUDE AS PUBLICATIONS - THESE ARE NOT ACADEMIC PUBLICATIONS:
- PATENTS (regular patents, provisional patents, patent applications) - EXCLUDE ALL
- Articles written ABOUT the candidate by journalists
- Press releases or media coverage about the candidate
- Newspaper articles mentioning the candidate
- Product documentation
- Blog posts
- Presentations or talks (unless published in proceedings)

If a CV section is labeled "Patents", "H1. PATENTS", "Provisional Patents", etc. - DO NOT extract those items as publications.
If an item mentions "Patent No.", "US Patent", "Provisional patent" - it is NOT a publication.

=== END PUBLICATIONS DEFINITION ===

SECTION NAME VARIATIONS TO RECOGNIZE:
- Education: "Higher Education", "Academic Background", "Degrees", "Undergraduate and Graduate Studies"
- Experience: "Academic Ranks", "Academic Experience", "Professional Experience", "Employment", "Positions"
- Publications: "Publications", "Research Output", "Papers", "Articles", "Refereed Articles"
- Grants: "Research Grants", "Funding", "Grants Awarded"
- Teaching: "Teaching", "Courses Taught", "Teaching Experience"
- Awards: "Awards", "Honors", "Scholarships", "Prizes"

Return ONLY valid JSON with this exact structure:
{
  "personal": {
    "firstName": "string",
    "lastName": "string", 
    "email": "string or empty",
    "phone": "string or null",
    "birthYear": number or null,
    "birthCountry": "string or null",
    "maritalStatus": "string or null",
    "numChildren": number or null
  },
  "education": [
    {
      "degreeType": "Ph.D.|M.A.|M.Sc.|B.A.|B.Sc.|Certificate|Postdoc|etc.",
      "institution": "full institution name",
      "department": "string or null",
      "subject": "field of study or null",
      "specialization": "string or null",
      "awardDate": "year as string or null",
      "honors": "string or null",
      "country": "string or null"
    }
  ],
  "publications": [
    {
      "title": "full title",
      "publicationType": "journal|conference|book|book_chapter|technical_report|preprint|other",
      "venueName": "journal/conference/publisher name or null",
      "publicationYear": number,
      "volume": "string or null",
      "issue": "string or null",
      "pages": "string or null",
      "coAuthors": ["author names"],
      "citationCount": number or null,
      "url": "string or null"
    }
  ],
  "experience": [
    {
      "institution": "organization name",
      "department": "string or null",
      "positionTitle": "job title",
      "startDate": "year as string or null",
      "endDate": "year as string, 'present', or null",
      "description": "string or null",
      "employmentType": "full-time|part-time|visiting|adjunct|emeritus"
    }
  ],
  "grants": [
    {
      "title": "grant title/description",
      "fundingInstitution": "funder name",
      "amount": number or null,
      "currencyCode": "USD|EUR|ILS|etc.",
      "awardYear": number or null,
      "duration": "string or null",
      "role": "PI|Co-PI|Staff Leader|etc. or null"
    }
  ],
  "teaching": [
    {
      "courseTitle": "course name",
      "educationLevel": "undergraduate|graduate|doctoral|etc. or null",
      "institution": "string or null",
      "teachingPeriod": "years taught or null"
    }
  ],
  "supervision": [
    {
      "studentName": "name",
      "degreeLevel": "Ph.D.|M.A.|M.Sc.|B.Sc.|etc.",
      "thesisTitle": "string or null",
      "completionYear": number or null,
      "role": "Advisor|Co-Advisor|etc. or null"
    }
  ],
  "memberships": [
    {
      "organization": "organization name",
      "startYear": number or null,
      "endYear": number or null
    }
  ],
  "awards": [
    {
      "awardName": "award title",
      "awardingInstitution": "string or null",
      "awardYear": number or null,
      "description": "string or null"
    }
  ]
}`;

  for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: CONFIG.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Extract all information from this CV:\n\n${cvText}` },
          ],
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
      });

      if (response.status === 429 && attempt < CONFIG.maxRetries) {
        const waitTime = Math.pow(2, attempt) * CONFIG.retryDelayMs;
        console.log(`Rate limited, waiting ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const parsed = JSON.parse(result.choices[0].message.content);
      
      // Ensure all required fields exist with defaults
      return {
        personal: {
          firstName: parsed.personal?.firstName || '',
          lastName: parsed.personal?.lastName || '',
          email: parsed.personal?.email || '',
          phone: parsed.personal?.phone || null,
          birthYear: parsed.personal?.birthYear || null,
          birthCountry: parsed.personal?.birthCountry || null,
          maritalStatus: parsed.personal?.maritalStatus || null,
          numChildren: parsed.personal?.numChildren || null,
        },
        education: parsed.education || [],
        publications: parsed.publications || [],
        experience: parsed.experience || [],
        grants: parsed.grants || [],
        teaching: parsed.teaching || [],
        supervision: parsed.supervision || [],
        memberships: parsed.memberships || [],
        awards: parsed.awards || [],
      };

    } catch (error) {
      if (attempt === CONFIG.maxRetries) throw error;
      console.log(`Attempt ${attempt} failed, retrying...`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelayMs));
    }
  }

  throw new Error("All retry attempts failed");
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    const { pdfFilename } = await req.json();

    if (!pdfFilename) {
      return new Response(
        JSON.stringify({ error: "MISSING_FILENAME", message: "PDF filename is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Download PDF
    console.log("Downloading PDF:", pdfFilename);
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('academiq-cvs')
      .download(pdfFilename);

    if (downloadError || !fileData) {
      console.error("Download error:", downloadError);
      return new Response(
        JSON.stringify({ error: "PDF_READ_FAILED", message: "Unable to read PDF file" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract text
    console.log("Extracting text...");
    const arrayBuffer = await fileData.arrayBuffer();
    let cvText: string;
    
    try {
      cvText = await extractTextFromPDF(arrayBuffer);
    } catch (error) {
      console.error("PDF parse error:", error);
      return new Response(
        JSON.stringify({ error: "PDF_PARSE_FAILED", message: "Failed to extract text from PDF" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (cvText.trim().length < 100) {
      return new Response(
        JSON.stringify({ error: "NO_TEXT", message: "PDF contains no readable text" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean sensitive data
    cvText = removeSensitiveData(cvText);
    console.log(`CV text length: ${cvText.length} characters`);

    // Extract everything in one call
    console.log("Extracting CV data...");
    const startTime = Date.now();
    const parsedData = await extractAllFromCV(cvText);
    const elapsed = Date.now() - startTime;

    console.log(`=== EXTRACTION COMPLETE (${elapsed}ms) ===`);
    console.log(`Name: ${parsedData.personal.firstName} ${parsedData.personal.lastName}`);
    console.log(`Email: ${parsedData.personal.email}`);
    console.log(`Education: ${parsedData.education.length} entries`);
    console.log(`Publications: ${parsedData.publications.length} entries`);
    console.log(`Experience: ${parsedData.experience.length} entries`);
    console.log(`Grants: ${parsedData.grants.length} entries`);
    console.log(`Teaching: ${parsedData.teaching.length} entries`);
    console.log(`Supervision: ${parsedData.supervision.length} entries`);
    console.log(`Awards: ${parsedData.awards.length} entries`);

    // Validate name
    if (!parsedData.personal.firstName && !parsedData.personal.lastName) {
      return new Response(
        JSON.stringify({
          error: "INCOMPLETE_DATA",
          message: "Could not extract name from CV",
          debug: { textPreview: cvText.substring(0, 500) }
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for duplicate
    if (parsedData.personal.email) {
      const { data: existing } = await supabase
        .from("academiq_persons")
        .select("id, first_name, last_name, email, created_at")
        .eq("email", parsedData.personal.email)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({
            error: "DUPLICATE_CV",
            message: "This CV has already been processed",
            existingPerson: {
              id: existing.id,
              name: `${existing.first_name} ${existing.last_name}`,
              email: existing.email,
              processedAt: existing.created_at,
            },
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(JSON.stringify(parsedData), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: "PARSE_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});