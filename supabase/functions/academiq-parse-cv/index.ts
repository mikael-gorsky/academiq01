import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as pdfjsLib from "npm:pdfjs-dist@4.0.379";

// ============================================================================
// CONFIGURATION
// ============================================================================

// LLM Provider: "gemini" or "openai"
const LLM_PROVIDER = "gemini";

const CONFIG = {
  gemini: {
    model: "gemini-3-flash-preview",
    apiEndpoint: "https://generativelanguage.googleapis.com/v1beta",
  },
  openai: {
    model: "gpt-4.1-mini",
  },
  maxRetries: 2,
  retryDelayMs: 500,
  apiTimeoutMs: 120000, // 120 seconds per chunk - Supabase allows 150s total
  chunkSize: 20000, // ~20K characters per chunk
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

interface ChunkInfo {
  id: number;
  text: string;
  startSection: string | null;
  charCount: number;
}

interface SectionHeader {
  position: number;
  text: string;
  type: string;
}

interface ProgressEvent {
  stage: string;
  message: string;
  timestamp: number;
  details?: Record<string, any>;
}

interface ProcessingLog {
  id?: string;
  cv_filename: string;
  started_at: string;
  completed_at: string | null;
  status: 'processing' | 'completed' | 'failed';
  total_chunks: number;
  processed_chunks: number;
  log_entries: ProgressEvent[];
  error: Record<string, any> | null;
  result_summary: Record<string, any> | null;
}

// ============================================================================
// STREAMING RESPONSE HELPER
// ============================================================================

class SSEWriter {
  private encoder = new TextEncoder();
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private logEntries: ProgressEvent[] = [];
  private supabase: any;
  private logId: string | null = null;

  constructor(supabase: any) {
    this.supabase = supabase;
  }

  setController(controller: ReadableStreamDefaultController<Uint8Array>) {
    this.controller = controller;
  }

  async initLog(filename: string): Promise<string> {
    const { data, error } = await this.supabase
      .from('cv_processing_logs')
      .insert({
        cv_filename: filename,
        started_at: new Date().toISOString(),
        status: 'processing',
        total_chunks: 0,
        processed_chunks: 0,
        log_entries: [],
        error: null,
        result_summary: null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create log entry:', error);
      this.logId = null;
    } else {
      this.logId = data.id;
    }
    return this.logId || '';
  }

  async send(stage: string, message: string, details?: Record<string, any>) {
    const event: ProgressEvent = {
      stage,
      message,
      timestamp: Date.now(),
      details,
    };

    this.logEntries.push(event);

    // Send SSE
    if (this.controller) {
      const data = JSON.stringify(event);
      this.controller.enqueue(this.encoder.encode(`data: ${data}\n\n`));
    }

    // Log to console
    const detailStr = details ? ` | ${JSON.stringify(details)}` : '';
    console.log(`[${stage}] ${message}${detailStr}`);

    // Update database log
    if (this.logId) {
      await this.supabase
        .from('cv_processing_logs')
        .update({ log_entries: this.logEntries })
        .eq('id', this.logId);
    }
  }

  async updateProgress(processedChunks: number, totalChunks: number) {
    if (this.logId) {
      await this.supabase
        .from('cv_processing_logs')
        .update({ 
          processed_chunks: processedChunks,
          total_chunks: totalChunks,
        })
        .eq('id', this.logId);
    }
  }

  async complete(resultSummary: Record<string, any>) {
    if (this.logId) {
      await this.supabase
        .from('cv_processing_logs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          result_summary: resultSummary,
          log_entries: this.logEntries,
        })
        .eq('id', this.logId);
    }
  }

  async fail(error: Record<string, any>) {
    if (this.logId) {
      await this.supabase
        .from('cv_processing_logs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: error,
          log_entries: this.logEntries,
        })
        .eq('id', this.logId);
    }
  }

  sendFinal(data: any) {
    if (this.controller) {
      const event = JSON.stringify({ stage: 'complete', result: data });
      this.controller.enqueue(this.encoder.encode(`data: ${event}\n\n`));
      this.controller.close();
    }
  }

  sendError(error: any) {
    if (this.controller) {
      const event = JSON.stringify({ stage: 'error', error });
      this.controller.enqueue(this.encoder.encode(`data: ${event}\n\n`));
      this.controller.close();
    }
  }
}

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
        allLines.push(lineText);
      }
    }
  }

  return allLines.join('\n');
}

