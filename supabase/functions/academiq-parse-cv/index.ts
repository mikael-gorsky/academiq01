import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as pdfjsLib from "npm:pdfjs-dist@4.0.379";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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
  grants: Array<any>;
  teaching: Array<any>;
  supervision: Array<any>;
  memberships: Array<any>;
  awards: Array<any>;
}

async function extractTextFromPDF(arrayBuffer: ArrayBuffer): Promise<string> {
  const uint8Array = new Uint8Array(arrayBuffer);

  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    useSystemFonts: true,
    disableFontFace: true,
    standardFontDataUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/standard_fonts/",
  });

  const pdf = await loadingTask.promise;
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    const pageText = textContent.items
      .map((item: any) => {
        if ('str' in item) {
          return item.str;
        }
        return '';
      })
      .filter(str => str.trim().length > 0)
      .join(' ');

    fullText += pageText + "\n\n";
  }

  return fullText.trim();
}

function removeSensitiveData(text: string): string {
  let cleaned = text;

  cleaned = cleaned.replace(/\b\d{8,10}\b/g, '[ID-REDACTED]');
  cleaned = cleaned.replace(/\b\d{2,3}-\d{3,6}-\d{3,4}\b/g, '[ID-REDACTED]');

  cleaned = cleaned
    .split("\n")
    .map((line) => {
      if (/Home\s*Address[:\s]+/i.test(line)) {
        return line.replace(/Home\s*Address[:\s]+.*/i, '');
      }
      if (/Passport\s*No\.?[:\s]+/i.test(line)) {
        return line.replace(/Passport\s*No\.?[:\s]+.*/i, '');
      }
      return line;
    })
    .filter((line) => line.trim().length > 0)
    .join("\n");

  return cleaned;
}

function findPublicationsSection(text: string): string | null {
  const lowerText = text.toLowerCase();

  const publicationMarkers = [
    { marker: 'publications', priority: 1 },
    { marker: 'a. articles in refereed journals', priority: 2 },
    { marker: 'b. chapters in books', priority: 3 },
    { marker: 'c. papers presented', priority: 4 },
    { marker: 'conference proceedings', priority: 5 },
    { marker: 'published works', priority: 6 }
  ];

  let startIndex = -1;
  let foundMarker = '';

  for (const { marker, priority } of publicationMarkers) {
    const idx = lowerText.indexOf(marker);
    if (idx !== -1 && (startIndex === -1 || idx < startIndex)) {
      startIndex = idx;
      foundMarker = marker;
    }
  }

  if (startIndex === -1) return null;

  const endMarkers = [
    '\ngrants and', '\ngrants\n', '\nfunding\n',
    '\nteaching experience', '\ncourses taught',
    '\nsupervision\n', '\nprofessional activities', '\nmemberships\n',
    '\nconferences organized', '\nservice\n', '\nawards and', '\nhonors\n',
    '\nreferences\n'
  ];

  let endIndex = text.length;
  for (const marker of endMarkers) {
    const idx = lowerText.indexOf(marker, startIndex + 500);
    if (idx !== -1 && idx < endIndex) {
      endIndex = idx;
    }
  }

  const section = text.substring(startIndex, endIndex);
  console.log(`Found publications section: ${section.length} chars, starting with "${section.substring(0, 100)}"`);

  return section;
}

async function callOpenAI(systemPrompt: string, userMessage: string, retries = 3): Promise<any> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: userMessage,
            },
          ],
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
      });

      if (response.status === 429 && attempt < retries) {
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`Rate limited. Waiting ${waitTime}ms before retry ${attempt}/${retries}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenAI API error:", errorText);
        throw new Error(`AI parsing failed: ${response.statusText}`);
      }

      const result = await response.json();
      return JSON.parse(result.choices[0].message.content);
    } catch (error) {
      if (attempt === retries) throw error;
      const waitTime = Math.pow(2, attempt) * 1000;
      console.log(`Error on attempt ${attempt}. Retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

function chunkPublications(publicationsText: string, maxPublicationsPerChunk = 50): string[] {
  const lines = publicationsText.split('\n').filter(line => line.trim().length > 0);

  const publicationPattern = /^\d+\.|^[\w\s]+,\s*[A-Z]\.|^\[\d+\]|^•|^-\s+[\w\s]+,/;

  const publications: string[] = [];
  let currentPub = '';

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (publicationPattern.test(trimmedLine) && currentPub.length > 0) {
      publications.push(currentPub.trim());
      currentPub = line + '\n';
    } else {
      currentPub += line + '\n';
    }
  }

  if (currentPub.trim().length > 0) {
    publications.push(currentPub.trim());
  }

  console.log(`Split into ${publications.length} individual publications`);

  const chunks: string[] = [];
  for (let i = 0; i < publications.length; i += maxPublicationsPerChunk) {
    const chunk = publications.slice(i, i + maxPublicationsPerChunk).join('\n\n');
    chunks.push(chunk);
    console.log(`Chunk ${chunks.length}: ${publications.slice(i, i + maxPublicationsPerChunk).length} publications, ${chunk.length} chars`);
  }

  return chunks;
}

