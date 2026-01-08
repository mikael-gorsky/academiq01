import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as pdfjsLib from "npm:pdfjs-dist@4.0.379";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  models: {
    structureAnalysis: "gpt-5.2-2025-12-11",  // Used ONCE per CV for structure
    extraction: "gpt-4.1-2025-04-14",          // Used for complex extractions only
  },
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

// Structure schema that LLM outputs in Pass 1
interface CVStructureSchema {
  personalInfo: {
    nameLocation: string;  // e.g., "line 1" or "after 'Name:'"
    namePattern: string;   // e.g., "Nava A. Shaked, Ph.D."
    emailPattern: string | null;
    phonePattern: string | null;
  };
  sections: SectionSchema[];
  tableFormats: TableFormat[];
  publicationFormat: PublicationFormatSchema | null;
}

interface SectionSchema {
  category: "education" | "experience" | "publications" | "grants" | "teaching" | "supervision" | "memberships" | "awards";
  headerPattern: string;      // The exact text that starts this section
  startLine: number;          // Approximate line number
  endMarker: string | null;   // What ends this section (next header or null for EOF)
  isTable: boolean;           // Is content in table format?
  tableColumns?: string[];    // Column headers if table
}

interface TableFormat {
  sectionCategory: string;
  columns: string[];          // e.g., ["Period", "Institution", "Department", "Rank"]
  rowPattern: string;         // How rows are structured
}

interface PublicationFormatSchema {
  style: "numbered" | "bulleted" | "author-year" | "mixed";
  authorFirst: boolean;
  yearInParens: boolean;
  samplePattern: string;
}

interface ParsedCV {
  personal: PersonalInfo;
  education: EducationEntry[];
  publications: PublicationEntry[];
  experience: ExperienceEntry[];
  grants: GrantEntry[];
  teaching: TeachingEntry[];
  supervision: SupervisionEntry[];
  memberships: MembershipEntry[];
  awards: AwardEntry[];
  parsingMetadata: ParsingMetadata;
}

interface PersonalInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  birthYear: number | null;
  birthCountry: string | null;
  maritalStatus: string | null;
  numChildren: number | null;
}

interface EducationEntry {
  degreeType: string;
  institution: string;
  department: string | null;
  subject: string | null;
  specialization: string | null;
  awardDate: string | null;
  honors: string | null;
  country: string | null;
}

interface PublicationEntry {
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
}

interface ExperienceEntry {
  institution: string;
  department: string | null;
  positionTitle: string;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
  employmentType: string;
}

interface GrantEntry {
  title: string;
  fundingInstitution: string;
  amount: number | null;
  currencyCode: string;
  awardYear: number | null;
  duration: string | null;
  role: string | null;
}

interface TeachingEntry {
  courseTitle: string;
  educationLevel: string | null;
  institution: string | null;
  teachingPeriod: string | null;
}

interface SupervisionEntry {
  studentName: string;
  degreeLevel: string | null;
  thesisTitle: string | null;
  completionYear: number | null;
  role: string | null;
}

interface MembershipEntry {
  organization: string;
  startYear: number | null;
  endYear: number | null;
}

interface AwardEntry {
  awardName: string;
  awardingInstitution: string | null;
  awardYear: number | null;
  description: string | null;
}

interface ParsingMetadata {
  structureAnalysisMs: number;
  extractionMs: number;
  totalMs: number;
  sectionsDetected: string[];
  warnings: string[];
}

// ============================================================================
// PDF TEXT EXTRACTION
// ============================================================================

