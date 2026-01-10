import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as pdfjsLib from "npm:pdfjs-dist@4.0.379";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DEFAULT_MODEL = "gpt-5-mini-2025-08-07";
const CHUNK_SIZE = 20000;

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

function splitIntoChunks(text: string): string[] {
  if (text.length <= CHUNK_SIZE) {
    return [text];
  }

  const chunks: string[] = [];
  let currentPosition = 0;

  while (currentPosition < text.length) {
    let chunkEnd = Math.min(currentPosition + CHUNK_SIZE, text.length);

    if (chunkEnd < text.length) {
      const nextNewline = text.indexOf('\n', chunkEnd);
      if (nextNewline !== -1 && nextNewline < chunkEnd + 500) {
        chunkEnd = nextNewline + 1;
      } else {
        const lastNewline = text.lastIndexOf('\n', chunkEnd);
        if (lastNewline > currentPosition) {
          chunkEnd = lastNewline + 1;
        }
      }
    }

    const chunk = text.substring(currentPosition, chunkEnd);

    if (chunks.length > 0) {
      const previousChunk = chunks[chunks.length - 1];
      const lines = previousChunk.split('\n');
      const lastLines = lines.slice(-3).join('\n');

      if (lastLines.length > 0 && !lastLines.endsWith('\n')) {
        chunks[chunks.length] = lastLines + '\n' + chunk;
      } else {
        chunks.push(chunk);
      }
    } else {
      chunks.push(chunk);
    }

    currentPosition = chunkEnd;
  }

  return chunks;
}

async function parseChunk(text: string, model: string, chunkNumber: number, totalChunks: number) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  console.log(`[Chunk ${chunkNumber}/${totalChunks}] Starting API call, text length: ${text.length}, model: ${model}`);

  const systemPrompt = `You are an expert CV parser for an academic research database.

TASK: Carefully read through this CV chunk (${chunkNumber}/${totalChunks}) and extract ALL information into structured JSON.

STEP-BY-STEP APPROACH:
1. First, scan for the person's FULL NAME at the top of the CV (ignore titles like "Ph.D.", "Dr.", "Prof.")
2. Then, identify ALL education entries with: degree type (PhD/MSc/BSc), institution, field/subject, year, country
3. Next, find EVERY publication with: title, year, type (journal/conference/book), venue, co-authors
4. Then, locate ALL work positions with: institution, position title, start year, end year (null if current), country
5. Finally, extract ALL grants, teaching, supervision, memberships, and awards
6. For dates: prefer specific years (e.g., "2024") or year ranges

PUBLICATIONS - STRICT DEFINITION:
INCLUDE: Journal articles, conference papers, books, book chapters, technical reports, preprints, proceedings
EXCLUDE: Patents, press coverage, blog posts, informal presentations

Think through each section carefully before extracting. Return ONLY valid JSON with this exact structure:
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

  const requestBody = {
    model: model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Parse this CV chunk:\n\n${text}` },
    ],
    reasoning_effort: "high",
  };

  console.log(`[Chunk ${chunkNumber}/${totalChunks}] Sending request to OpenAI:`, {
    model,
    reasoning_effort: "high",
    textLength: text.length,
    systemPromptLength: systemPrompt.length
  });

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  console.log(`[Chunk ${chunkNumber}/${totalChunks}] Got response with status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Chunk ${chunkNumber}/${totalChunks}] OpenAI API error:`, errorText);
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  console.log(`[Chunk ${chunkNumber}/${totalChunks}] Parsed response from OpenAI successfully`);

  const content = result.choices[0].message.content;
  const parsed = JSON.parse(content);

  console.log(`[Chunk ${chunkNumber}/${totalChunks}] Extracted data:`, {
    hasPersonal: !!parsed.personal,
    educationCount: parsed.education?.length || 0,
    publicationsCount: parsed.publications?.length || 0,
    experienceCount: parsed.experience?.length || 0
  });

  return parsed;
}