async function parsePublicationsInChunks(publicationsText: string): Promise<any[]> {
  const chunks = chunkPublications(publicationsText);
  console.log(`Processing publications in ${chunks.length} chunks`);

  const allPublications: any[] = [];

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing publications chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`);

    const systemPrompt = `You are an expert at extracting publications from academic CVs. Extract EVERY SINGLE publication entry from the text.

CRITICAL: Count the publication entries carefully. If you see 50 numbered or listed items, you MUST return 50 publications.

Common formats:
1. Numbered: "1. Author (2004). Title. Journal, 1(3), 131-141."
2. Author-first: "Levin, I., Talis, V. (2004). Title. Journal Name, 1(3), 131-141."
3. Sections: "A. Articles", "B. Books", "C. Conference Papers"

Rules:
- Extract author names as an array (e.g., ["Levin, I.", "Talis, V."])
- Year is typically in parentheses: (2009) → 2009
- Title comes after the year
- Venue/Journal name follows the title
- Volume(Issue), Pages: "19(1), 15-36" means volume="19", issue="1", pages="15-36"
- If you can't parse a field, use null
- Publication type: "journal" for journal articles, "conference" for conference papers, "book" for book chapters

Return JSON with ALL publications:
{
  "publications": [
    {
      "title": "string",
      "publicationType": "journal|conference|book",
      "venueName": "string or null",
      "publicationYear": number,
      "volume": "string or null",
      "issue": "string or null",
      "pages": "string or null",
      "coAuthors": ["name1", "name2"],
      "citationCount": null,
      "url": null
    }
  ]
}`;

    const userMessage = `Extract EVERY publication from this text. Count them carefully - return one JSON object for each publication entry you see.\n\nChunk ${i + 1}/${chunks.length}:\n\n${chunks[i]}`;

    const chunkResult = await callOpenAI(systemPrompt, userMessage);

    if (chunkResult.publications && Array.isArray(chunkResult.publications)) {
      console.log(`Extracted ${chunkResult.publications.length} publications from chunk ${i + 1}`);
      allPublications.push(...chunkResult.publications);
    } else {
      console.warn(`Chunk ${i + 1} returned no publications array!`);
    }

    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`Total publications extracted: ${allPublications.length}`);
  return allPublications;
}

async function parseWithAI(cvText: string): Promise<ParsedCV> {
  const publicationsSection = findPublicationsSection(cvText);
  console.log("Publications section found:", publicationsSection ? "YES" : "NO");
  if (publicationsSection) {
    console.log("Publications section length:", publicationsSection.length);
  }

  const cvWithoutPublications = publicationsSection
    ? cvText.replace(publicationsSection, '[PUBLICATIONS SECTION REMOVED FOR SEPARATE PROCESSING]')
    : cvText;

  const maxLength = 15000;
  const truncatedCV = cvWithoutPublications.length > maxLength
    ? cvWithoutPublications.substring(0, maxLength) + '\n\n[CV TRUNCATED - PUBLICATIONS PROCESSED SEPARATELY]'
    : cvWithoutPublications;

  const systemPrompt = `You are an expert at extracting structured information from academic CVs.

Extract:
1. Personal information (name, email, phone, birth year/country, marital status, children)
2. ALL education entries (Ph.D., M.A., M.Sc., B.A., B.Sc., Postdoc, etc.)
3. ALL work experience entries

The person's name is usually at the TOP of the CV. Handle titles like Ph.D., Dr., Prof. correctly.
Example: "Vadim Talis Ph.D." → firstName: "Vadim", lastName: "Talis"

For education, extract EVERY degree/certification. Look for:
- Years (e.g., "1984-1989", "1994-2002")
- Degree types
- Institution names
- Award years

Return ONLY valid JSON:
{
  "personal": {
    "firstName": "string",
    "lastName": "string",
    "email": "string",
    "phone": "string or null",
    "birthYear": number or null,
    "birthCountry": "string or null",
    "maritalStatus": "string or null",
    "numChildren": number or null
  },
  "education": [
    {
      "degreeType": "string",
      "institution": "string",
      "department": "string or null",
      "subject": "string or null",
      "specialization": "string or null",
      "awardDate": "string or null",
      "honors": "string or null",
      "country": "string or null"
    }
  ],
  "experience": [
    {
      "institution": "string",
      "department": "string or null",
      "positionTitle": "string",
      "startDate": "string or null",
      "endDate": "string or null",
      "description": "string or null",
      "employmentType": "string"
    }
  ]
}`;

  const userMessage = `Parse this CV. Extract personal info, ALL education, and ALL experience.\n\n${truncatedCV}`;

  console.log("Stage 1: Parsing personal, education, and experience...");
  const baseData = await callOpenAI(systemPrompt, userMessage);

  let publications: any[] = [];
  if (publicationsSection) {
    console.log("Stage 2: Parsing publications separately...");
    publications = await parsePublicationsInChunks(publicationsSection);
  }

  return {
    personal: baseData.personal || {
      firstName: "",
      lastName: "",
      email: "",
      phone: null,
      birthYear: null,
      birthCountry: null,
      maritalStatus: null,
      numChildren: null,
    },
    education: baseData.education || [],
    publications: publications,
    experience: baseData.experience || [],
    grants: [],
    teaching: [],
    supervision: [],
    memberships: [],
    awards: [],
  };
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    const { pdfFilename } = await req.json();

    if (!pdfFilename) {
      return new Response(
        JSON.stringify({ error: "MISSING_FILENAME", message: "PDF filename is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log("Downloading PDF:", pdfFilename);
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('academiq-cvs')
      .download(pdfFilename);

    if (downloadError || !fileData) {
      console.error("Storage download error:", downloadError);
      return new Response(
        JSON.stringify({ error: "PDF_READ_FAILED", message: "Unable to read PDF file from storage" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Extracting text from PDF...");
    const arrayBuffer = await fileData.arrayBuffer();

    let extractedText = "";
    try {
      extractedText = await extractTextFromPDF(arrayBuffer);
      console.log("Extracted text length:", extractedText.length);
      console.log("First 1000 chars:", extractedText.substring(0, 1000));
    } catch (parseError) {
      console.error("PDF parsing error:", parseError);
      return new Response(
        JSON.stringify({ error: "PDF_PARSE_FAILED", message: "Failed to extract text from PDF" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!extractedText || extractedText.trim().length < 50) {
      return new Response(
        JSON.stringify({ error: "NO_TEXT", message: "PDF contains no readable text or text is too short" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const cleanedText = removeSensitiveData(extractedText);
    console.log("Cleaned text length:", cleanedText.length);
    console.log("Cleaned text first 500 chars:", cleanedText.substring(0, 500));

    console.log("Parsing CV with AI...");
    const parsedData = await parseWithAI(cleanedText);

    console.log("=== PARSING RESULTS ===");
    console.log("Education entries:", parsedData.education.length);
    console.log("Publications:", parsedData.publications.length);
    console.log("Experience entries:", parsedData.experience.length);

    if (parsedData.education.length > 0) {
      console.log("Education degrees:", parsedData.education.map(e => e.degreeType).join(", "));
    }

    if (parsedData.publications.length > 0) {
      console.log("First 3 publications:", parsedData.publications.slice(0, 3).map(p => p.title).join(" | "));
    }

    if (cleanedText.toLowerCase().includes("publications") && parsedData.publications.length === 0) {
      console.warn("WARNING: CV contains PUBLICATIONS section but no publications were extracted!");
    }

    const educationKeywords = cleanedText.toLowerCase().match(/\b(ph\.?d\.?|m\.a\.?|m\.sc\.?|b\.a\.?|b\.sc\.?|postdoc)/gi);
    if (educationKeywords && educationKeywords.length > parsedData.education.length) {
      console.warn(`WARNING: Found ${educationKeywords.length} degree keywords but only extracted ${parsedData.education.length} education entries!`);
    }

    if (!parsedData.personal.firstName || !parsedData.personal.lastName) {
      return new Response(
        JSON.stringify({
          error: "INCOMPLETE_DATA",
          message: "Could not extract required information (name)",
          debug: {
            textPreview: cleanedText.substring(0, 1000),
            textLength: cleanedText.length
          }
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (parsedData.personal.email && parsedData.personal.email.trim().length > 0) {
      const { data: existingPerson } = await supabase
        .from("academiq_persons")
        .select("id, first_name, last_name, email, created_at")
        .eq("email", parsedData.personal.email)
        .maybeSingle();

      if (existingPerson) {
        return new Response(
          JSON.stringify({
            error: "DUPLICATE_CV",
            message: "This brilliance has already been indexed",
            existingPerson: {
              id: existingPerson.id,
              name: `${existingPerson.first_name} ${existingPerson.last_name}`,
              email: existingPerson.email,
              importedAt: existingPerson.created_at,
            },
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    console.log("Successfully parsed CV for:", parsedData.personal.firstName, parsedData.personal.lastName);
    console.log("Found education entries:", parsedData.education.length);
    console.log("Found publications:", parsedData.publications.length);
    console.log("Found experience entries:", parsedData.experience.length);

    return new Response(JSON.stringify(parsedData), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in edge function:", error);
    return new Response(
      JSON.stringify({
        error: "PARSE_ERROR",
        message: error instanceof Error ? error.message : "Unknown error occurred",
        stack: error instanceof Error ? error.stack : undefined,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});