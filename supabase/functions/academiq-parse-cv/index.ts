import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OPENAI_API_ENDPOINT = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-5-mini-2025-08-07";

interface OpenAIModel {
  name: string;
  tier: "fast" | "balanced" | "powerful";
  supportsReasoning: boolean;
}

const OPENAI_MODELS: Record<string, OpenAIModel> = {
  "gpt-5-mini": { name: "GPT-5 Mini", tier: "fast", supportsReasoning: true },
  "gpt-5-mini-2025-08-07": { name: "GPT-5 Mini", tier: "fast", supportsReasoning: true },
  "gpt-5": { name: "GPT-5", tier: "balanced", supportsReasoning: true },
  "gpt-5-2025-08-07": { name: "GPT-5", tier: "balanced", supportsReasoning: true },
  "gpt-5.2": { name: "GPT-5.2", tier: "powerful", supportsReasoning: true },
  "gpt-5.2-2025-08-07": { name: "GPT-5.2", tier: "powerful", supportsReasoning: true },
};

const CONFIG = {
  maxChunkSize: 18000,
  targetChunkSize: 15000,
  sectionBreakThreshold: 500,
  apiTimeoutMs: 300000,
  heartbeatIntervalMs: 15000,
};

interface ParsedCV {
  personal: {
    firstName: string;
    lastName: string;
    birthYear: number | null;
    birthCountry: string | null;
  };
  education: Array<{
    institution: string;
    degree: string;
    field: string;
    year: number;
    country: string;
  }>;
  publications: Array<{
    title: string;
    year: number;
    type: string;
    venue: string;
    authors: string;
  }>;
  experience: Array<{
    institution: string;
    position: string;
    startYear: number;
    endYear: number | null;
    country: string;
  }>;
  grants: Array<{
    title: string;
    funder: string;
    year: number;
    amount: number | null;
  }>;
  teaching: Array<{
    course: string;
    institution: string;
    year: number;
  }>;
  supervision: Array<{
    studentName: string;
    degree: string;
    year: number;
    role: string;
  }>;
  memberships: Array<{
    organization: string;
    startYear: number;
    endYear: number | null;
  }>;
  awards: Array<{
    title: string;
    year: number;
    organization: string;
  }>;
}

interface CVChunk {
  id: number;
  text: string;
  startSection: string | null;
  charCount: number;
}

interface SpeedMetrics {
  llmMs: number;
  inputChars: number;
  outputChars: number;
}

class SSEWriter {
  private encoder = new TextEncoder();
  private writer: WritableStreamDefaultWriter<Uint8Array>;

  constructor(writer: WritableStreamDefaultWriter<Uint8Array>) {
    this.writer = writer;
  }

  async send(event: string, message: string, data?: any) {
    const payload = data ? { message, data } : { message };
    const sseData = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    await this.writer.write(this.encoder.encode(sseData));
  }

  async sendHeartbeat() {
    await this.writer.write(this.encoder.encode(":heartbeat\n\n"));
  }

  async close() {
    await this.writer.close();
  }
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, 200);
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ +/g, " ")
    .trim();
}

function detectSectionHeaders(text: string): string[] {
  const headerPatterns = [
    /^(EDUCATION|ACADEMIC QUALIFICATIONS|DEGREES)/im,
    /^(PROFESSIONAL EXPERIENCE|EMPLOYMENT|WORK HISTORY|CAREER)/im,
    /^(PUBLICATIONS|RESEARCH OUTPUT|SELECTED PUBLICATIONS)/im,
    /^(RESEARCH GRANTS|FUNDING|GRANTS)/im,
    /^(TEACHING|COURSES TAUGHT|TEACHING EXPERIENCE)/im,
    /^(SUPERVISION|STUDENT SUPERVISION|PHD STUDENTS)/im,
    /^(PROFESSIONAL MEMBERSHIPS|MEMBERSHIPS|AFFILIATIONS)/im,
    /^(AWARDS|HONORS|RECOGNITION)/im,
  ];

  const headers: string[] = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length > 3 && line.length < 60) {
      for (const pattern of headerPatterns) {
        if (pattern.test(line)) {
          headers.push(line);
          break;
        }
      }
    }
  }

  return headers;
}

function identifySectionType(text: string): string | null {
  const keywords = {
    education: ["university", "degree", "bachelor", "master", "phd", "doctorate"],
    publications: ["journal", "conference", "proceedings", "published", "isbn", "doi"],
    experience: ["professor", "researcher", "position", "employed", "faculty"],
    grants: ["grant", "funding", "award", "funder", "research council"],
    teaching: ["course", "teaching", "lecture", "instructor", "students"],
    supervision: ["supervision", "supervised", "phd student", "thesis"],
    memberships: ["member", "committee", "board", "society", "association"],
    awards: ["award", "prize", "honor", "recognition", "medal"],
  };

  const lowerText = text.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [section, words] of Object.entries(keywords)) {
    scores[section] = words.reduce((count, word) => {
      const regex = new RegExp(`\\b${word}\\b`, "gi");
      return count + (lowerText.match(regex) || []).length;
    }, 0);
  }

  const maxScore = Math.max(...Object.values(scores));
  if (maxScore > 2) {
    return Object.keys(scores).find(key => scores[key] === maxScore) || null;
  }

  return null;
}