function mergeChunkResults(chunkResults: any[]): any {
  const merged = {
    personal: {},
    education: [],
    publications: [],
    experience: [],
    grants: [],
    teaching: [],
    supervision: [],
    memberships: [],
    awards: []
  };

  for (const chunk of chunkResults) {
    if (chunk.personal && chunk.personal.firstName) {
      merged.personal = chunk.personal;
    }

    if (chunk.education) merged.education.push(...chunk.education);
    if (chunk.publications) merged.publications.push(...chunk.publications);
    if (chunk.experience) merged.experience.push(...chunk.experience);
    if (chunk.grants) merged.grants.push(...chunk.grants);
    if (chunk.teaching) merged.teaching.push(...chunk.teaching);
    if (chunk.supervision) merged.supervision.push(...chunk.supervision);
    if (chunk.memberships) merged.memberships.push(...chunk.memberships);
    if (chunk.awards) merged.awards.push(...chunk.awards);
  }

  const deduplicatePublications = (pubs: any[]) => {
    const seen = new Set();
    return pubs.filter(pub => {
      const key = `${pub.title}-${pub.publicationYear}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  merged.publications = deduplicatePublications(merged.publications);

  return merged;
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    const url = new URL(req.url);
    const pdfFilename = url.searchParams.get("pdfFilename");
    const model = url.searchParams.get("model") || DEFAULT_MODEL;
    const apikey = url.searchParams.get("apikey");

    if (!apikey) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!pdfFilename) {
      return new Response(
        JSON.stringify({ error: "pdfFilename is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: any) => {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        const sendKeepAlive = () => {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        };

        let keepAliveInterval: number | undefined;

        try {
          keepAliveInterval = setInterval(sendKeepAlive, 15000);

          sendEvent('message', {
            stage: 'extraction_start',
            message: 'Starting PDF text extraction',
            timestamp: Date.now()
          });

          const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
          );

          const { data: fileData, error: downloadError } = await supabase.storage
            .from('academiq-cvs')
            .download(pdfFilename);

          if (downloadError || !fileData) {
            throw new Error(`Failed to download PDF: ${downloadError?.message}`);
          }

          const arrayBuffer = await fileData.arrayBuffer();
          const fullText = await extractFullPDFText(arrayBuffer);

          sendEvent('message', {
            stage: 'extraction_complete',
            message: `Extracted ${fullText.length} characters`,
            timestamp: Date.now(),
            details: { textLength: fullText.length }
          });

          const chunks = splitIntoChunks(fullText);
          const totalChunks = chunks.length;

          sendEvent('message', {
            stage: 'chunking_complete',
            message: `Split into ${totalChunks} chunks`,
            timestamp: Date.now(),
            details: { totalChunks }
          });

          const chunkResults = [];

          for (let i = 0; i < chunks.length; i++) {
            const chunkNumber = i + 1;

            sendEvent('message', {
              stage: 'chunk_start',
              message: `Processing chunk ${chunkNumber}/${totalChunks}`,
              timestamp: Date.now(),
              details: {
                chunkNumber,
                totalChunks,
                chunkSize: chunks[i].length,
                progress: Math.round((i / totalChunks) * 100)
              }
            });

            try {
              const chunkResult = await parseChunk(chunks[i], model, chunkNumber, totalChunks);
              chunkResults.push(chunkResult);
            } catch (chunkError) {
              sendEvent('message', {
                stage: 'chunk_error',
                message: `Error processing chunk ${chunkNumber}: ${chunkError instanceof Error ? chunkError.message : 'Unknown error'}`,
                timestamp: Date.now(),
                details: { chunkNumber, totalChunks }
              });
              throw chunkError;
            }

            sendEvent('message', {
              stage: 'chunk_complete',
              message: `Completed chunk ${chunkNumber}/${totalChunks}`,
              timestamp: Date.now(),
              details: {
                chunkNumber,
                totalChunks,
                progress: Math.round(((i + 1) / totalChunks) * 100)
              }
            });
          }

          const mergedResult = mergeChunkResults(chunkResults);

          sendEvent('message', {
            stage: 'complete',
            message: 'CV parsing completed',
            timestamp: Date.now(),
            result: mergedResult
          });

          controller.close();

        } catch (error) {
          sendEvent('message', {
            stage: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now()
          });
          controller.close();
        } finally {
          if (keepAliveInterval !== undefined) {
            clearInterval(keepAliveInterval);
          }
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      }
    });

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