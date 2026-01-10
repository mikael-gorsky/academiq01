import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as pdfjsLib from "npm:pdfjs-dist@4.0.379";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DEFAULT_MODEL = "gpt-5-mini-2025-08-07";

async function extractFullPDFText(arrayBuffer: ArrayBuffer): Promise<string> {
  const uint8Array = new Uint8Array(arrayBuffer);

  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    useSystemFonts: true,
    disableFontFace: true,
    standardFontDataUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/standard_fonts/",
  });

  const pdf = await loadingTask.promise;
  const allText: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });

    const items = textContent.items
      .filter((item: any) => 'str' in item && item.str.trim().length > 0)
      .map((item: any) => ({
        text: item.str,
        x: item.transform[4],
        y: Math.round(viewport.height - item.transform[5]),
      }));

    const lineMap = new Map<number, any[]>();
    for (const item of items) {
      const yKey = Math.round(item.y / 8) * 8;
      if (!lineMap.has(yKey)) lineMap.set(yKey, []);
      lineMap.get(yKey)!.push(item);
    }

    const sortedYs = Array.from(lineMap.keys()).sort((a, b) => a - b);
    for (const y of sortedYs) {
      const lineItems = lineMap.get(y)!.sort((a, b) => a.x - b.x);
      const lineText = lineItems.map(item => item.text).join(' ').trim();
      if (lineText.length > 0) {
        allText.push(lineText);
      }
    }

    if (pageNum < pdf.numPages) {
      allText.push('\n--- PAGE BREAK ---\n');
    }
  }

  return allText.join('\n');
}

async function parseCV(text: string, model: string) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const systemPrompt = `You are an expert CV parser for an academic research database. Extract ALL information from this CV into structured JSON.

CRITICAL INSTRUCTIONS:
1. Extract the person's FULL NAME from the top of the CV. Ignore titles like "Ph.D.", "Dr.", "Prof.".
2. Extract EVERY education entry with: degree type (PhD/MSc/BSc), institution, field/subject, year, country
3. Extract EVERY publication with: title, year, type (journal/conference/book), venue, co-authors
4. Extract EVERY work position with: institution, position title, start year, end year (null if current), country
5. Extract ALL grants, teaching, supervision, memberships, and awards
6. For dates: prefer specific years (e.g., "2024") or year ranges

PUBLICATIONS - STRICT DEFINITION:
INCLUDE: Journal articles, conference papers, books, book chapters, technical reports, preprints, proceedings
EXCLUDE: Patents, press coverage, blog posts, informal presentations

Return ONLY valid JSON with this exact structure:
{
  "personal": {
    "firstName": "",
    "lastName": "",
    "email": "",
    "phone": null,
    "birthYear": null,
    "birthCountry": null,
    "maritalStatus": null,
    "numChildren": null
  },
  "education": [
    {
      "degreeType": "PhD",
      "institution": "University Name",
      "department": null,
      "subject": "Computer Science",
      "specialization": null,
      "awardDate": "2020",
      "honors": null,
      "country": "USA"
    }
  ],
  "publications": [
    {
      "title": "Paper Title",
      "publicationType": "Journal Article",
      "venueName": "Nature",
      "publicationYear": 2024,
      "volume": null,
      "issue": null,
      "pages": null,
      "coAuthors": ["Author1", "Author2"],
      "citationCount": null,
      "url": null
    }
  ],
  "experience": [
    {
      "institution": "Company/University",
      "department": null,
      "positionTitle": "Professor",
      "startDate": "2020",
      "endDate": null,
      "description": null,
      "employmentType": "Full-time"
    }
  ],
  "grants": [
    {
      "title": "Grant Title",
      "fundingInstitution": "NSF",
      "amount": 100000,
      "currencyCode": "USD",
      "awardYear": 2024,
      "duration": "3 years",
      "role": "Principal Investigator"
    }
  ],
  "teaching": [
    {
      "courseTitle": "Machine Learning 101",
      "educationLevel": "Undergraduate",
      "institution": "University",
      "teachingPeriod": "Fall 2024"
    }
  ],
  "supervision": [
    {
      "studentName": "John Doe",
      "degreeLevel": "PhD",
      "thesisTitle": "Thesis Title",
      "completionYear": 2024,
      "role": "Primary Supervisor"
    }
  ],
  "memberships": [
    {
      "organization": "IEEE",
      "startYear": 2020,
      "endYear": null
    }
  ],
  "awards": [
    {
      "awardName": "Best Paper Award",
      "awardingInstitution": "Conference Name",
      "awardYear": 2024,
      "description": null
    }
  ]
}

If a category has no entries, return an empty array. BE THOROUGH - extract everything you find.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Parse this CV:\n\n${text}` },
      ],
      reasoning_effort: "high",
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const content = result.choices[0].message.content;
  return JSON.parse(content);
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    const body = await req.json();
    const pdfFilename = body.pdfFilename;
    const model = body.model || DEFAULT_MODEL;

    if (!pdfFilename) {
      return new Response(
        JSON.stringify({ error: "pdfFilename is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      throw new Error(`Failed to download PDF: ${downloadError?.message}`);
    }

    console.log("Extracting PDF text...");
    const arrayBuffer = await fileData.arrayBuffer();
    const fullText = await extractFullPDFText(arrayBuffer);

    console.log(`Extracted ${fullText.length} characters from PDF`);

    console.log("Parsing CV with", model);
    const parsedData = await parseCV(fullText, model);

    console.log("Parsing complete:", parsedData.personal);

    return new Response(
      JSON.stringify({
        stage: "complete",
        result: parsedData
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({
        stage: "error",
        error: { message: error instanceof Error ? error.message : "Unknown error" }
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