function chunkCV(text: string): CVChunk[] {
  const normalizedText = normalizeText(text);
  const headers = detectSectionHeaders(normalizedText);
  const chunks: CVChunk[] = [];
  let chunkId = 1;
  let currentChunk = "";
  let lastSectionType: string | null = null;

  const lines = normalizedText.split("\n");
  let currentPosition = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isHeader = headers.includes(line.trim());

    if (isHeader && currentChunk.length > CONFIG.sectionBreakThreshold) {
      const sectionType = identifySectionType(currentChunk);
      chunks.push({
        id: chunkId++,
        text: currentChunk.trim(),
        startSection: lastSectionType,
        charCount: currentChunk.length,
      });
      lastSectionType = sectionType;
      currentChunk = line + "\n";
      currentPosition = 0;
    } else if (currentChunk.length + line.length > CONFIG.maxChunkSize) {
      const sectionType = identifySectionType(currentChunk);
      chunks.push({
        id: chunkId++,
        text: currentChunk.trim(),
        startSection: lastSectionType,
        charCount: currentChunk.length,
      });
      lastSectionType = sectionType;
      currentChunk = line + "\n";
      currentPosition = 0;
    } else {
      currentChunk += line + "\n";
      currentPosition += line.length + 1;
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
      reasoning_effort: "high",
      response_format: { type: "json_object" }
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
  const content = result.choices?.[0]?.message?.content || '{}';
  const outputChars = content.length;

  await sse.send('llm_response', `Chunk ${chunkId}/${totalChunks} completed`, {
    chunkId,
    outputChars,
    elapsedMs: elapsed,
    model,
  });

  let parsed: Partial<ParsedCV>;
  try {
    parsed = JSON.parse(content);
  } catch (parseError) {
    await sse.send('parse_error', `Failed to parse JSON from chunk ${chunkId}`, {
      chunkId,
      error: parseError instanceof Error ? parseError.message : 'Unknown error',
      content: content.substring(0, 500),
    });
    throw new Error(`JSON parse error: ${parseError instanceof Error ? parseError.message : 'Unknown'}`);
  }

  return {
    parsed,
    metrics: {
      llmMs: elapsed,
      inputChars: chunkText.length,
      outputChars,
    },
  };
}

function mergeResults(results: Array<Partial<ParsedCV>>): ParsedCV {
  const merged: ParsedCV = {
    personal: { firstName: "", lastName: "", birthYear: null, birthCountry: null },
    education: [],
    publications: [],
    experience: [],
    grants: [],
    teaching: [],
    supervision: [],
    memberships: [],
    awards: [],
  };

  for (const result of results) {
    if (result.personal) {
      if (result.personal.firstName && !merged.personal.firstName) {
        merged.personal.firstName = result.personal.firstName;
      }
      if (result.personal.lastName && !merged.personal.lastName) {
        merged.personal.lastName = result.personal.lastName;
      }
      if (result.personal.birthYear && !merged.personal.birthYear) {
        merged.personal.birthYear = result.personal.birthYear;
      }
      if (result.personal.birthCountry && !merged.personal.birthCountry) {
        merged.personal.birthCountry = result.personal.birthCountry;
      }
    }

    if (result.education) merged.education.push(...result.education);
    if (result.publications) merged.publications.push(...result.publications);
    if (result.experience) merged.experience.push(...result.experience);
    if (result.grants) merged.grants.push(...result.grants);
    if (result.teaching) merged.teaching.push(...result.teaching);
    if (result.supervision) merged.supervision.push(...result.supervision);
    if (result.memberships) merged.memberships.push(...result.memberships);
    if (result.awards) merged.awards.push(...result.awards);
  }

  return merged;
}

interface ProcessingSummary {
  chunks: number;
  modelName: string;
  model: string;
  speed: {
    totalLlmMs: number;
    totalInputChars: number;
    totalOutputChars: number;
    avgOutputCharsPerSec: number;
  };
  totalMs: number;
  personal: string;
  education: number;
  publications: number;
  experience: number;
  grants: number;
  teaching: number;
  supervision: number;
  memberships: number;
  awards: number;
}

async function createSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase credentials not configured");
  }

  const { createClient } = await import("npm:@supabase/supabase-js@2.57.4");
  return createClient(supabaseUrl, supabaseKey);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const url = new URL(req.url);
    const cvId = url.searchParams.get("cvId");
    const model = url.searchParams.get("model") || DEFAULT_MODEL;

    if (!cvId) {
      return new Response(
        JSON.stringify({ error: "cvId parameter required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!OPENAI_MODELS[model]) {
      return new Response(
        JSON.stringify({ error: `Invalid model. Supported: ${Object.keys(OPENAI_MODELS).join(", ")}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = await createSupabaseClient();

    const { data: cvData, error: cvError } = await supabase
      .from("cvs")
      .select("id, filename, text_content, processed")
      .eq("id", cvId)
      .maybeSingle();

    if (cvError || !cvData) {
      return new Response(
        JSON.stringify({ error: "CV not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!cvData.text_content) {
      return new Response(
        JSON.stringify({ error: "CV has no text content" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const chunks = chunkCV(cvData.text_content);
    const totalChunks = chunks.length;

    const { data: logData, error: logError } = await supabase
      .from("cv_processing_logs")
      .insert({
        cv_id: cvId,
        cv_filename: sanitizeFilename(cvData.filename),
        model,
        status: "processing",
        total_chunks: totalChunks,
        processed_chunks: 0,
      })
      .select("id")
      .single();

    if (logError || !logData) {
      throw new Error(`Failed to create processing log: ${logError?.message}`);
    }

    const logId = logData.id;
    const modelInfo = OPENAI_MODELS[model];

    const stream = new ReadableStream({
      async start(controller) {
        const sse = new SSEWriter(controller.getWriter());
        const overallStartTime = Date.now();

        try {
          await sse.send('start', 'Starting CV processing', {
            cvId,
            filename: cvData.filename,
            totalChunks,
            model,
            modelName: modelInfo.name,
            modelTier: modelInfo.tier,
          });

          const results: Array<Partial<ParsedCV>> = [];
          const speedMetrics: SpeedMetrics[] = [];
          let continuingSection: string | null = null;

          for (const chunk of chunks) {
            await sse.send('chunk_start', `Processing chunk ${chunk.id}/${totalChunks}`, {
              chunkId: chunk.id,
              totalChunks,
              charCount: chunk.charCount,
            });

            const { parsed, metrics } = await extractFromChunk(
              chunk.text,
              chunk.id,
              totalChunks,
              continuingSection,
              model,
              sse
            );

            results.push(parsed);
            speedMetrics.push(metrics);
            continuingSection = identifySectionType(chunk.text);

            await supabase
              .from("cv_processing_logs")
              .update({ processed_chunks: chunk.id })
              .eq("id", logId);

            await sse.send('chunk_complete', `Chunk ${chunk.id}/${totalChunks} processed`, {
              chunkId: chunk.id,
              totalChunks,
              llmMs: metrics.llmMs,
            });
          }

          const merged = mergeResults(results);
          const totalMs = Date.now() - overallStartTime;

          const totalLlmMs = speedMetrics.reduce((sum, m) => sum + m.llmMs, 0);
          const totalInputChars = speedMetrics.reduce((sum, m) => sum + m.inputChars, 0);
          const totalOutputChars = speedMetrics.reduce((sum, m) => sum + m.outputChars, 0);
          const avgOutputCharsPerSec = totalLlmMs > 0 ? Math.round((totalOutputChars / totalLlmMs) * 1000) : 0;

          const summary: ProcessingSummary = {
            chunks: totalChunks,
            modelName: modelInfo.name,
            model,
            speed: {
              totalLlmMs,
              totalInputChars,
              totalOutputChars,
              avgOutputCharsPerSec,
            },
            totalMs,
            personal: `${merged.personal.firstName} ${merged.personal.lastName}`.trim(),
            education: merged.education.length,
            publications: merged.publications.length,
            experience: merged.experience.length,
            grants: merged.grants.length,
            teaching: merged.teaching.length,
            supervision: merged.supervision.length,
            memberships: merged.memberships.length,
            awards: merged.awards.length,
          };

          await supabase
            .from("cv_processing_logs")
            .update({
              status: "completed",
              result_summary: summary,
              completed_at: new Date().toISOString(),
            })
            .eq("id", logId);

          const { error: updateError } = await supabase
            .from("cvs")
            .update({
              processed: true,
              parsed_data: merged,
              researcher_name: summary.personal,
            })
            .eq("id", cvId);

          if (updateError) {
            throw updateError;
          }

          await sse.send('complete', 'Processing complete', {
            cvId,
            summary,
          });

          await sse.close();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";

          await sse.send('error', errorMessage, {
            cvId,
            error: errorMessage,
          });

          await supabase
            .from("cv_processing_logs")
            .update({
              status: "failed",
              error: errorMessage,
              completed_at: new Date().toISOString(),
            })
            .eq("id", logId);

          await sse.close();
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
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});