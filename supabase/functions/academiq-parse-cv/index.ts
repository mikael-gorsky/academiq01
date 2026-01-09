import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as pdfjsLib from "npm:pdfjs-dist@4.0.379";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  model: "gpt-5-mini-2025-08-07",
  maxRetries: 2,
  retryDelayMs: 500,
  apiTimeoutMs: 50000, // 50 seconds - must fit within Supabase 60s function limit
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
    birthYear: number | null;
    birthCountry: string | null;
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
// NAME NORMALIZATION
// ============================================================================

function normalizeName(name: string): string {
  if (!name) return '';
  
  // Handle names that are ALL CAPS or all lowercase
  // Convert to proper case: first letter uppercase, rest lowercase
  return name
    .trim()
    .toLowerCase()
    .split(/[\s-]+/)
    .map(part => {
      if (part.length === 0) return '';
      // Handle particles like "de", "von", "van" - keep lowercase
      if (['de', 'von', 'van', 'der', 'den', 'la', 'le', 'du'].includes(part)) {
        return part;
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ')
    .replace(/\s+-\s+/g, '-'); // Fix spacing around hyphens
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
  // Remove email addresses
  cleaned = cleaned.replace(/[\w.-]+@[\w.-]+\.\w+/g, '[EMAIL REDACTED]');
  return cleaned;
}

// ============================================================================
// FETCH WITH TIMEOUT
// ============================================================================

async function fetchWithTimeout(
  url: string, 
  options: RequestInit, 
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
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
6. DO NOT extract email addresses or phone numbers - we do not collect personal contact information.

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
    "birthYear": number or null,
    "birthCountry": "string or null"
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

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
    try {
      console.log(`API call attempt ${attempt}/${CONFIG.maxRetries}...`);
      
      const response = await fetchWithTimeout(
        "https://api.openai.com/v1/chat/completions",
        {
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
            response_format: { type: "json_object" },
          }),
        },
        CONFIG.apiTimeoutMs
      );

      if (response.status === 429) {
        const waitTime = Math.pow(2, attempt) * CONFIG.retryDelayMs;
        console.log(`Rate limited (429), waiting ${waitTime}ms before retry...`);
        lastError = new Error("API rate limit exceeded");
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      if (response.status === 408 || response.status === 504) {
        console.log(`Timeout error (${response.status}), retrying...`);
        lastError = new Error(`API timeout (status ${response.status})`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelayMs));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API error ${response.status}: ${errorText.substring(0, 500)}`);
        throw new Error(`OpenAI API error: ${response.status} - ${errorText.substring(0, 200)}`);
      }

      const result = await response.json();
      
      if (!result.choices || !result.choices[0] || !result.choices[0].message) {
        throw new Error("Invalid API response structure - missing choices");
      }

      const content = result.choices[0].message.content;
      if (!content) {
        throw new Error("Empty response content from API");
      }

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (parseError) {
        throw new Error(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
      }
      
      // Normalize names and ensure all required fields exist with defaults
      return {
        personal: {
          firstName: normalizeName(parsed.personal?.firstName || ''),
          lastName: normalizeName(parsed.personal?.lastName || ''),
          birthYear: parsed.personal?.birthYear || null,
          birthCountry: parsed.personal?.birthCountry || null,
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
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check for abort/timeout
      if (lastError.name === 'AbortError') {
        console.error(`Request timed out after ${CONFIG.apiTimeoutMs}ms on attempt ${attempt}`);
        lastError = new Error(`CV processing timed out. This CV may be too long to process within the allowed time limit. Try a shorter CV or contact support.`);
        // Don't retry on timeout - we're hitting infrastructure limits
        break;
      } else {
        console.error(`Attempt ${attempt} failed:`, lastError.message);
      }
      
      if (attempt < CONFIG.maxRetries) {
        const waitTime = Math.pow(2, attempt) * CONFIG.retryDelayMs;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError || new Error("All retry attempts failed");
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  const startTime = Date.now();
  
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    // Parse request
    let pdfFilename: string;
    try {
      const body = await req.json();
      pdfFilename = body.pdfFilename;
    } catch (e) {
      return new Response(
        JSON.stringify({ 
          error: "INVALID_REQUEST", 
          message: "Invalid JSON in request body",
          stage: "request_parsing"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!pdfFilename) {
      return new Response(
        JSON.stringify({ 
          error: "MISSING_FILENAME", 
          message: "PDF filename is required",
          stage: "validation"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Download PDF
    console.log("Downloading PDF:", pdfFilename);
    const downloadStart = Date.now();
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('academiq-cvs')
      .download(pdfFilename);

    if (downloadError || !fileData) {
      console.error("Download error:", downloadError);
      return new Response(
        JSON.stringify({ 
          error: "PDF_DOWNLOAD_FAILED", 
          message: `Unable to download PDF file: ${downloadError?.message || 'File not found'}`,
          stage: "pdf_download",
          filename: pdfFilename
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log(`PDF downloaded in ${Date.now() - downloadStart}ms`);

    // Extract text
    console.log("Extracting text from PDF...");
    const extractStart = Date.now();
    const arrayBuffer = await fileData.arrayBuffer();
    let cvText: string;
    
    try {
      cvText = await extractTextFromPDF(arrayBuffer);
    } catch (error) {
      console.error("PDF parse error:", error);
      return new Response(
        JSON.stringify({ 
          error: "PDF_PARSE_FAILED", 
          message: `Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`,
          stage: "pdf_extraction"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log(`Text extracted in ${Date.now() - extractStart}ms`);

    if (cvText.trim().length < 100) {
      return new Response(
        JSON.stringify({ 
          error: "NO_TEXT", 
          message: "PDF contains no readable text or is too short",
          stage: "text_validation",
          textLength: cvText.trim().length
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean sensitive data
    cvText = removeSensitiveData(cvText);
    console.log(`CV text length: ${cvText.length} characters`);

    // Extract everything in one call
    console.log("Calling AI for CV extraction...");
    const aiStart = Date.now();
    let parsedData: ParsedCV;
    
    try {
      parsedData = await extractAllFromCV(cvText);
    } catch (error) {
      console.error("AI extraction error:", error);
      return new Response(
        JSON.stringify({ 
          error: "AI_EXTRACTION_FAILED", 
          message: `AI extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          stage: "ai_extraction",
          cvTextLength: cvText.length,
          elapsedMs: Date.now() - startTime
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const aiElapsed = Date.now() - aiStart;
    const totalElapsed = Date.now() - startTime;

    console.log(`=== EXTRACTION COMPLETE ===`);
    console.log(`AI call: ${aiElapsed}ms, Total: ${totalElapsed}ms`);
    console.log(`Name: ${parsedData.personal.firstName} ${parsedData.personal.lastName}`);
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
          stage: "data_validation",
          debug: { textPreview: cvText.substring(0, 500) }
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for duplicate by name (since we no longer use email)
    const { data: existing } = await supabase
      .from("academiq_persons")
      .select("id, first_name, last_name, created_at")
      .eq("first_name", parsedData.personal.firstName)
      .eq("last_name", parsedData.personal.lastName)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({
          error: "DUPLICATE_CV",
          message: "A person with this name has already been processed",
          existingPerson: {
            id: existing.id,
            name: `${existing.first_name} ${existing.last_name}`,
            processedAt: existing.created_at,
          },
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({
      ...parsedData,
      _metadata: {
        aiExtractionMs: aiElapsed,
        totalProcessingMs: totalElapsed,
        cvTextLength: cvText.length,
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({
        error: "UNEXPECTED_ERROR",
        message: error instanceof Error ? error.message : "Unknown error occurred",
        stage: "unknown",
        elapsedMs: Date.now() - startTime
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});