function removeSensitiveData(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/\bID\s*#?\s*\d{9}\b/gi, '[ID REDACTED]');
  cleaned = cleaned.replace(/\b\d{9}\b/g, '[ID REDACTED]');
  cleaned = cleaned.replace(/\b\d{2,3}[-.\s]\d{3,6}[-.\s]\d{3,4}\b/g, '[ID REDACTED]');
  cleaned = cleaned.replace(/Home\s*Address[:\s]+[^\n]+/gi, '[ADDRESS REDACTED]');
  cleaned = cleaned.replace(/[\w.-]+@[\w.-]+\.\w+/g, '[EMAIL REDACTED]');
  return cleaned;
}

// ============================================================================
// SECTION HEADER DETECTION
// ============================================================================

const HEADER_KEYWORDS: Record<string, string[]> = {
  personal: ['PERSONAL', 'BIOGRAPHICAL', 'CURRICULUM VITAE', 'CV', 'NAME'],
  education: ['EDUCATION', 'ACADEMIC BACKGROUND', 'DEGREES', 'QUALIFICATIONS', 'FURTHER STUDIES'],
  experience: ['EXPERIENCE', 'EMPLOYMENT', 'POSITIONS', 'APPOINTMENTS', 'ACADEMIC POSITIONS', 'PROFESSIONAL EXPERIENCE', 'CAREER'],
  publications: ['PUBLICATIONS', 'PAPERS', 'ARTICLES', 'REFEREED', 'JOURNAL', 'BOOKS', 'CHAPTERS'],
  grants: ['GRANTS', 'FUNDING', 'RESEARCH SUPPORT', 'SPONSORED RESEARCH'],
  teaching: ['TEACHING', 'COURSES', 'INSTRUCTION'],
  supervision: ['SUPERVISION', 'STUDENTS', 'ADVISEES', 'DOCTORAL', 'GRADUATE STUDENTS', 'THESIS'],
  awards: ['AWARDS', 'HONORS', 'PRIZES', 'FELLOWSHIPS', 'RECOGNITION'],
  memberships: ['MEMBERSHIPS', 'AFFILIATIONS', 'SOCIETIES', 'PROFESSIONAL ACTIVITIES'],
  other: ['REFERENCES', 'PATENTS', 'MEDIA', 'TALKS', 'PRESENTATIONS', 'CONFERENCES', 'SERVICE', 'COMMITTEES'],
};

function isHeader(line: string, prevLine: string, nextLine: string): { isHeader: boolean; type: string | null } {
  const trimmed = line.trim();
  
  // Too long to be a header
  if (trimmed.length > 80 || trimmed.length < 2) {
    return { isHeader: false, type: null };
  }

  // Contains patterns typical of content, not headers
  if (/\(\d{4}\)/.test(trimmed)) return { isHeader: false, type: null }; // Year in parentheses
  if (/pp?\.\s*\d+/.test(trimmed)) return { isHeader: false, type: null }; // Page numbers
  if (/vol\.\s*\d+/i.test(trimmed)) return { isHeader: false, type: null }; // Volume numbers
  if (trimmed.split(',').length > 3) return { isHeader: false, type: null }; // Too many commas (likely author list)

  // Check formatting patterns
  const hasLetterPrefix = /^[A-Z]\.\s+/i.test(trimmed); // "A. EDUCATION"
  const hasNumberPrefix = /^\d{1,2}\.\s+/i.test(trimmed); // "1. EDUCATION"
  const hasLetterNumberPrefix = /^[A-Z]\d+\.\s+/i.test(trimmed); // "G1. DOCTORAL STUDENTS"
  const isMostlyUppercase = (trimmed.replace(/[^a-zA-Z]/g, '').match(/[A-Z]/g)?.length || 0) > trimmed.replace(/[^a-zA-Z]/g, '').length * 0.5;
  const prevLineEmpty = !prevLine || prevLine.trim().length === 0;

  // Check for keyword match
  const upperLine = trimmed.toUpperCase();
  for (const [type, keywords] of Object.entries(HEADER_KEYWORDS)) {
    for (const keyword of keywords) {
      if (upperLine.includes(keyword)) {
        // Keyword match + formatting evidence = header
        if (hasLetterPrefix || hasNumberPrefix || isMostlyUppercase || prevLineEmpty) {
          return { isHeader: true, type };
        }
      }
    }
  }

  // Strong formatting signals even without keyword match
  if ((hasLetterPrefix || hasNumberPrefix) && isMostlyUppercase && prevLineEmpty) {
    return { isHeader: true, type: 'unknown' };
  }

  return { isHeader: false, type: null };
}

