import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as pdfjsLib from "npm:pdfjs-dist@4.0.379";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ============================================================================
// NAME NORMALIZATION
// ============================================================================

function normalizeName(name: string): string {
  if (!name) return '';
  
  return name
    .trim()
    .toLowerCase()
    .split(/[\s-]+/)
    .map(part => {
      if (part.length === 0) return '';
      if (['de', 'von', 'van', 'der', 'den', 'la', 'le', 'du'].includes(part)) {
        return part;
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ')
    .replace(/\s+-\s+/g, '-');
}

// ============================================================================
// PDF TEXT EXTRACTION (First 10 lines only)
// ============================================================================

async function extractFirst10Lines(arrayBuffer: ArrayBuffer): Promise<string> {
  const uint8Array = new Uint8Array(arrayBuffer);

  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    useSystemFonts: true,
    disableFontFace: true,
    standardFontDataUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/standard_fonts/",
  });

  const pdf = await loadingTask.promise;
  const allLines: string[] = [];

  // Only process first page
  const page = await pdf.getPage(1);
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1.0 });

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

  // Sort and join - take only first 10 lines
  const sortedYs = Array.from(lineMap.keys()).sort((a, b) => a - b);
  for (let i = 0; i < Math.min(10, sortedYs.length); i++) {
    const y = sortedYs[i];
    const lineItems = lineMap.get(y)!.sort((a, b) => a.x - b.x);
    const lineText = lineItems.map(item => item.text).join(' ').trim();
    if (lineText.length > 0) {
      allLines.push(lineText);
    }
  }

  return allLines.join('\n');
}

// ============================================================================
// NAME EXTRACTION FROM TEXT
// ============================================================================

async function extractNameFromText(text: string): Promise<{ firstName: string; lastName: string }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const systemPrompt = `Extract the person's name from the top of this CV text. The name is typically at the very beginning.

Rules:
- Ignore titles like "Dr.", "Prof.", "Ph.D."
- Return only firstName and lastName
- Handle names in any format (e.g., "JOHN SMITH", "Smith, John", "John A. Smith")

Return ONLY valid JSON with this structure:
{
  "firstName": "string",
  "lastName": "string"
}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Extract the name from this text:\n\n${text}` },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const content = result.choices[0].message.content;
  const parsed = JSON.parse(content);

  return {
    firstName: normalizeName(parsed.firstName || ''),
    lastName: normalizeName(parsed.lastName || ''),
  };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    // Parse request
    const body = await req.json();
    const pdfFilename = body.pdfFilename;

    if (!pdfFilename) {
      return new Response(
        JSON.stringify({ 
          error: "MISSING_FILENAME", 
          message: "PDF filename is required"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Download PDF
    console.log("Downloading PDF for duplicate check:", pdfFilename);
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('academiq-cvs')
      .download(pdfFilename);

    if (downloadError || !fileData) {
      return new Response(
        JSON.stringify({ 
          error: "PDF_DOWNLOAD_FAILED", 
          message: `Unable to download PDF file: ${downloadError?.message || 'File not found'}`
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract first 10 lines
    console.log("Extracting first 10 lines from PDF...");
    const arrayBuffer = await fileData.arrayBuffer();
    let first10Lines: string;
    
    try {
      first10Lines = await extractFirst10Lines(arrayBuffer);
    } catch (error) {
      console.error("PDF extraction error:", error);
      return new Response(
        JSON.stringify({ 
          error: "PDF_PARSE_FAILED", 
          message: `Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("First 10 lines:", first10Lines);

    // Extract name using AI
    console.log("Extracting name from text...");
    let nameData: { firstName: string; lastName: string };
    
    try {
      nameData = await extractNameFromText(first10Lines);
    } catch (error) {
      console.error("Name extraction error:", error);
      return new Response(
        JSON.stringify({ 
          error: "NAME_EXTRACTION_FAILED", 
          message: `Failed to extract name: ${error instanceof Error ? error.message : 'Unknown error'}`
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Extracted name:", nameData);

    if (!nameData.firstName || !nameData.lastName) {
      return new Response(
        JSON.stringify({
          error: "NAME_NOT_FOUND",
          message: "Could not extract name from CV"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for duplicate in database
    const { data: existing } = await supabase
      .from("academiq_persons")
      .select("id, first_name, last_name, created_at")
      .eq("first_name", nameData.firstName)
      .eq("last_name", nameData.lastName)
      .maybeSingle();

    if (existing) {
      console.log("Duplicate found:", existing);
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

    // No duplicate found
    console.log("No duplicate found for:", nameData);
    return new Response(
      JSON.stringify({
        message: "No duplicate found",
        name: nameData,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({
        error: "UNEXPECTED_ERROR",
        message: error instanceof Error ? error.message : "Unknown error occurred"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});