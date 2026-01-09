import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as pdfjsLib from "npm:pdfjs-dist@4.0.379";

const OPENAI_MODELS: Record<string, { name: string; tier: string }> = {
  "gpt-5-mini": { name: "GPT-5 Mini", tier: "ultrafast" },
  "gpt-5": { name: "GPT-5", tier: "intelligent" },
  "gpt-5.2": { name: "GPT-5.2", tier: "advanced" },
};

const DEFAULT_MODEL = "gpt-5-mini";
const OPENAI_API_ENDPOINT = "https://api.openai.com/v1";

const CONFIG = {
  maxRetries: 2,
  retryDelayMs: 500,
  apiTimeoutMs: 180000,
  chunkSize: 20000,
  heartbeatIntervalMs: 25000,
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

interface SpeedMetrics {
  inputChars: number;
  outputChars: number;
  elapsedMs: number;
  outputCharsPerSec: number;
}

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

  async initLog(filename: string, model: string): Promise<string> {
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
        model: model,
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

    if (this.controller) {
      const data = JSON.stringify(event);
      this.controller.enqueue(this.encoder.encode(`data: ${data}\n\n`));
    }

    const detailStr = details ? ` | ${JSON.stringify(details)}` : '';
    console.log(`[${stage}] ${message}${detailStr}`);

    if (this.logId) {
      this.supabase
        .from('cv_processing_logs')
        .update({ log_entries: this.logEntries })
        .eq('id', this.logId)
        .then(() => {})
        .catch((e: any) => console.error('Log update failed:', e));
    }
  }

  sendHeartbeat() {
    if (this.controller) {
      const event = JSON.stringify({ stage: 'heartbeat', timestamp: Date.now() });
      this.controller.enqueue(this.encoder.encode(`data: ${event}\n\n`));
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
  
  if (trimmed.length > 80 || trimmed.length < 2) {
    return { isHeader: false, type: null };
  }

  if (/(\d{4})/.test(trimmed)) return { isHeader: false, type: null };
  if (/pp?\.\s*\d+/.test(trimmed)) return { isHeader: false, type: null };
  if (/vol\.\s*\d+/i.test(trimmed)) return { isHeader: false, type: null };
  if (trimmed.split(',').length > 3) return { isHeader: false, type: null };

  const hasLetterPrefix = /^[A-Z]\.\s+/i.test(trimmed);
  const hasNumberPrefix = /^\d{1,2}\.\s+/i.test(trimmed);
  const hasLetterNumberPrefix = /^[A-Z]\d+\.\s+/i.test(trimmed);
  const isMostlyUppercase = (trimmed.replace(/[^a-zA-Z]/g, '').match(/[A-Z]/g)?.length || 0) > trimmed.replace(/[^a-zA-Z]/g, '').length * 0.5;
  const prevLineEmpty = !prevLine || prevLine.trim().length === 0;

  const upperLine = trimmed.toUpperCase();
  for (const [type, keywords] of Object.entries(HEADER_KEYWORDS)) {
    for (const keyword of keywords) {
      if (upperLine.includes(keyword)) {
        if (hasLetterPrefix || hasNumberPrefix || isMostlyUppercase || prevLineEmpty) {
          return { isHeader: true, type };
        }
      }
    }
  }

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
      const isSubsection = /^[A-Z]\d+\.\s+/i.test(line.trim());
      if (!isSubsection) {
        headers.push({
          position: charPosition,
          text: line.trim(),
          type: result.type || 'unknown',
        });
      }
    }

    charPosition += line.length + 1;
  }

  return headers;
}