function detectSectionHeaders(text: string): SectionHeader[] {
  const lines = text.split('\n');
  const headers: SectionHeader[] = [];
  let charPosition = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prevLine = i > 0 ? lines[i - 1] : '';
    const nextLine = i < lines.length - 1 ? lines[i + 1] : '';

    const result = isHeader(line, prevLine, nextLine);
    if (result.isHeader) {
      // Skip subsection headers (like G1, G2 under main G section)
      const isSubsection = /^[A-Z]\d+\.\s+/i.test(line.trim());
      if (!isSubsection) {
        headers.push({
          position: charPosition,
          text: line.trim(),
          type: result.type || 'unknown',
        });
      }
    }

    charPosition += line.length + 1; // +1 for newline
  }

  return headers;
}

// ============================================================================
// TEXT CHUNKING
// ============================================================================

function splitIntoChunks(text: string, headers: SectionHeader[], maxChunkSize: number): ChunkInfo[] {
  const chunks: ChunkInfo[] = [];
  
  if (headers.length === 0) {
    // No headers found - split by size at paragraph boundaries
    return splitByParagraphs(text, maxChunkSize);
  }

  let currentChunkStart = 0;
  let currentChunkText = '';
  let currentStartSection: string | null = null;
  let chunkId = 1;

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const nextHeaderPos = i < headers.length - 1 ? headers[i + 1].position : text.length;
    const sectionText = text.substring(header.position, nextHeaderPos);

    // Would adding this section exceed chunk size?
    if (currentChunkText.length + sectionText.length > maxChunkSize && currentChunkText.length > 0) {
      // Save current chunk
      chunks.push({
        id: chunkId++,
        text: currentChunkText,
        startSection: currentStartSection,
        charCount: currentChunkText.length,
      });

      // Start new chunk with this section
      currentChunkText = sectionText;
      currentStartSection = header.type;
    } else {
      // Add section to current chunk
      if (currentChunkText.length === 0) {
        currentStartSection = header.type;
      }
      currentChunkText += sectionText;
    }
  }

  // Don't forget the last chunk
  if (currentChunkText.length > 0) {
    chunks.push({
      id: chunkId,
      text: currentChunkText,
      startSection: currentStartSection,
      charCount: currentChunkText.length,
    });
  }

  // Handle text before first header
  if (headers.length > 0 && headers[0].position > 0) {
    const preHeaderText = text.substring(0, headers[0].position);
    if (preHeaderText.trim().length > 100) {
      chunks.unshift({
        id: 0,
        text: preHeaderText,
        startSection: 'personal',
        charCount: preHeaderText.length,
      });
      // Renumber chunks
      chunks.forEach((chunk, idx) => chunk.id = idx + 1);
    }
  }

  return chunks;
}

function splitByParagraphs(text: string, maxChunkSize: number): ChunkInfo[] {
  const chunks: ChunkInfo[] = [];
  const paragraphs = text.split(/\n\s*\n/);
  let currentChunk = '';
  let chunkId = 1;

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        id: chunkId++,
        text: currentChunk,
        startSection: null,
        charCount: currentChunk.length,
      });
      currentChunk = para;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push({
      id: chunkId,
      text: currentChunk,
      startSection: null,
      charCount: currentChunk.length,
    });
  }

  return chunks;
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
// LLM EXTRACTION - SINGLE CHUNK
// ============================================================================