async function extractTextFromPDF(arrayBuffer: ArrayBuffer): Promise<{ text: string; lines: string[] }> {
  const uint8Array = new Uint8Array(arrayBuffer);

  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    useSystemFonts: true,
    disableFontFace: true,
    standardFontDataUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/standard_fonts/",
  });

  const pdf = await loadingTask.promise;
  const allLines: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });

    // Group by Y position to form lines
    const items = textContent.items
      .filter((item: any) => 'str' in item && item.str.trim().length > 0)
      .map((item: any) => ({
        text: item.str,
        x: item.transform[4],
        y: Math.round(viewport.height - item.transform[5]),
      }));

    // Group into lines
    const lineMap = new Map<number, any[]>();
    for (const item of items) {
      const yKey = Math.round(item.y / 5) * 5; // Group within 5px
      if (!lineMap.has(yKey)) lineMap.set(yKey, []);
      lineMap.get(yKey)!.push(item);
    }

    // Sort lines by Y, then items within line by X
    const sortedYs = Array.from(lineMap.keys()).sort((a, b) => a - b);
    for (const y of sortedYs) {
      const lineItems = lineMap.get(y)!.sort((a, b) => a.x - b.x);
      const lineText = lineItems.map(item => item.text).join(' ').trim();
      if (lineText.length > 0) {
        allLines.push(lineText);
      }
    }
    
    allLines.push('--- PAGE BREAK ---');
  }

  return {
    text: allLines.join('\n'),
    lines: allLines,
  };
}

function removeSensitiveData(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/\b\d{9}\b/g, '[ID-REDACTED]');
  cleaned = cleaned.replace(/\b\d{2,3}[-.\s]\d{3,6}[-.\s]\d{3,4}\b/g, '[ID-REDACTED]');
  cleaned = cleaned.replace(/Passport\s*(?:No\.?|Number)?[:\s]+[\w\d]+/gi, '[PASSPORT-REDACTED]');
  cleaned = cleaned.replace(/Home\s*Address[:\s]+[^\n]+/gi, '');
  return cleaned;
}

// ============================================================================
// PASS 1: LLM STRUCTURE ANALYSIS (ONE CALL)
// ============================================================================