function splitIntoChunks(text: string, headers: SectionHeader[], maxChunkSize: number): ChunkInfo[] {
  const chunks: ChunkInfo[] = [];
  
  if (headers.length === 0) {
    return splitByParagraphs(text, maxChunkSize);
  }

  let currentChunkText = '';
  let currentStartSection: string | null = null;
  let chunkId = 1;

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const nextHeaderPos = i < headers.length - 1 ? headers[i + 1].position : text.length;
    const sectionText = text.substring(header.position, nextHeaderPos);

    if (currentChunkText.length + sectionText.length > maxChunkSize && currentChunkText.length > 0) {
      chunks.push({
        id: chunkId++,
        text: currentChunkText,
        startSection: currentStartSection,
        charCount: currentChunkText.length,
      });

      currentChunkText = sectionText;
      currentStartSection = header.type;
    } else {
      if (currentChunkText.length === 0) {
        currentStartSection = header.type;
      }
      currentChunkText += sectionText;
    }
  }

  if (currentChunkText.length > 0) {
    chunks.push({
      id: chunkId,
      text: currentChunkText,
      startSection: currentStartSection,
      charCount: currentChunkText.length,
    });
  }

  if (headers.length > 0 && headers[0].position > 0) {
    const preHeaderText = text.substring(0, headers[0].position);
    if (preHeaderText.trim().length > 100) {
      chunks.unshift({
        id: 0,
        text: preHeaderText,
        startSection: 'personal',
        charCount: preHeaderText.length,
      });
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

async function extractFromChunk(
  chunkText: string,
  chunkId: number,
  totalChunks: number,
  continuingSection: string | null,
  model: string,
  sse: SSEWriter
): Promise<{ parsed: Partial<ParsedCV>; metrics: SpeedMetrics }> {

  const inputPrompt = `You are an expert CV parser for an academic research database. Extract information from this CV chunk into structured JSON.

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

If a category has no entries in this chunk, return an empty array for it.

CV CHUNK ${chunkId}/${totalChunks}:

${chunkText}`;

  const modelInfo = OPENAI_MODELS[model] || OPENAI_MODELS[DEFAULT_MODEL];

  await sse.send('llm_call', `Sending chunk ${chunkId}/${totalChunks} to ${modelInfo.name}`, {
    chunkId,
    totalChunks,
    inputChars: chunkText.length,
    continuingSection,
    model,
    modelName: modelInfo.name,
    modelTier: modelInfo.tier,
  });

  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiApiKey) throw new Error("OPENAI_API_KEY not configured");

  const heartbeatInterval = setInterval(() => {
    sse.sendHeartbeat();
  }, CONFIG.heartbeatIntervalMs);

  const startTime = Date.now();
  let response: Response;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.apiTimeoutMs);

    const requestBody: any = {
      model: model,
      messages: [
        {
          role: "user",
          content: inputPrompt
        }
      ],
      reasoning_effort: "none",
      response_format: { type: "json_object" },
    };

    try {
      response = await fetch(
        `${OPENAI_API_ENDPOINT}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        }
      );
    } catch (fetchError) {
      clearTimeout(timeoutId);
      const elapsed = Date.now() - startTime;

      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        await sse.send('llm_error', `Chunk ${chunkId}/${totalChunks} timed out`, {
          chunkId,
          error: `Request timeout after ${elapsed}ms`,
          timeoutMs: CONFIG.apiTimeoutMs,
          elapsedMs: elapsed,
          model,
        });
        throw new Error(`OpenAI API timeout after ${elapsed}ms`);
      }

      throw fetchError;
    } finally {
      clearTimeout(timeoutId);
    }
  } finally {
    clearInterval(heartbeatInterval);
  }

  const elapsed = Date.now() - startTime;

  if (!response.ok) {
    const errorText = await response.text();
    await sse.send('llm_error', `Chunk ${chunkId}/${totalChunks} failed`, {
      chunkId,
      status: response.status,
      error: errorText.substring(0, 500),
      elapsedMs: elapsed,
      model,
    });
    throw new Error(`OpenAI API error: ${response.status} - ${errorText.substring(0, 200)}`);
  }

  const result = await response.json();

  if (result.error) {
    await sse.send('llm_error', `OpenAI API error for chunk ${chunkId}`, {
      chunkId,
      errorType: result.error.type,
      errorCode: result.error.code,
      errorMessage: result.error.message,
      model,
    });
    throw new Error(`OpenAI API error: ${result.error.message}`);
  }

  if (!result.choices?.[0]?.message?.content) {
    await sse.send('llm_error', `Invalid response structure from chunk ${chunkId}`, {
      chunkId,
      responseKeys: Object.keys(result),
      responsePreview: JSON.stringify(result).substring(0, 300),
    });
    throw new Error(`Invalid OpenAI response structure. Keys: ${Object.keys(result).join(', ')}`);
  }

  const content = result.choices[0].message.content;
  const outputChars = content.length;

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

  const metrics: SpeedMetrics = {
    inputChars: chunkText.length,
    outputChars,
    elapsedMs: elapsed,
    outputCharsPerSec: elapsed > 0 ? Math.round((outputChars / elapsed) * 1000) : 0,
  };

  const itemCounts: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (Array.isArray(value)) {
      itemCounts[key] = value.length;
    }
  }

  await sse.send('llm_response', `Chunk ${chunkId}/${totalChunks} processed`, {
    chunkId,
    totalChunks,
    model,
    modelName: modelInfo.name,
    itemCounts,
    speed: metrics,
  });

  return { parsed, metrics };
}

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

    if (chunk.education) merged.education.push(...chunk.education);
    if (chunk.publications) merged.publications.push(...chunk.publications);
    if (chunk.experience) merged.experience.push(...chunk.experience);
    if (chunk.grants) merged.grants.push(...chunk.grants);
    if (chunk.teaching) merged.teaching.push(...chunk.teaching);
    if (chunk.supervision) merged.supervision.push(...chunk.supervision);
    if (chunk.memberships) merged.memberships.push(...chunk.memberships);
    if (chunk.awards) merged.awards.push(...chunk.awards);
  }

  merged.publications = deduplicateByKey(merged.publications, p => `${p.title?.toLowerCase()}|${p.publicationYear}`);
  merged.education = deduplicateByKey(merged.education, e => `${e.institution?.toLowerCase()}|${e.degreeType?.toLowerCase()}`);
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

  const stream = new ReadableStream({
    async start(controller) {
      sse.setController(controller);

      try {
        let pdfFilename: string;
        let model: string;
        
        try {
          const body = await req.json();
          pdfFilename = body.pdfFilename;

          if (body.model && OPENAI_MODELS[body.model]) {
            model = body.model;
          } else if (body.model) {
            await sse.send('warning', `Unknown model "${body.model}", using default`, {
              requestedModel: body.model,
              defaultModel: DEFAULT_MODEL,
            });
            model = DEFAULT_MODEL;
          } else {
            model = DEFAULT_MODEL;
          }
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

        const modelInfo = OPENAI_MODELS[model];
        await sse.send('start', 'Processing started', { 
          filename: pdfFilename, 
          model,
          modelName: modelInfo.name,
          modelTier: modelInfo.tier,
        });
        await sse.initLog(pdfFilename, model);

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

        cvText = removeSensitiveData(cvText);
        await sse.send('text_cleaning', 'Sensitive data removed', { chars: cvText.length });

        await sse.send('section_detection', 'Detecting section headers...', {});
        const headers = detectSectionHeaders(cvText);
        await sse.send('section_detection', `Found ${headers.length} section headers`, {
          count: headers.length,
          sections: headers.map(h => ({ text: h.text.substring(0, 50), type: h.type, position: h.position })),
        });

        await sse.send('chunking', 'Splitting CV into chunks...', { totalChars: cvText.length, targetChunkSize: CONFIG.chunkSize });
        const chunks = splitIntoChunks(cvText, headers, CONFIG.chunkSize);
        await sse.send('chunking', `Split into ${chunks.length} chunks`, {
          totalChunks: chunks.length,
          chunks: chunks.map(c => ({ id: c.id, chars: c.charCount, startSection: c.startSection })),
        });

        await sse.updateProgress(0, chunks.length);

        const chunkResults: Partial<ParsedCV>[] = [];
        const allMetrics: SpeedMetrics[] = [];
        let lastSection: string | null = null;

        for (const chunk of chunks) {
          try {
            const continuingSection = chunk.startSection || lastSection;
            const { parsed, metrics } = await extractFromChunk(
              chunk.text,
              chunk.id,
              chunks.length,
              continuingSection,
              model,
              sse
            );
            chunkResults.push(parsed);
            allMetrics.push(metrics);
            
            if (chunk.startSection) {
              lastSection = chunk.startSection;
            }

            await sse.updateProgress(chunk.id, chunks.length);
          } catch (error) {
            await sse.send('chunk_error', `Failed to process chunk ${chunk.id}`, {
              chunkId: chunk.id,
              error: error instanceof Error ? error.message : 'Unknown',
            });
            chunkResults.push({});
          }
        }

        await sse.send('merging', 'Merging chunk results...', { chunkCount: chunkResults.length });
        const mergedResult = mergeResults(chunkResults);

        const totalMs = Date.now() - startTime;
        
        const totalInputChars = allMetrics.reduce((sum, m) => sum + m.inputChars, 0);
        const totalOutputChars = allMetrics.reduce((sum, m) => sum + m.outputChars, 0);
        const totalLlmMs = allMetrics.reduce((sum, m) => sum + m.elapsedMs, 0);
        const avgOutputCharsPerSec = totalLlmMs > 0 ? Math.round((totalOutputChars / totalLlmMs) * 1000) : 0;

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
          model,
          modelName: modelInfo.name,
          speed: {
            totalInputChars,
            totalOutputChars,
            totalLlmMs,
            avgOutputCharsPerSec,
          },
        };

        await sse.send('complete', 'Processing complete', resultSummary);
        await sse.complete(resultSummary);

        const { data: existing } = await supabase
          .from("academiq_persons")
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