async function extractFromChunk(
  chunkText: string,
  chunkId: number,
  totalChunks: number,
  continuingSection: string | null,
  sse: SSEWriter
): Promise<Partial<ParsedCV>> {
  
  const systemPrompt = `You are an expert CV parser for an academic research database. Extract information from this CV chunk into structured JSON.

${continuingSection ? `NOTE: This chunk continues from a previous section. The text may start mid-section (type: ${continuingSection}). Parse accordingly.` : ''}

CRITICAL INSTRUCTIONS:
1. The person's NAME is typically at the top of the CV (in chunk 1). Ignore titles like "Ph.D.", "Dr.", "Prof.".
2. Extract EVERY education entry, work position, publication, etc. found in this chunk.
3. For dates: use the year (e.g., "2024") or year range start.
4. DO NOT extract email addresses or phone numbers.

PUBLICATIONS - STRICT DEFINITION:
INCLUDE: Journal articles, conference papers, books, book chapters, technical reports, preprints.
EXCLUDE: Patents, press coverage, blog posts, presentations (unless in proceedings).

Return ONLY valid JSON with this structure (include only fields found in this chunk):
{
  "personal": { "firstName": "", "lastName": "", "birthYear": null, "birthCountry": null },
  "education": [],
  "publications": [],
  "experience": [],
  "grants": [],
  "teaching": [],
  "supervision": [],
  "memberships": [],
  "awards": []
}

If a category has no entries in this chunk, return an empty array for it.`;

  const startTime = Date.now();
  
  await sse.send('llm_call', `Sending chunk ${chunkId}/${totalChunks} to ${LLM_PROVIDER}`, {
    chunkId,
    totalChunks,
    charCount: chunkText.length,
    continuingSection,
    provider: LLM_PROVIDER,
    model: LLM_PROVIDER === 'gemini' ? CONFIG.gemini.model : CONFIG.openai.model,
  });

  let response: Response;

  if (LLM_PROVIDER === "gemini") {
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) throw new Error("GEMINI_API_KEY not configured");

    response = await fetchWithTimeout(
      `${CONFIG.gemini.apiEndpoint}/models/${CONFIG.gemini.model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiApiKey,
        },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{ text: `${systemPrompt}\n\nCV CHUNK ${chunkId}/${totalChunks}:\n\n${chunkText}` }]
          }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        }),
      },
      CONFIG.apiTimeoutMs
    );
  } else {
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) throw new Error("OPENAI_API_KEY not configured");

    response = await fetchWithTimeout(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: CONFIG.openai.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `CV CHUNK ${chunkId}/${totalChunks}:\n\n${chunkText}` },
          ],
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
      },
      CONFIG.apiTimeoutMs
    );
  }

  const elapsed = Date.now() - startTime;

  if (!response.ok) {
    const errorText = await response.text();
    await sse.send('llm_error', `Chunk ${chunkId}/${totalChunks} failed`, {
      chunkId,
      status: response.status,
      error: errorText.substring(0, 500),
      elapsedMs: elapsed,
    });
    throw new Error(`${LLM_PROVIDER} API error: ${response.status} - ${errorText.substring(0, 200)}`);
  }

  const result = await response.json();
  let content: string;

  if (LLM_PROVIDER === "gemini") {
    if (!result.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error("Invalid Gemini response structure");
    }
    content = result.candidates[0].content.parts[0].text;
  } else {
    if (!result.choices?.[0]?.message?.content) {
      throw new Error("Invalid OpenAI response structure");
    }
    content = result.choices[0].message.content;
  }

  let parsed: Partial<ParsedCV>;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    await sse.send('parse_error', `Failed to parse JSON from chunk ${chunkId}`, {
      chunkId,
      error: e instanceof Error ? e.message : 'Unknown',
      contentPreview: content.substring(0, 200),
    });
    throw new Error(`JSON parse failed for chunk ${chunkId}: ${e instanceof Error ? e.message : 'Unknown'}`);
  }

  // Count extracted items
  const itemCounts: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (Array.isArray(value)) {
      itemCounts[key] = value.length;
    }
  }

  await sse.send('llm_response', `Chunk ${chunkId}/${totalChunks} processed`, {
    chunkId,
    totalChunks,
    elapsedMs: elapsed,
    itemCounts,
    provider: LLM_PROVIDER,
  });

  return parsed;
}

// ============================================================================
// MERGE CHUNK RESULTS
// ============================================================================

function mergeResults(chunks: Partial<ParsedCV>[]): ParsedCV {
  const merged: ParsedCV = {
    personal: { firstName: '', lastName: '', birthYear: null, birthCountry: null },
    education: [],
    publications: [],
    experience: [],
    grants: [],
    teaching: [],
    supervision: [],
    memberships: [],
    awards: [],
  };

  for (const chunk of chunks) {
    // Personal info - take from first chunk that has it
    if (chunk.personal) {
      if (!merged.personal.firstName && chunk.personal.firstName) {
        merged.personal.firstName = normalizeName(chunk.personal.firstName);
      }
      if (!merged.personal.lastName && chunk.personal.lastName) {
        merged.personal.lastName = normalizeName(chunk.personal.lastName);
      }
      if (!merged.personal.birthYear && chunk.personal.birthYear) {
        merged.personal.birthYear = chunk.personal.birthYear;
      }
      if (!merged.personal.birthCountry && chunk.personal.birthCountry) {
        merged.personal.birthCountry = chunk.personal.birthCountry;
      }
    }

    // Arrays - concatenate
    if (chunk.education) merged.education.push(...chunk.education);
    if (chunk.publications) merged.publications.push(...chunk.publications);
    if (chunk.experience) merged.experience.push(...chunk.experience);
    if (chunk.grants) merged.grants.push(...chunk.grants);
    if (chunk.teaching) merged.teaching.push(...chunk.teaching);
    if (chunk.supervision) merged.supervision.push(...chunk.supervision);
    if (chunk.memberships) merged.memberships.push(...chunk.memberships);
    if (chunk.awards) merged.awards.push(...chunk.awards);
  }

  // Deduplicate publications by title+year
  merged.publications = deduplicateByKey(merged.publications, p => `${p.title?.toLowerCase()}|${p.publicationYear}`);
  
  // Deduplicate education by institution+degree
  merged.education = deduplicateByKey(merged.education, e => `${e.institution?.toLowerCase()}|${e.degreeType?.toLowerCase()}`);
  
  // Deduplicate experience by institution+position+dates
  merged.experience = deduplicateByKey(merged.experience, e => `${e.institution?.toLowerCase()}|${e.positionTitle?.toLowerCase()}|${e.startDate}`);

  return merged;
}

function deduplicateByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  
  for (const item of items) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  
  return result;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const sse = new SSEWriter(supabase);

  // Create streaming response
  const stream = new ReadableStream({
    async start(controller) {
      sse.setController(controller);

      try {
        // Parse request
        let pdfFilename: string;
        try {
          const body = await req.json();
          pdfFilename = body.pdfFilename;
        } catch (e) {
          await sse.send('error', 'Invalid JSON in request body', { stage: 'request_parsing' });
          sse.sendError({ error: 'INVALID_REQUEST', message: 'Invalid JSON in request body' });
          return;
        }

        if (!pdfFilename) {
          await sse.send('error', 'PDF filename is required', { stage: 'validation' });
          sse.sendError({ error: 'MISSING_FILENAME', message: 'PDF filename is required' });
          return;
        }

        await sse.send('start', 'Processing started', { filename: pdfFilename, provider: LLM_PROVIDER });
        await sse.initLog(pdfFilename);

        // Download PDF
        await sse.send('pdf_download', 'Downloading PDF...', { filename: pdfFilename });
        const downloadStart = Date.now();
        
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('academiq-cvs')
          .download(pdfFilename);

        if (downloadError || !fileData) {
          await sse.send('error', 'PDF download failed', { 
            stage: 'pdf_download',
            error: downloadError?.message || 'File not found',
          });
          await sse.fail({ stage: 'pdf_download', error: downloadError?.message });
          sse.sendError({ error: 'PDF_DOWNLOAD_FAILED', message: downloadError?.message || 'File not found' });
          return;
        }

        const downloadMs = Date.now() - downloadStart;
        const fileSize = fileData.size;
        await sse.send('pdf_download', 'PDF downloaded', { bytes: fileSize, ms: downloadMs });

        // Extract text
        await sse.send('text_extraction', 'Extracting text from PDF...', {});
        const extractStart = Date.now();
        
        let cvText: string;
        try {
          const arrayBuffer = await fileData.arrayBuffer();
          cvText = await extractTextFromPDF(arrayBuffer);
        } catch (error) {
          await sse.send('error', 'PDF text extraction failed', {
            stage: 'text_extraction',
            error: error instanceof Error ? error.message : 'Unknown',
          });
          await sse.fail({ stage: 'text_extraction', error: error instanceof Error ? error.message : 'Unknown' });
          sse.sendError({ error: 'PDF_PARSE_FAILED', message: error instanceof Error ? error.message : 'Unknown' });
          return;
        }

        const extractMs = Date.now() - extractStart;
        await sse.send('text_extraction', 'Text extracted', { chars: cvText.length, ms: extractMs });

        if (cvText.trim().length < 100) {
          await sse.send('error', 'PDF contains no readable text', { stage: 'text_validation', chars: cvText.trim().length });
          await sse.fail({ stage: 'text_validation', error: 'No readable text' });
          sse.sendError({ error: 'NO_TEXT', message: 'PDF contains no readable text or is too short' });
          return;
        }

        // Clean sensitive data
        cvText = removeSensitiveData(cvText);
        await sse.send('text_cleaning', 'Sensitive data removed', { chars: cvText.length });

        // Detect section headers
        await sse.send('section_detection', 'Detecting section headers...', {});
        const headers = detectSectionHeaders(cvText);
        await sse.send('section_detection', `Found ${headers.length} section headers`, {
          count: headers.length,
          sections: headers.map(h => ({ text: h.text.substring(0, 50), type: h.type, position: h.position })),
        });

        // Split into chunks
        await sse.send('chunking', 'Splitting CV into chunks...', { totalChars: cvText.length, targetChunkSize: CONFIG.chunkSize });
        const chunks = splitIntoChunks(cvText, headers, CONFIG.chunkSize);
        await sse.send('chunking', `Split into ${chunks.length} chunks`, {
          totalChunks: chunks.length,
          chunks: chunks.map(c => ({ id: c.id, chars: c.charCount, startSection: c.startSection })),
        });

        await sse.updateProgress(0, chunks.length);

        // Process each chunk
        const chunkResults: Partial<ParsedCV>[] = [];
        let lastSection: string | null = null;

        for (const chunk of chunks) {
          try {
            const continuingSection = chunk.startSection || lastSection;
            const result = await extractFromChunk(
              chunk.text,
              chunk.id,
              chunks.length,
              continuingSection,
              sse
            );
            chunkResults.push(result);
            
            // Track the last section for continuity
            if (chunk.startSection) {
              lastSection = chunk.startSection;
            }

            await sse.updateProgress(chunk.id, chunks.length);
          } catch (error) {
            await sse.send('chunk_error', `Failed to process chunk ${chunk.id}`, {
              chunkId: chunk.id,
              error: error instanceof Error ? error.message : 'Unknown',
            });
            // Continue with other chunks instead of failing completely
            chunkResults.push({});
          }
        }

        // Merge results
        await sse.send('merging', 'Merging chunk results...', { chunkCount: chunkResults.length });
        const mergedResult = mergeResults(chunkResults);

        const totalMs = Date.now() - startTime;
        
        // Create summary
        const resultSummary = {
          personal: `${mergedResult.personal.firstName} ${mergedResult.personal.lastName}`,
          education: mergedResult.education.length,
          publications: mergedResult.publications.length,
          experience: mergedResult.experience.length,
          grants: mergedResult.grants.length,
          teaching: mergedResult.teaching.length,
          supervision: mergedResult.supervision.length,
          memberships: mergedResult.memberships.length,
          awards: mergedResult.awards.length,
          totalMs,
          chunks: chunks.length,
          provider: LLM_PROVIDER,
        };

        await sse.send('complete', 'Processing complete', resultSummary);
        await sse.complete(resultSummary);

        // Check for duplicates
        const { data: existing } = await supabase
          .from("persons")
          .select("id, first_name, last_name, created_at")
          .eq("first_name", mergedResult.personal.firstName)
          .eq("last_name", mergedResult.personal.lastName)
          .maybeSingle();

        if (existing) {
          sse.sendFinal({
            warning: 'DUPLICATE_CV',
            message: 'A person with this name already exists',
            existingPerson: existing,
            result: mergedResult,
            _metadata: resultSummary,
          });
        } else {
          sse.sendFinal({
            ...mergedResult,
            _metadata: resultSummary,
          });
        }

      } catch (error) {
        console.error('Unexpected error:', error);
        await sse.send('error', 'Unexpected error occurred', {
          stage: 'unknown',
          error: error instanceof Error ? error.message : 'Unknown',
          stack: error instanceof Error ? error.stack : undefined,
        });
        await sse.fail({
          stage: 'unknown',
          error: error instanceof Error ? error.message : 'Unknown',
        });
        sse.sendError({
          error: 'UNEXPECTED_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});