async function analyzeStructure(cvText: string, lines: string[]): Promise<CVStructureSchema> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  // Send full CV with line numbers for precise section identification
  const numberedText = lines.map((line, i) => `${i + 1}: ${line}`).join('\n');

  const systemPrompt = `You are a CV structure analyzer. Your job is to identify the STRUCTURE and PATTERNS in this CV so that a program can extract data without further LLM calls.

Analyze the CV and output a JSON schema describing:

1. **personalInfo**: Where is the name? What pattern? Email? Phone?

2. **sections**: List ALL sections found. For each:
   - category: one of "education", "experience", "publications", "grants", "teaching", "supervision", "memberships", "awards"
   - headerPattern: EXACT text of the section header (e.g., "2. Higher Education", "A. EDUCATION", "PUBLICATIONS")
   - startLine: line number where section starts
   - endMarker: what text marks the END of this section (usually next section header)
   - isTable: true if content is in table format
   - tableColumns: if table, list the column headers

3. **tableFormats**: Describe any tables found (columns, structure)

4. **publicationFormat**: How are publications formatted?
   - style: "numbered" (1. 2. 3.), "bulleted" (• - *), "author-year", or "mixed"
   - authorFirst: do author names come before year?
   - yearInParens: is year in parentheses like (2023)?
   - samplePattern: show a pattern like "N. Author1, Author2 (YEAR). Title. Journal, Vol(Issue), Pages"

IMPORTANT: Use EXACT text from the CV for patterns. Be precise about line numbers.

Return ONLY valid JSON matching this structure:
{
  "personalInfo": {
    "nameLocation": "string describing where name is",
    "namePattern": "exact name as it appears",
    "emailPattern": "email or null",
    "phonePattern": "phone or null"
  },
  "sections": [
    {
      "category": "education|experience|publications|grants|teaching|supervision|memberships|awards",
      "headerPattern": "exact header text",
      "startLine": number,
      "endMarker": "next section header or null",
      "isTable": boolean,
      "tableColumns": ["col1", "col2"] or null
    }
  ],
  "tableFormats": [...],
  "publicationFormat": {...} or null
}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: CONFIG.models.structureAnalysis,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Analyze this CV structure:\n\n${numberedText}` },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Structure analysis failed: ${errorText}`);
  }

  const result = await response.json();
  return JSON.parse(result.choices[0].message.content);
}

// ============================================================================
// PASS 2: FAST PROGRAMMATIC EXTRACTION
// ============================================================================

function extractSectionContent(lines: string[], schema: SectionSchema): string {
  const startIdx = Math.max(0, schema.startLine - 1);
  
  let endIdx = lines.length;
  if (schema.endMarker) {
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (lines[i].includes(schema.endMarker) || 
          lines[i].toLowerCase().includes(schema.endMarker.toLowerCase())) {
        endIdx = i;
        break;
      }
    }
  }
  
  return lines.slice(startIdx, endIdx).join('\n');
}

function parseTableContent(content: string, columns: string[]): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  
  // Skip header lines
  let dataStart = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    if (columns.some(col => lines[i].toLowerCase().includes(col.toLowerCase()))) {
      dataStart = i + 1;
      break;
    }
  }
  
  // Simple heuristic: split by common delimiters or whitespace patterns
  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0 || line.startsWith('---')) continue;
    
    // Try to extract year ranges as first column indicator
    const yearMatch = line.match(/^(\d{4}[-–]\d{4}|\d{4}[-–]present|\d{4})/i);
    if (yearMatch) {
      const row: Record<string, string> = {};
      row[columns[0] || 'period'] = yearMatch[1];
      row['rest'] = line.substring(yearMatch[0].length).trim();
      rows.push(row);
    }
  }
  
  return rows;
}

function extractPersonalInfo(lines: string[], schema: CVStructureSchema): PersonalInfo {
  const result: PersonalInfo = {
    firstName: '',
    lastName: '',
    email: '',
    phone: null,
    birthYear: null,
    birthCountry: null,
    maritalStatus: null,
    numChildren: null,
  };

  // Extract name from pattern
  if (schema.personalInfo.namePattern) {
    const nameParts = schema.personalInfo.namePattern
      .replace(/,?\s*(Ph\.?D\.?|Dr\.?|Prof\.?|M\.?D\.?)/gi, '')
      .trim()
      .split(/\s+/);
    
    if (nameParts.length >= 2) {
      result.firstName = nameParts[0];
      result.lastName = nameParts[nameParts.length - 1];
    } else if (nameParts.length === 1) {
      result.lastName = nameParts[0];
    }
  }

  // Extract email
  if (schema.personalInfo.emailPattern) {
    result.email = schema.personalInfo.emailPattern;
  } else {
    // Search in first 30 lines
    for (let i = 0; i < Math.min(30, lines.length); i++) {
      const emailMatch = lines[i].match(/[\w.-]+@[\w.-]+\.\w+/);
      if (emailMatch) {
        result.email = emailMatch[0];
        break;
      }
    }
  }

  // Extract phone
  if (schema.personalInfo.phonePattern) {
    result.phone = schema.personalInfo.phonePattern;
  } else {
    for (let i = 0; i < Math.min(30, lines.length); i++) {
      const phoneMatch = lines[i].match(/\d{2,3}[-.\s]?\d{3,4}[-.\s]?\d{3,4}/);
      if (phoneMatch) {
        result.phone = phoneMatch[0];
        break;
      }
    }
  }

  // Extract birth year
  for (let i = 0; i < Math.min(30, lines.length); i++) {
    const birthMatch = lines[i].match(/birth[:\s]+(\d{1,2}[./]\d{1,2}[./])?(\d{2,4})/i);
    if (birthMatch) {
      let year = parseInt(birthMatch[2]);
      if (year < 100) year += 1900;
      result.birthYear = year;
      break;
    }
  }

  return result;
}

function extractEducationFromContent(content: string, isTable: boolean, columns?: string[]): EducationEntry[] {
  const entries: EducationEntry[] = [];
  const lines = content.split('\n').filter(l => l.trim().length > 0);

  // Patterns for degrees
  const degreePatterns = [
    /\b(Ph\.?D\.?|Doctorate|D\.Phil\.?)\b/i,
    /\b(M\.?A\.?|M\.?Sc\.?|M\.?S\.?|Master'?s?|MBA|M\.?Ed\.?)\b/i,
    /\b(B\.?A\.?|B\.?Sc\.?|B\.?S\.?|Bachelor'?s?)\b/i,
    /\b(Postdoc|Post-?doctoral)\b/i,
    /\bCertificate\b/i,
  ];

  // Year pattern
  const yearPattern = /\b(19|20)\d{2}\b/g;

  let currentEntry: Partial<EducationEntry> | null = null;

  for (const line of lines) {
    // Check for degree
    for (const pattern of degreePatterns) {
      const match = line.match(pattern);
      if (match) {
        // Save previous entry
        if (currentEntry && currentEntry.degreeType) {
          entries.push(currentEntry as EducationEntry);
        }
        
        currentEntry = {
          degreeType: match[1],
          institution: '',
          department: null,
          subject: null,
          specialization: null,
          awardDate: null,
          honors: null,
          country: null,
        };

        // Extract year from same line
        const years = line.match(yearPattern);
        if (years && years.length > 0) {
          currentEntry.awardDate = years[years.length - 1]; // Last year is usually completion
        }

        // Try to find institution on same line
        const instPatterns = [
          /University\s+of\s+[\w\s]+/i,
          /[\w\s]+ University/i,
          /[\w\s]+ Institute/i,
          /[\w\s]+ College/i,
        ];
        for (const instPattern of instPatterns) {
          const instMatch = line.match(instPattern);
          if (instMatch) {
            currentEntry.institution = instMatch[0].trim();
            break;
          }
        }

        // Subject often follows "in" 
        const subjectMatch = line.match(/\bin\s+([A-Z][\w\s]+?)(?:\s*,|\s*$|\s+at\s+)/i);
        if (subjectMatch) {
          currentEntry.subject = subjectMatch[1].trim();
        }

        break;
      }
    }

    // If we have a current entry, look for more info
    if (currentEntry && !currentEntry.institution) {
      const instPatterns = [
        /University\s+of\s+[\w\s]+/i,
        /[\w\s]+ University/i,
        /[\w\s]+ Institute/i,
        /[\w\s]+ College/i,
      ];
      for (const instPattern of instPatterns) {
        const instMatch = line.match(instPattern);
        if (instMatch) {
          currentEntry.institution = instMatch[0].trim();
          break;
        }
      }
    }
  }

  // Don't forget last entry
  if (currentEntry && currentEntry.degreeType) {
    entries.push(currentEntry as EducationEntry);
  }

  return entries;
}

function extractExperienceFromContent(content: string, isTable: boolean, columns?: string[]): ExperienceEntry[] {
  const entries: ExperienceEntry[] = [];
  const lines = content.split('\n').filter(l => l.trim().length > 0);

  // Pattern for date ranges
  const dateRangePattern = /(\d{1,2}\/)?(\d{4})\s*[-–]\s*(present|\d{4})/i;
  
  let currentEntry: Partial<ExperienceEntry> | null = null;

  for (const line of lines) {
    const dateMatch = line.match(dateRangePattern);
    
    if (dateMatch) {
      // Save previous
      if (currentEntry && currentEntry.institution) {
        entries.push(currentEntry as ExperienceEntry);
      }

      currentEntry = {
        institution: '',
        department: null,
        positionTitle: '',
        startDate: dateMatch[2],
        endDate: dateMatch[3].toLowerCase() === 'present' ? null : dateMatch[3],
        description: null,
        employmentType: 'full-time',
      };

      // Rest of line might have institution
      const restOfLine = line.replace(dateMatch[0], '').trim();
      if (restOfLine.length > 0) {
        // Look for position titles
        const positionPatterns = [
          /\b(Professor|Lecturer|Researcher|Head|Director|Manager|Engineer|Architect)\b/i,
          /\b(Senior|Junior|Associate|Assistant|Visiting|Adjunct)\s+\w+/i,
        ];
        
        for (const pattern of positionPatterns) {
          const posMatch = restOfLine.match(pattern);
          if (posMatch) {
            currentEntry.positionTitle = posMatch[0];
            break;
          }
        }

        // Institution patterns
        const instMatch = restOfLine.match(/(?:at\s+)?([\w\s]+ (?:University|Institute|College|Company|Ltd|Inc|Bank))/i);
        if (instMatch) {
          currentEntry.institution = instMatch[1].trim();
        }
      }
    } else if (currentEntry) {
      // Continue building current entry
      if (!currentEntry.institution) {
        const instMatch = line.match(/([\w\s]+ (?:University|Institute|College|Company|Ltd|Inc|Bank))/i);
        if (instMatch) {
          currentEntry.institution = instMatch[1].trim();
        }
      }
      if (!currentEntry.positionTitle) {
        const posMatch = line.match(/\b(Professor|Lecturer|Researcher|Head|Director|Manager|Engineer|Architect|CEO|VP|CTO)\b/i);
        if (posMatch) {
          currentEntry.positionTitle = posMatch[0];
        }
      }
    }
  }

  if (currentEntry && currentEntry.institution) {
    entries.push(currentEntry as ExperienceEntry);
  }

  return entries;
}

function extractPublicationsFromContent(
  content: string, 
  format: PublicationFormatSchema | null
): PublicationEntry[] {
  const entries: PublicationEntry[] = [];
  const lines = content.split('\n').filter(l => l.trim().length > 0);

  // Detect publication boundaries
  const pubStartPatterns = [
    /^\*?\d+\.\s/,              // "1. " or "*1. "
    /^\[\d+\]\s/,               // "[1] "
    /^[•\-\*]\s/,               // "• " or "- "
    /^[A-Z][a-z]+,\s*[A-Z]\./,  // "Smith, J."
  ];

  let currentPub = '';
  const pubTexts: string[] = [];

  for (const line of lines) {
    const isNewPub = pubStartPatterns.some(p => p.test(line.trim()));
    
    if (isNewPub && currentPub.length > 0) {
      pubTexts.push(currentPub.trim());
      currentPub = '';
    }
    currentPub += line + ' ';
  }
  if (currentPub.trim().length > 0) {
    pubTexts.push(currentPub.trim());
  }

  // Parse each publication
  for (const pubText of pubTexts) {
    const entry: PublicationEntry = {
      title: '',
      publicationType: 'journal',
      venueName: null,
      publicationYear: 0,
      volume: null,
      issue: null,
      pages: null,
      coAuthors: [],
      citationCount: null,
      url: null,
    };

    // Extract year
    const yearMatch = pubText.match(/\((\d{4})\)|,\s*(\d{4})[,.\s]/);
    if (yearMatch) {
      entry.publicationYear = parseInt(yearMatch[1] || yearMatch[2]);
    }

    // Extract volume/issue/pages
    const volMatch = pubText.match(/(\d+)\s*\((\d+)\)\s*,?\s*\(?(\d+[-–]\d+)\)?/);
    if (volMatch) {
      entry.volume = volMatch[1];
      entry.issue = volMatch[2];
      entry.pages = volMatch[3];
    }

    // Extract title (usually after year, before journal)
    // This is a simplified heuristic
    const afterYear = pubText.split(/\(\d{4}\)/)[1];
    if (afterYear) {
      const titleMatch = afterYear.match(/^\s*\.?\s*([^.]+)/);
      if (titleMatch) {
        entry.title = titleMatch[1].trim();
      }
    }

    // Extract DOI/URL
    const doiMatch = pubText.match(/doi[:\s]+([^\s]+)/i);
    if (doiMatch) {
      entry.url = doiMatch[1];
    }

    if (entry.publicationYear > 0) {
      entries.push(entry);
    }
  }

  return entries;
}

// ============================================================================
// FALLBACK: LLM EXTRACTION FOR COMPLEX SECTIONS
// ============================================================================

async function llmExtractSection(
  content: string,
  category: string,
  schema: any
): Promise<any[]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const prompts: Record<string, string> = {
    education: `Extract ALL education entries. Return JSON: {"education": [{"degreeType": "", "institution": "", "department": null, "subject": null, "awardDate": "", "country": null}]}`,
    experience: `Extract ALL work experience. Return JSON: {"experience": [{"institution": "", "positionTitle": "", "startDate": "", "endDate": null, "employmentType": ""}]}`,
    publications: `Extract ALL publications. Return JSON: {"publications": [{"title": "", "publicationType": "", "venueName": "", "publicationYear": 0, "coAuthors": []}]}`,
    grants: `Extract ALL grants. Return JSON: {"grants": [{"title": "", "fundingInstitution": "", "amount": null, "awardYear": null, "role": ""}]}`,
    teaching: `Extract ALL courses taught. Return JSON: {"teaching": [{"courseTitle": "", "educationLevel": null, "institution": null}]}`,
    awards: `Extract ALL awards. Return JSON: {"awards": [{"awardName": "", "awardingInstitution": null, "awardYear": null}]}`,
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: CONFIG.models.extraction,
      messages: [
        { role: "system", content: prompts[category] || "Extract structured data as JSON." },
        { role: "user", content: content },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) return [];
  
  const result = await response.json();
  const parsed = JSON.parse(result.choices[0].message.content);
  return parsed[category] || [];
}

// ============================================================================
// MAIN PARSING ORCHESTRATOR
// ============================================================================

async function parseCV(cvText: string, lines: string[]): Promise<ParsedCV> {
  const startTime = Date.now();
  const warnings: string[] = [];
  const sectionsDetected: string[] = [];

  // ========== PASS 1: Structure Analysis (ONE LLM call) ==========
  console.log("Pass 1: Analyzing CV structure...");
  const structureStart = Date.now();
  
  let schema: CVStructureSchema;
  try {
    schema = await analyzeStructure(cvText, lines);
    console.log(`Structure analysis found ${schema.sections.length} sections`);
    schema.sections.forEach(s => {
      sectionsDetected.push(s.category);
      console.log(`  - ${s.category}: "${s.headerPattern}" at line ${s.startLine}`);
    });
  } catch (error) {
    console.error("Structure analysis failed:", error);
    warnings.push("Structure analysis failed, using fallback extraction");
    schema = {
      personalInfo: { nameLocation: "unknown", namePattern: "", emailPattern: null, phonePattern: null },
      sections: [],
      tableFormats: [],
      publicationFormat: null,
    };
  }
  
  const structureMs = Date.now() - structureStart;
  console.log(`Structure analysis took ${structureMs}ms`);

  // ========== PASS 2: Fast Programmatic Extraction ==========
  console.log("Pass 2: Extracting data...");
  const extractionStart = Date.now();

  // Personal info
  const personal = extractPersonalInfo(lines, schema);

  // Process each section
  let education: EducationEntry[] = [];
  let experience: ExperienceEntry[] = [];
  let publications: PublicationEntry[] = [];
  let grants: GrantEntry[] = [];
  let teaching: TeachingEntry[] = [];
  let supervision: SupervisionEntry[] = [];
  let memberships: MembershipEntry[] = [];
  let awards: AwardEntry[] = [];

  for (const section of schema.sections) {
    const content = extractSectionContent(lines, section);
    console.log(`Processing ${section.category}: ${content.length} chars`);

    switch (section.category) {
      case 'education':
        const eduEntries = extractEducationFromContent(content, section.isTable, section.tableColumns);
        if (eduEntries.length === 0) {
          // Fallback to LLM
          console.log("Education: programmatic extraction failed, using LLM fallback");
          education = await llmExtractSection(content, 'education', section);
        } else {
          education = eduEntries;
        }
        break;

      case 'experience':
        const expEntries = extractExperienceFromContent(content, section.isTable, section.tableColumns);
        if (expEntries.length === 0) {
          console.log("Experience: programmatic extraction failed, using LLM fallback");
          experience = await llmExtractSection(content, 'experience', section);
        } else {
          experience.push(...expEntries);
        }
        break;

      case 'publications':
        const pubEntries = extractPublicationsFromContent(content, schema.publicationFormat);
        if (pubEntries.length === 0) {
          console.log("Publications: programmatic extraction failed, using LLM fallback");
          publications = await llmExtractSection(content, 'publications', section);
        } else {
          publications = pubEntries;
        }
        break;

      case 'grants':
        grants = await llmExtractSection(content, 'grants', section);
        break;

      case 'teaching':
        teaching = await llmExtractSection(content, 'teaching', section);
        break;

      case 'awards':
        awards = await llmExtractSection(content, 'awards', section);
        break;
    }
  }

  // If no sections detected, do full LLM extraction
  if (schema.sections.length === 0) {
    console.log("No sections detected, using full LLM extraction");
    education = await llmExtractSection(cvText, 'education', {});
    experience = await llmExtractSection(cvText, 'experience', {});
    publications = await llmExtractSection(cvText, 'publications', {});
  }

  const extractionMs = Date.now() - extractionStart;
  const totalMs = Date.now() - startTime;

  console.log(`Extraction took ${extractionMs}ms, total ${totalMs}ms`);
  console.log(`Results: ${education.length} education, ${experience.length} experience, ${publications.length} publications`);

  return {
    personal,
    education,
    publications,
    experience,
    grants,
    teaching,
    supervision,
    memberships,
    awards,
    parsingMetadata: {
      structureAnalysisMs: structureMs,
      extractionMs,
      totalMs,
      sectionsDetected,
      warnings,
    },
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
      return new Response(
        JSON.stringify({ error: "PDF_READ_FAILED", message: "Unable to read PDF file" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract text
    console.log("Extracting text from PDF...");
    const arrayBuffer = await fileData.arrayBuffer();
    const { text, lines } = await extractTextFromPDF(arrayBuffer);
    
    if (text.length < 100) {
      return new Response(
        JSON.stringify({ error: "NO_TEXT", message: "PDF contains no readable text" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanedText = removeSensitiveData(text);
    const cleanedLines = cleanedText.split('\n');

    // Parse CV with two-pass architecture
    console.log("Parsing CV...");
    const parsedData = await parseCV(cleanedText, cleanedLines);

    // Validate
    if (!parsedData.personal.firstName && !parsedData.personal.lastName) {
      return new Response(
        JSON.stringify({
          error: "INCOMPLETE_DATA",
          message: "Could not extract name from CV",
          debug: { textLength: cleanedText.length, linesCount: cleanedLines.length }
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check duplicate
    if (parsedData.personal.email) {
      const { data: existing } = await supabase
        .from("academiq_persons")
        .select("id, first_name, last_name, email")
        .eq("email", parsedData.personal.email)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({
            error: "DUPLICATE_CV",
            message: "This CV has already been indexed",
            existingPerson: existing,
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log("=== PARSING COMPLETE ===");
    console.log(`Time: ${parsedData.parsingMetadata.totalMs}ms (structure: ${parsedData.parsingMetadata.structureAnalysisMs}ms)`);
    console.log(`Education: ${parsedData.education.length}, Experience: ${parsedData.experience.length}, Publications: ${parsedData.publications.length}`);

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