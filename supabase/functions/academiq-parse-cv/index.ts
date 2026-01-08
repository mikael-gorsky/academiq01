import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as pdfjsLib from "npm:pdfjs-dist@4.0.379";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Model selection - use advanced model for structure analysis, cheaper for extraction
  models: {
    advanced: "gpt-5.2-2025-12-11",    // For structure analysis and edge cases
    standard: "gpt-4.1-2025-04-14",    // For routine extraction tasks
  },
  // When to use advanced model
  advancedModelThresholds: {
    textComplexityScore: 0.7,  // Multi-column, poor formatting
    sectionAmbiguity: 3,       // Number of ambiguous sections
    publicationsCount: 100,    // Large publication lists need better parsing
  },
  // Chunking settings
  maxPublicationsPerChunk: 30,  // Smaller chunks = more accurate
  maxTextLengthForSingleCall: 12000,
  // Retry settings
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
  extractionMethod: string;
  modelUsed: string;
  lessonsApplied: string[];
  newLessonsGenerated: string[];
  confidenceScore: number;
  warnings: string[];
}

interface ParsingLesson {
  id: string;
  lesson_type: string;
  pattern: string;
  resolution: string;
  confidence: number;
  occurrences: number;
}

interface CVSection {
  name: string;
  startIndex: number;
  endIndex: number;
  content: string;
  category: string;
  confidence: number;
}

interface TextExtractionResult {
  text: string;
  method: string;
  pageCount: number;
  hasMultipleColumns: boolean;
  textQualityScore: number;
}

// ============================================================================
// PDF TEXT EXTRACTION - Multiple Methods
// ============================================================================

async function extractTextFromPDF(arrayBuffer: ArrayBuffer): Promise<TextExtractionResult> {
  const uint8Array = new Uint8Array(arrayBuffer);
  
  // Method 1: Standard pdfjs extraction with improved text assembly
  const result1 = await extractWithPdfJs(uint8Array);
  
  // Method 2: Layout-preserving extraction
  const result2 = await extractWithLayoutPreservation(uint8Array);
  
  // Choose best result based on quality metrics
  const best = selectBestExtraction([result1, result2]);
  
  console.log(`Selected extraction method: ${best.method}, quality score: ${best.textQualityScore}`);
  
  return best;
}

async function extractWithPdfJs(uint8Array: Uint8Array): Promise<TextExtractionResult> {
  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    useSystemFonts: true,
    disableFontFace: true,
    standardFontDataUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/standard_fonts/",
  });

  const pdf = await loadingTask.promise;
  let fullText = "";
  let hasMultipleColumns = false;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });
    
    // Sort items by position (top to bottom, left to right)
    const items = textContent.items
      .filter((item: any) => 'str' in item && item.str.trim().length > 0)
      .map((item: any) => ({
        text: item.str,
        x: item.transform[4],
        y: viewport.height - item.transform[5], // Flip Y coordinate
        width: item.width,
        height: item.height,
      }));
    
    // Detect multi-column layout
    if (detectMultiColumnLayout(items, viewport.width)) {
      hasMultipleColumns = true;
    }
    
    // Group items into lines based on Y position
    const lines = groupIntoLines(items);
    
    // Join lines with proper spacing
    const pageText = lines.map(line => 
      line.sort((a, b) => a.x - b.x).map(item => item.text).join(' ')
    ).join('\n');
    
    fullText += pageText + "\n\n--- PAGE BREAK ---\n\n";
  }

  const qualityScore = assessTextQuality(fullText);
  
  return {
    text: fullText.trim(),
    method: "pdfjs-standard",
    pageCount: pdf.numPages,
    hasMultipleColumns,
    textQualityScore: qualityScore,
  };
}

async function extractWithLayoutPreservation(uint8Array: Uint8Array): Promise<TextExtractionResult> {
  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    useSystemFonts: true,
    disableFontFace: true,
    standardFontDataUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/standard_fonts/",
  });

  const pdf = await loadingTask.promise;
  let fullText = "";
  let hasMultipleColumns = false;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });
    
    const items = textContent.items
      .filter((item: any) => 'str' in item && item.str.trim().length > 0)
      .map((item: any) => ({
        text: item.str,
        x: Math.round(item.transform[4]),
        y: Math.round(viewport.height - item.transform[5]),
        fontSize: Math.round(item.height),
      }));

    // Detect columns by analyzing X-position distribution
    const columns = detectAndSplitColumns(items, viewport.width);
    
    if (columns.length > 1) {
      hasMultipleColumns = true;
      // Process each column separately, then merge
      const columnTexts = columns.map(col => processColumn(col));
      fullText += columnTexts.join('\n\n') + "\n\n--- PAGE BREAK ---\n\n";
    } else {
      // Single column - process normally with line grouping
      const lines = groupIntoLines(items);
      const pageText = lines.map(line => 
        line.sort((a, b) => a.x - b.x).map(item => item.text).join(' ')
      ).join('\n');
      fullText += pageText + "\n\n--- PAGE BREAK ---\n\n";
    }
  }

  const qualityScore = assessTextQuality(fullText);
  
  return {
    text: fullText.trim(),
    method: "pdfjs-layout-preserving",
    pageCount: pdf.numPages,
    hasMultipleColumns,
    textQualityScore: qualityScore,
  };
}

function detectMultiColumnLayout(items: any[], pageWidth: number): boolean {
  if (items.length < 20) return false;
  
  // Check if there's a significant gap in X positions
  const xPositions = items.map(item => item.x).sort((a, b) => a - b);
  const midPoint = pageWidth / 2;
  
  const leftItems = items.filter(item => item.x < midPoint - 50);
  const rightItems = items.filter(item => item.x > midPoint + 50);
  
  // If both sides have significant content, likely multi-column
  return leftItems.length > 10 && rightItems.length > 10;
}

function detectAndSplitColumns(items: any[], pageWidth: number): any[][] {
  if (items.length < 20) return [items];
  
  // Find gaps in X distribution
  const xPositions = items.map(item => item.x).sort((a, b) => a - b);
  const gaps: { start: number; end: number; size: number }[] = [];
  
  for (let i = 1; i < xPositions.length; i++) {
    const gap = xPositions[i] - xPositions[i - 1];
    if (gap > pageWidth * 0.1) { // Gap larger than 10% of page width
      gaps.push({ start: xPositions[i - 1], end: xPositions[i], size: gap });
    }
  }
  
  if (gaps.length === 0) return [items];
  
  // Use largest gap as column divider
  const largestGap = gaps.reduce((max, g) => g.size > max.size ? g : max, gaps[0]);
  const divider = (largestGap.start + largestGap.end) / 2;
  
  const leftColumn = items.filter(item => item.x < divider);
  const rightColumn = items.filter(item => item.x >= divider);
  
  if (leftColumn.length < 5 || rightColumn.length < 5) return [items];
  
  return [leftColumn, rightColumn];
}

function processColumn(items: any[]): string {
  const lines = groupIntoLines(items);
  return lines.map(line => 
    line.sort((a, b) => a.x - b.x).map(item => item.text).join(' ')
  ).join('\n');
}

function groupIntoLines(items: any[], tolerance: number = 5): any[][] {
  if (items.length === 0) return [];
  
  // Sort by Y position first
  const sorted = [...items].sort((a, b) => a.y - b.y);
  
  const lines: any[][] = [];
  let currentLine: any[] = [sorted[0]];
  let currentY = sorted[0].y;
  
  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (Math.abs(item.y - currentY) <= tolerance) {
      currentLine.push(item);
    } else {
      lines.push(currentLine);
      currentLine = [item];
      currentY = item.y;
    }
  }
  lines.push(currentLine);
  
  return lines;
}

function assessTextQuality(text: string): number {
  let score = 1.0;
  
  // Check for garbled text (too many special characters)
  const specialCharRatio = (text.match(/[^\w\s.,;:'"()\-]/g) || []).length / text.length;
  if (specialCharRatio > 0.1) score -= 0.3;
  
  // Check for reasonable word lengths
  const words = text.split(/\s+/);
  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
  if (avgWordLength < 3 || avgWordLength > 15) score -= 0.2;
  
  // Check for presence of expected academic CV keywords
  const cvKeywords = ['education', 'experience', 'publications', 'university', 'degree', 'research'];
  const foundKeywords = cvKeywords.filter(kw => text.toLowerCase().includes(kw)).length;
  score += foundKeywords * 0.05;
  
  // Check for reasonable line structure
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const avgLineLength = lines.reduce((sum, l) => sum + l.length, 0) / lines.length;
  if (avgLineLength < 20 || avgLineLength > 200) score -= 0.1;
  
  return Math.max(0, Math.min(1, score));
}

function selectBestExtraction(results: TextExtractionResult[]): TextExtractionResult {
  return results.reduce((best, current) => 
    current.textQualityScore > best.textQualityScore ? current : best
  );
}

// ============================================================================
// SENSITIVE DATA REMOVAL
// ============================================================================

function removeSensitiveData(text: string): string {
  let cleaned = text;

  // Remove Israeli ID numbers (9 digits)
  cleaned = cleaned.replace(/\b\d{9}\b/g, '[ID-REDACTED]');
  
  // Remove formatted ID numbers
  cleaned = cleaned.replace(/\b\d{2,3}[-.\s]\d{3,6}[-.\s]\d{3,4}\b/g, '[ID-REDACTED]');
  
  // Remove passport numbers
  cleaned = cleaned.replace(/Passport\s*(?:No\.?|Number)?[:\s]+[\w\d]+/gi, '[PASSPORT-REDACTED]');
  
  // Remove home addresses (but keep institutional addresses)
  cleaned = cleaned.replace(/Home\s*Address[:\s]+[^\n]+/gi, '');
  
  // Remove social security numbers
  cleaned = cleaned.replace(/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, '[SSN-REDACTED]');

  return cleaned;
}

// ============================================================================
// LESSONS LEARNED DATABASE INTEGRATION
// ============================================================================

async function fetchParsingLessons(supabase: any): Promise<ParsingLesson[]> {
  const { data, error } = await supabase
    .from('academiq_parsing_lessons')
    .select('*')
    .gte('confidence', 0.5)
    .order('confidence', { ascending: false })
    .limit(100);
  
  if (error) {
    console.warn('Could not fetch parsing lessons:', error.message);
    return [];
  }
  
  return data || [];
}

async function recordNewLesson(
  supabase: any,
  lessonType: string,
  pattern: string,
  resolution: string,
  confidence: number = 0.5,
  sourceCvId: string | null = null,
  metadata: Record<string, any> = {}
): Promise<void> {
  try {
    await supabase.rpc('upsert_parsing_lesson', {
      p_lesson_type: lessonType,
      p_pattern: pattern,
      p_resolution: resolution,
      p_confidence: confidence,
      p_source_cv_id: sourceCvId,
      p_metadata: metadata,
    });
  } catch (error) {
    console.warn('Could not record parsing lesson:', error);
  }
}

async function incrementLessonOccurrence(
  supabase: any,
  lessonType: string,
  pattern: string
): Promise<void> {
  try {
    await supabase.rpc('increment_lesson_occurrence', {
      p_lesson_type: lessonType,
      p_pattern: pattern,
    });
  } catch (error) {
    console.warn('Could not increment lesson occurrence:', error);
  }
}

function buildLessonsContext(lessons: ParsingLesson[]): string {
  if (lessons.length === 0) return '';
  
  const sectionNaming = lessons.filter(l => l.lesson_type === 'section_naming');
  const formatPatterns = lessons.filter(l => l.lesson_type === 'format_pattern');
  const edgeCases = lessons.filter(l => l.lesson_type === 'edge_case');
  const institutionAliases = lessons.filter(l => l.lesson_type === 'institution_alias');
  
  let context = '\n\n--- LEARNED PATTERNS FROM PREVIOUS CVS ---\n';
  
  if (sectionNaming.length > 0) {
    context += '\nSection name variations:\n';
    sectionNaming.forEach(l => {
      context += `- "${l.pattern}" → ${l.resolution}\n`;
    });
  }
  
  if (formatPatterns.length > 0) {
    context += '\nFormat patterns to recognize:\n';
    formatPatterns.forEach(l => {
      context += `- ${l.pattern}: ${l.resolution}\n`;
    });
  }
  
  if (edgeCases.length > 0) {
    context += '\nEdge cases to handle:\n';
    edgeCases.forEach(l => {
      context += `- ${l.pattern}: ${l.resolution}\n`;
    });
  }
  
  if (institutionAliases.length > 0) {
    context += '\nInstitution abbreviations:\n';
    institutionAliases.slice(0, 20).forEach(l => {
      context += `- ${l.pattern} = ${l.resolution}\n`;
    });
  }
  
  return context;
}

// ============================================================================
// SECTION DETECTION - Improved with Lessons
// ============================================================================

function detectAllSections(text: string, lessons: ParsingLesson[]): CVSection[] {
  const sections: CVSection[] = [];
  
  // Build section markers from lessons and defaults
  const sectionMarkers = buildSectionMarkers(lessons);
  
  // Find all potential section starts
  const potentialSections: { name: string; index: number; category: string; confidence: number }[] = [];
  
  for (const marker of sectionMarkers) {
    // Pattern handles multiple formats:
    // 1. "EDUCATION" or "Education:" at start of line
    // 2. "A. EDUCATION" or "B. ACADEMIC EXPERIENCE" (lettered sections)
    // 3. "1. Education" or "2. Experience" (numbered sections)
    // 4. Sections with or without colons
    const patterns = [
      // Standard: "Education" or "Education:" at line start
      new RegExp(`(^|\\n)\\s*${escapeRegex(marker.pattern)}\\s*[:.]?\\s*(?=\\n|$)`, 'gim'),
      // Lettered: "A. Education" or "B. EDUCATION"
      new RegExp(`(^|\\n)\\s*[A-Z]\\.\\s*${escapeRegex(marker.pattern)}\\s*[:.]?\\s*(?=\\n|$)`, 'gim'),
      // Numbered: "1. Education" or "2. EDUCATION"
      new RegExp(`(^|\\n)\\s*\\d+\\.\\s*${escapeRegex(marker.pattern)}\\s*[:.]?\\s*(?=\\n|$)`, 'gim'),
      // With underline or separator after
      new RegExp(`(^|\\n)\\s*(?:[A-Z]\\.\\s*)?${escapeRegex(marker.pattern)}\\s*\\n[-=_]+`, 'gim'),
    ];
    
    for (const regex of patterns) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        // Avoid duplicates at same position
        const existingAtPosition = potentialSections.find(
          s => Math.abs(s.index - match.index) < 10 && s.category === marker.category
        );
        if (!existingAtPosition) {
          potentialSections.push({
            name: marker.pattern,
            index: match.index,
            category: marker.category,
            confidence: marker.confidence,
          });
        }
      }
    }
  }
  
  // Sort by position
  potentialSections.sort((a, b) => a.index - b.index);
  
  // Remove overlapping sections (keep highest confidence)
  const filteredSections: typeof potentialSections = [];
  for (const section of potentialSections) {
    const overlapping = filteredSections.find(
      s => Math.abs(s.index - section.index) < 50
    );
    if (!overlapping) {
      filteredSections.push(section);
    } else if (section.confidence > overlapping.confidence) {
      const idx = filteredSections.indexOf(overlapping);
      filteredSections[idx] = section;
    }
  }
  
  // Convert to sections with content
  for (let i = 0; i < filteredSections.length; i++) {
    const current = filteredSections[i];
    const next = filteredSections[i + 1];
    const endIndex = next ? next.index : text.length;
    
    sections.push({
      name: current.name,
      startIndex: current.index,
      endIndex: endIndex,
      content: text.substring(current.index, endIndex),
      category: current.category,
      confidence: current.confidence,
    });
  }
  
  console.log(`Detected sections: ${sections.map(s => `${s.category}(${s.name})`).join(', ')}`);
  
  return sections;
}

function buildSectionMarkers(lessons: ParsingLesson[]): { pattern: string; category: string; confidence: number }[] {
  // Default markers
  const defaultMarkers = [
    // Publications
    { pattern: 'publications', category: 'publications', confidence: 0.95 },
    { pattern: 'selected publications', category: 'publications', confidence: 0.9 },
    { pattern: 'research publications', category: 'publications', confidence: 0.9 },
    { pattern: 'scholarly works', category: 'publications', confidence: 0.85 },
    { pattern: 'papers', category: 'publications', confidence: 0.8 },
    { pattern: 'articles', category: 'publications', confidence: 0.75 },
    { pattern: 'articles in refereed journals', category: 'publications', confidence: 0.95 },
    { pattern: 'chapters in books', category: 'publications', confidence: 0.9 },
    { pattern: 'papers presented', category: 'publications', confidence: 0.9 },
    { pattern: 'conference proceedings', category: 'publications', confidence: 0.85 },
    { pattern: 'journal articles', category: 'publications', confidence: 0.9 },
    { pattern: 'peer-reviewed', category: 'publications', confidence: 0.85 },
    
    // Education
    { pattern: 'education', category: 'education', confidence: 0.95 },
    { pattern: 'academic background', category: 'education', confidence: 0.9 },
    { pattern: 'degrees', category: 'education', confidence: 0.9 },
    { pattern: 'academic degrees', category: 'education', confidence: 0.95 },
    { pattern: 'qualifications', category: 'education', confidence: 0.8 },
    
    // Experience - Academic
    { pattern: 'academic experience', category: 'experience', confidence: 0.95 },
    { pattern: 'academic appointments', category: 'experience', confidence: 0.95 },
    { pattern: 'academic positions', category: 'experience', confidence: 0.95 },
    { pattern: 'university positions', category: 'experience', confidence: 0.9 },
    
    // Experience - Professional/Industry
    { pattern: 'professional experience', category: 'experience', confidence: 0.95 },
    { pattern: 'work experience', category: 'experience', confidence: 0.95 },
    { pattern: 'employment history', category: 'experience', confidence: 0.95 },
    { pattern: 'employment', category: 'experience', confidence: 0.9 },
    { pattern: 'experience', category: 'experience', confidence: 0.85 },
    { pattern: 'positions held', category: 'experience', confidence: 0.9 },
    { pattern: 'work history', category: 'experience', confidence: 0.85 },
    { pattern: 'career', category: 'experience', confidence: 0.7 },
    
    // Grants
    { pattern: 'grants', category: 'grants', confidence: 0.95 },
    { pattern: 'funding', category: 'grants', confidence: 0.85 },
    { pattern: 'research grants', category: 'grants', confidence: 0.95 },
    { pattern: 'funded projects', category: 'grants', confidence: 0.9 },
    { pattern: 'external funding', category: 'grants', confidence: 0.9 },
    
    // Teaching
    { pattern: 'teaching', category: 'teaching', confidence: 0.95 },
    { pattern: 'courses taught', category: 'teaching', confidence: 0.95 },
    { pattern: 'teaching experience', category: 'teaching', confidence: 0.95 },
    { pattern: 'instruction', category: 'teaching', confidence: 0.7 },
    { pattern: 'educational courses development', category: 'teaching', confidence: 0.95 },
    { pattern: 'courses developed', category: 'teaching', confidence: 0.95 },
    { pattern: 'course development', category: 'teaching', confidence: 0.9 },
    
    // Supervision
    { pattern: 'supervision', category: 'supervision', confidence: 0.95 },
    { pattern: 'students supervised', category: 'supervision', confidence: 0.95 },
    { pattern: 'graduate students', category: 'supervision', confidence: 0.85 },
    { pattern: 'thesis supervision', category: 'supervision', confidence: 0.95 },
    { pattern: 'mentoring', category: 'supervision', confidence: 0.7 },
    
    // Memberships
    { pattern: 'memberships', category: 'memberships', confidence: 0.95 },
    { pattern: 'professional memberships', category: 'memberships', confidence: 0.95 },
    { pattern: 'affiliations', category: 'memberships', confidence: 0.85 },
    { pattern: 'professional activities', category: 'memberships', confidence: 0.8 },
    
    // Awards
    { pattern: 'awards', category: 'awards', confidence: 0.95 },
    { pattern: 'honors', category: 'awards', confidence: 0.9 },
    { pattern: 'awards and honors', category: 'awards', confidence: 0.95 },
    { pattern: 'recognition', category: 'awards', confidence: 0.7 },
    { pattern: 'prizes', category: 'awards', confidence: 0.85 },
  ];
  
  // Add learned patterns
  const learnedMarkers = lessons
    .filter(l => l.lesson_type === 'section_naming')
    .map(l => {
      const category = (l.metadata as any)?.category || 'unknown';
      return { pattern: l.pattern.toLowerCase(), category, confidence: l.confidence };
    });
  
  return [...defaultMarkers, ...learnedMarkers];
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findSectionsByCategory(sections: CVSection[], category: string): CVSection[] {
  return sections.filter(s => s.category === category);
}

function mergeSectionContents(sections: CVSection[]): string {
  return sections.map(s => s.content).join('\n\n');
}

// ============================================================================
// AI MODEL CALLS - Multi-Model Strategy
// ============================================================================

async function callOpenAI(
  systemPrompt: string,
  userMessage: string,
  model: string = CONFIG.models.standard,
  retries: number = CONFIG.maxRetries
): Promise<any> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
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
            { role: "user", content: userMessage },
          ],
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
      });

      if (response.status === 429 && attempt < retries) {
        const waitTime = Math.pow(2, attempt) * CONFIG.retryDelayMs;
        console.log(`Rate limited. Waiting ${waitTime}ms before retry ${attempt}/${retries}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`OpenAI API error (${model}):`, errorText);
        throw new Error(`AI parsing failed: ${response.statusText}`);
      }

      const result = await response.json();
      return JSON.parse(result.choices[0].message.content);
    } catch (error) {
      if (attempt === retries) throw error;
      const waitTime = Math.pow(2, attempt) * CONFIG.retryDelayMs;
      console.log(`Error on attempt ${attempt}. Retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

function selectModelForTask(
  taskType: string,
  textComplexity: number,
  dataSize: number
): string {
  // Use advanced model for:
  // 1. Structure analysis (always)
  // 2. Complex/poorly formatted text
  // 3. Very large publication lists
  // 4. Edge case resolution
  
  if (taskType === 'structure_analysis') {
    return CONFIG.models.advanced;
  }
  
  if (taskType === 'edge_case_resolution') {
    return CONFIG.models.advanced;
  }
  
  if (textComplexity > CONFIG.advancedModelThresholds.textComplexityScore) {
    return CONFIG.models.advanced;
  }
  
  if (taskType === 'publications' && dataSize > CONFIG.advancedModelThresholds.publicationsCount) {
    return CONFIG.models.advanced;
  }
  
  return CONFIG.models.standard;
}

// ============================================================================
// CV STRUCTURE ANALYSIS (Advanced Model)
// ============================================================================

async function analyzeCVStructure(
  cvText: string,
  sections: CVSection[],
  lessonsContext: string
): Promise<{
  personalInfoLocation: { start: number; end: number } | null;
  detectedSections: { name: string; category: string; quality: string }[];
  suggestedApproach: string;
  warnings: string[];
  newLessons: { type: string; pattern: string; resolution: string }[];
}> {
  const systemPrompt = `You are an expert at analyzing academic CV structures. Your task is to:
1. Identify where personal information is located
2. Verify detected sections are correctly categorized
3. Identify any unusual formatting or structure issues
4. Suggest parsing approach
5. Note any new patterns that should be learned for future CVs

${lessonsContext}

Return JSON:
{
  "personalInfoLocation": { "start": number, "end": number } or null,
  "detectedSections": [
    { "name": "string", "category": "education|publications|experience|grants|teaching|supervision|memberships|awards", "quality": "good|partial|poor" }
  ],
  "suggestedApproach": "standard|careful|section_by_section",
  "warnings": ["string"],
  "newLessons": [
    { "type": "section_naming|format_pattern|edge_case", "pattern": "string", "resolution": "string" }
  ]
}`;

  const preview = cvText.substring(0, 8000);
  const sectionSummary = sections.map(s => `${s.name} (${s.category}, ${s.content.length} chars)`).join('\n');
  
  const userMessage = `Analyze this CV structure:

DETECTED SECTIONS:
${sectionSummary}

CV TEXT PREVIEW:
${preview}

Identify the structure, any issues, and what approach to use for parsing.`;

  return await callOpenAI(systemPrompt, userMessage, CONFIG.models.advanced);
}

// ============================================================================
// PERSONAL INFO EXTRACTION
// ============================================================================

async function extractPersonalInfo(
  cvText: string,
  lessonsContext: string
): Promise<ParsedCV['personal']> {
  const systemPrompt = `Extract personal information from this academic CV.

The person's name is usually at the TOP of the CV, often in large font or on its own line.
Handle titles like Ph.D., Dr., Prof., Professor correctly - these are NOT part of the name.

Examples:
- "Dr. John Smith" → firstName: "John", lastName: "Smith"
- "Vadim Talis Ph.D." → firstName: "Vadim", lastName: "Talis"
- "Prof. Maria Garcia-Lopez" → firstName: "Maria", lastName: "Garcia-Lopez"

${lessonsContext}

Return ONLY valid JSON:
{
  "firstName": "string",
  "lastName": "string",
  "email": "string or empty",
  "phone": "string or null",
  "birthYear": number or null,
  "birthCountry": "string or null",
  "maritalStatus": "string or null",
  "numChildren": number or null
}`;

  // Take first portion of CV where personal info typically is
  const personalSection = cvText.substring(0, 3000);
  
  return await callOpenAI(systemPrompt, personalSection, CONFIG.models.standard);
}

// ============================================================================
// EDUCATION EXTRACTION
// ============================================================================

async function extractEducation(
  educationText: string,
  lessonsContext: string
): Promise<EducationEntry[]> {
  if (!educationText || educationText.trim().length < 50) {
    return [];
  }

  const systemPrompt = `Extract ALL education entries from this CV section.

Look for:
- Ph.D., Doctorate, D.Phil.
- M.A., M.Sc., M.S., Master's, MBA, M.Ed.
- B.A., B.Sc., B.S., Bachelor's
- Postdoctoral, Postdoc
- Professional certifications

For each entry extract:
- degreeType: The type of degree (Ph.D., M.A., B.Sc., Postdoc, etc.)
- institution: Full institution name
- department: Department or school within institution
- subject: Field of study
- specialization: Specific area within field
- awardDate: When degree was conferred (YYYY or YYYY-MM format)
- honors: Magna cum laude, distinction, etc.
- country: Country of institution

${lessonsContext}

Return JSON:
{
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
  ]
}`;

  const result = await callOpenAI(systemPrompt, educationText, CONFIG.models.standard);
  return result.education || [];
}

// ============================================================================
// PUBLICATIONS EXTRACTION - Chunked Processing
// ============================================================================

function chunkPublicationsText(publicationsText: string): string[] {
  const lines = publicationsText.split('\n').filter(line => line.trim().length > 0);
  
  // Patterns that indicate start of a new publication entry
  const pubStartPatterns = [
    /^\d+\.\s/,                    // "1. "
    /^\[\d+\]\s/,                  // "[1] "
    /^•\s/,                        // "• "
    /^-\s+[A-Z]/,                  // "- Author..."
    /^[A-Z][a-z]+,\s*[A-Z]\./,     // "Smith, J."
    /^\([12]\d{3}\)/,              // "(2023)"
    /^[12]\d{3}\./,                // "2023."
  ];
  
  const publications: string[] = [];
  let currentPub = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    const isNewPub = pubStartPatterns.some(pattern => pattern.test(trimmed));
    
    if (isNewPub && currentPub.length > 0) {
      publications.push(currentPub.trim());
      currentPub = '';
    }
    currentPub += line + '\n';
  }
  
  if (currentPub.trim().length > 0) {
    publications.push(currentPub.trim());
  }
  
  console.log(`Identified ${publications.length} publication entries`);
  
  // Group into chunks
  const chunks: string[] = [];
  for (let i = 0; i < publications.length; i += CONFIG.maxPublicationsPerChunk) {
    const chunk = publications.slice(i, i + CONFIG.maxPublicationsPerChunk).join('\n\n---\n\n');
    chunks.push(chunk);
  }
  
  return chunks;
}

async function extractPublications(
  publicationsText: string,
  lessonsContext: string,
  textComplexity: number
): Promise<PublicationEntry[]> {
  if (!publicationsText || publicationsText.trim().length < 100) {
    return [];
  }

  const chunks = chunkPublicationsText(publicationsText);
  console.log(`Processing ${chunks.length} publication chunks`);
  
  const allPublications: PublicationEntry[] = [];
  const model = selectModelForTask('publications', textComplexity, chunks.length * CONFIG.maxPublicationsPerChunk);
  
  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i + 1}/${chunks.length}`);
    
    const systemPrompt = `Extract EVERY publication from this text. Count carefully - each numbered or bulleted item is one publication.

Common formats:
1. "1. Author1, A., Author2, B. (2020). Title of paper. Journal Name, 15(3), 45-67."
2. "Smith, J., & Jones, K. (2019). Paper title. In Proceedings of Conference (pp. 100-110)."
3. "[15] Title. Authors. Venue. Year."

For each publication:
- title: Full title of the work
- publicationType: "journal" | "conference" | "book" | "book_chapter" | "preprint" | "other"
- venueName: Journal name, conference name, or book title
- publicationYear: Year as integer
- volume: Volume number if present
- issue: Issue number if present
- pages: Page range (e.g., "45-67")
- coAuthors: Array of all author names ["Smith, J.", "Jones, K."]
- citationCount: null (unless explicitly stated)
- url: DOI or URL if present

${lessonsContext}

Return JSON:
{
  "publications": [...]
}`;

    const userMessage = `Extract ALL publications from chunk ${i + 1}/${chunks.length}:\n\n${chunks[i]}`;
    
    try {
      const result = await callOpenAI(systemPrompt, userMessage, model);
      if (result.publications && Array.isArray(result.publications)) {
        console.log(`Extracted ${result.publications.length} publications from chunk ${i + 1}`);
        allPublications.push(...result.publications);
      }
    } catch (error) {
      console.error(`Error processing chunk ${i + 1}:`, error);
    }
    
    // Rate limiting between chunks
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  
  console.log(`Total publications extracted: ${allPublications.length}`);
  return allPublications;
}

// Fallback function to extract publications when no dedicated section is found
async function extractPublicationsFromFullText(
  cvText: string,
  lessonsContext: string
): Promise<PublicationEntry[]> {
  // Use advanced model for this harder task
  const systemPrompt = `You are analyzing an academic CV that does NOT have a clearly marked publications section.
Your task is to find and extract ALL academic publications mentioned anywhere in the CV.

Look for:
- Journal articles (typically have: authors, year, title, journal name, volume, pages)
- Conference papers (authors, year, title, conference/proceedings name)
- Book chapters (authors, year, chapter title, book title, editors, publisher)
- Working papers or preprints

Publication patterns to recognize:
- "Author1, A., Author2, B. (2020). Title. Journal Name, 15(3), 45-67."
- References with DOIs or URLs
- Numbered lists of papers
- Papers mentioned in context like "published in..." or "appeared in..."

IMPORTANT: Only extract actual publications, not:
- Thesis/dissertation titles (unless published separately)
- Course descriptions
- Project descriptions

${lessonsContext}

Return JSON with all found publications:
{
  "publications": [
    {
      "title": "string",
      "publicationType": "journal|conference|book|book_chapter|preprint|other",
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
}

If no publications are found, return {"publications": []}`;

  // Truncate to reasonable size for the model
  const truncatedText = cvText.length > 20000 
    ? cvText.substring(0, 20000) + "\n[TEXT TRUNCATED]"
    : cvText;

  try {
    const result = await callOpenAI(systemPrompt, truncatedText, CONFIG.models.advanced);
    return result.publications || [];
  } catch (error) {
    console.error("Full-text publication extraction failed:", error);
    return [];
  }
}

// ============================================================================
// EXPERIENCE EXTRACTION
// ============================================================================

async function extractExperience(
  experienceText: string,
  lessonsContext: string
): Promise<ExperienceEntry[]> {
  if (!experienceText || experienceText.trim().length < 50) {
    return [];
  }

  const systemPrompt = `Extract ALL work experience and academic positions from this CV section.

For each position:
- institution: Organization name
- department: Department or unit
- positionTitle: Job title (Professor, Researcher, Lecturer, etc.)
- startDate: Start date (YYYY or YYYY-MM format)
- endDate: End date or "present" / null for current
- description: Brief description of role/responsibilities
- employmentType: "full-time" | "part-time" | "visiting" | "adjunct" | "emeritus"

${lessonsContext}

Return JSON:
{
  "experience": [...]
}`;

  const result = await callOpenAI(systemPrompt, experienceText, CONFIG.models.standard);
  return result.experience || [];
}

// ============================================================================
// OTHER SECTIONS EXTRACTION
// ============================================================================

async function extractGrants(grantsText: string): Promise<GrantEntry[]> {
  if (!grantsText || grantsText.trim().length < 50) return [];

  const systemPrompt = `Extract research grants and funding from this CV section.

Return JSON:
{
  "grants": [
    {
      "title": "string",
      "fundingInstitution": "string",
      "amount": number or null,
      "currencyCode": "USD|EUR|ILS|GBP|etc",
      "awardYear": number or null,
      "duration": "string or null",
      "role": "PI|Co-PI|Researcher|etc"
    }
  ]
}`;

  const result = await callOpenAI(systemPrompt, grantsText, CONFIG.models.standard);
  return result.grants || [];
}

async function extractTeaching(teachingText: string): Promise<TeachingEntry[]> {
  if (!teachingText || teachingText.trim().length < 50) return [];

  const systemPrompt = `Extract teaching experience from this CV section.

Return JSON:
{
  "teaching": [
    {
      "courseTitle": "string",
      "educationLevel": "undergraduate|graduate|doctoral|professional",
      "institution": "string or null",
      "teachingPeriod": "string or null"
    }
  ]
}`;

  const result = await callOpenAI(systemPrompt, teachingText, CONFIG.models.standard);
  return result.teaching || [];
}

async function extractSupervision(supervisionText: string): Promise<SupervisionEntry[]> {
  if (!supervisionText || supervisionText.trim().length < 50) return [];

  const systemPrompt = `Extract student supervision records from this CV section.

Return JSON:
{
  "supervision": [
    {
      "studentName": "string",
      "degreeLevel": "PhD|Masters|Bachelors|Postdoc",
      "thesisTitle": "string or null",
      "completionYear": number or null,
      "role": "Primary Advisor|Co-Advisor|Committee Member|etc"
    }
  ]
}`;

  const result = await callOpenAI(systemPrompt, supervisionText, CONFIG.models.standard);
  return result.supervision || [];
}

async function extractMemberships(membershipsText: string): Promise<MembershipEntry[]> {
  if (!membershipsText || membershipsText.trim().length < 50) return [];

  const systemPrompt = `Extract professional memberships from this CV section.

Return JSON:
{
  "memberships": [
    {
      "organization": "string",
      "startYear": number or null,
      "endYear": number or null
    }
  ]
}`;

  const result = await callOpenAI(systemPrompt, membershipsText, CONFIG.models.standard);
  return result.memberships || [];
}

async function extractAwards(awardsText: string): Promise<AwardEntry[]> {
  if (!awardsText || awardsText.trim().length < 50) return [];

  const systemPrompt = `Extract awards and honors from this CV section.

Return JSON:
{
  "awards": [
    {
      "awardName": "string",
      "awardingInstitution": "string or null",
      "awardYear": number or null,
      "description": "string or null"
    }
  ]
}`;

  const result = await callOpenAI(systemPrompt, awardsText, CONFIG.models.standard);
  return result.awards || [];
}

// ============================================================================
// MAIN PARSING ORCHESTRATOR
// ============================================================================

async function parseCV(
  cvText: string,
  extractionResult: TextExtractionResult,
  supabase: any
): Promise<ParsedCV> {
  const startTime = Date.now();
  const warnings: string[] = [];
  const lessonsApplied: string[] = [];
  const newLessonsGenerated: string[] = [];
  
  // 1. Fetch existing lessons
  console.log("Fetching parsing lessons...");
  const lessons = await fetchParsingLessons(supabase);
  console.log(`Loaded ${lessons.length} parsing lessons`);
  const lessonsContext = buildLessonsContext(lessons);
  
  // 2. Detect sections
  console.log("Detecting CV sections...");
  const sections = detectAllSections(cvText, lessons);
  console.log(`Detected ${sections.length} sections`);
  
  // 3. Analyze CV structure with advanced model
  console.log("Analyzing CV structure...");
  let structureAnalysis;
  try {
    structureAnalysis = await analyzeCVStructure(cvText, sections, lessonsContext);
    warnings.push(...structureAnalysis.warnings);
    
    // Record any new lessons from structure analysis
    for (const lesson of structureAnalysis.newLessons) {
      await recordNewLesson(supabase, lesson.type, lesson.pattern, lesson.resolution, 0.6);
      newLessonsGenerated.push(`${lesson.type}: ${lesson.pattern}`);
    }
  } catch (error) {
    console.warn("Structure analysis failed, continuing with default approach:", error);
    structureAnalysis = { suggestedApproach: 'standard', warnings: [], newLessons: [] };
  }
  
  // 4. Extract personal info
  console.log("Extracting personal information...");
  const personal = await extractPersonalInfo(cvText, lessonsContext);
  
  // 5. Extract education
  console.log("Extracting education...");
  const educationSections = findSectionsByCategory(sections, 'education');
  const educationText = educationSections.length > 0 
    ? mergeSectionContents(educationSections)
    : cvText.substring(0, 5000); // Fall back to beginning of CV
  const education = await extractEducation(educationText, lessonsContext);
  console.log(`Extracted ${education.length} education entries`);
  
  // 6. Extract publications
  console.log("Extracting publications...");
  const publicationSections = findSectionsByCategory(sections, 'publications');
  let publications: PublicationEntry[] = [];
  
  if (publicationSections.length > 0) {
    const publicationsText = mergeSectionContents(publicationSections);
    console.log(`Publications section found, text length: ${publicationsText.length}`);
    publications = await extractPublications(
      publicationsText,
      lessonsContext,
      1 - extractionResult.textQualityScore
    );
    
    // Record lesson if publications were found in unexpected section names
    for (const section of publicationSections) {
      const normalizedName = section.name.toLowerCase();
      if (!['publications', 'research publications'].includes(normalizedName)) {
        await incrementLessonOccurrence(supabase, 'section_naming', section.name);
        lessonsApplied.push(`Recognized "${section.name}" as publications section`);
      }
    }
  } else {
    // Fallback: search for publications in full text using AI
    console.log("No publications section detected, searching in full text...");
    const hasPublicationKeywords = /publication|journal|conference|proceedings|volume|issue/i.test(cvText);
    const hasCitationPatterns = /\(\d{4}\)|,\s*\d{4}[,.\s]|Vol\.|pp\./i.test(cvText);
    
    if (hasPublicationKeywords || hasCitationPatterns) {
      console.log("Publication patterns detected in text, attempting extraction from full CV");
      publications = await extractPublicationsFromFullText(cvText, lessonsContext);
      if (publications.length > 0) {
        warnings.push(`Publications found via full-text search (no dedicated section detected)`);
      }
    }
  }
  console.log(`Extracted ${publications.length} publications`);
  
  // 7. Extract experience
  console.log("Extracting experience...");
  const experienceSections = findSectionsByCategory(sections, 'experience');
  const experienceText = experienceSections.length > 0 
    ? mergeSectionContents(experienceSections)
    : '';
  const experience = await extractExperience(experienceText, lessonsContext);
  console.log(`Extracted ${experience.length} experience entries`);
  
  // 8. Extract other sections
  console.log("Extracting grants, teaching, supervision, memberships, awards...");
  
  const grantsSections = findSectionsByCategory(sections, 'grants');
  const grants = await extractGrants(mergeSectionContents(grantsSections));
  
  const teachingSections = findSectionsByCategory(sections, 'teaching');
  const teaching = await extractTeaching(mergeSectionContents(teachingSections));
  
  const supervisionSections = findSectionsByCategory(sections, 'supervision');
  const supervision = await extractSupervision(mergeSectionContents(supervisionSections));
  
  const membershipSections = findSectionsByCategory(sections, 'memberships');
  const memberships = await extractMemberships(mergeSectionContents(membershipSections));
  
  const awardsSections = findSectionsByCategory(sections, 'awards');
  const awards = await extractAwards(mergeSectionContents(awardsSections));
  
  // 9. Validation and warnings
  const degreeKeywords = (cvText.match(/\b(ph\.?d\.?|m\.a\.?|m\.sc\.?|b\.a\.?|b\.sc\.?|postdoc)/gi) || []);
  if (degreeKeywords.length > education.length + 2) {
    warnings.push(`Found ${degreeKeywords.length} degree keywords but only extracted ${education.length} education entries`);
  }
  
  if (cvText.toLowerCase().includes('publications') && publications.length === 0) {
    warnings.push('CV contains "publications" keyword but no publications were extracted');
  }
  
  const elapsedTime = Date.now() - startTime;
  console.log(`CV parsing completed in ${elapsedTime}ms`);
  
  // Calculate confidence score
  const confidenceScore = calculateConfidence(
    personal,
    education,
    publications,
    experience,
    extractionResult.textQualityScore,
    warnings.length
  );
  
  return {
    personal: {
      firstName: personal.firstName || '',
      lastName: personal.lastName || '',
      email: personal.email || '',
      phone: personal.phone || null,
      birthYear: personal.birthYear || null,
      birthCountry: personal.birthCountry || null,
      maritalStatus: personal.maritalStatus || null,
      numChildren: personal.numChildren || null,
    },
    education,
    publications,
    experience,
    grants,
    teaching,
    supervision,
    memberships,
    awards,
    parsingMetadata: {
      extractionMethod: extractionResult.method,
      modelUsed: `${CONFIG.models.advanced} + ${CONFIG.models.standard}`,
      lessonsApplied,
      newLessonsGenerated,
      confidenceScore,
      warnings,
    },
  };
}

function calculateConfidence(
  personal: any,
  education: any[],
  publications: any[],
  experience: any[],
  textQuality: number,
  warningCount: number
): number {
  let score = 0.5;
  
  // Personal info completeness
  if (personal.firstName && personal.lastName) score += 0.1;
  if (personal.email) score += 0.05;
  
  // Data richness
  if (education.length > 0) score += 0.1;
  if (publications.length > 0) score += 0.1;
  if (experience.length > 0) score += 0.05;
  
  // Text quality impact
  score += textQuality * 0.1;
  
  // Penalty for warnings
  score -= warningCount * 0.05;
  
  return Math.max(0, Math.min(1, score));
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
      console.error("Storage download error:", downloadError);
      return new Response(
        JSON.stringify({ error: "PDF_READ_FAILED", message: "Unable to read PDF file from storage" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract text with multiple methods
    console.log("Extracting text from PDF...");
    const arrayBuffer = await fileData.arrayBuffer();
    
    let extractionResult: TextExtractionResult;
    try {
      extractionResult = await extractTextFromPDF(arrayBuffer);
      console.log(`Extracted ${extractionResult.text.length} chars using ${extractionResult.method}`);
      console.log(`Text quality score: ${extractionResult.textQualityScore}`);
      console.log(`Multi-column detected: ${extractionResult.hasMultipleColumns}`);
    } catch (parseError) {
      console.error("PDF parsing error:", parseError);
      return new Response(
        JSON.stringify({ error: "PDF_PARSE_FAILED", message: "Failed to extract text from PDF" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!extractionResult.text || extractionResult.text.trim().length < 50) {
      return new Response(
        JSON.stringify({ error: "NO_TEXT", message: "PDF contains no readable text" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean sensitive data
    const cleanedText = removeSensitiveData(extractionResult.text);
    console.log(`Cleaned text length: ${cleanedText.length}`);

    // Parse CV
    console.log("Parsing CV...");
    const parsedData = await parseCV(cleanedText, extractionResult, supabase);

    // Log results
    console.log("=== PARSING RESULTS ===");
    console.log(`Personal: ${parsedData.personal.firstName} ${parsedData.personal.lastName}`);
    console.log(`Education: ${parsedData.education.length} entries`);
    console.log(`Publications: ${parsedData.publications.length} entries`);
    console.log(`Experience: ${parsedData.experience.length} entries`);
    console.log(`Grants: ${parsedData.grants.length} entries`);
    console.log(`Teaching: ${parsedData.teaching.length} entries`);
    console.log(`Supervision: ${parsedData.supervision.length} entries`);
    console.log(`Memberships: ${parsedData.memberships.length} entries`);
    console.log(`Awards: ${parsedData.awards.length} entries`);
    console.log(`Confidence: ${parsedData.parsingMetadata.confidenceScore}`);
    console.log(`Warnings: ${parsedData.parsingMetadata.warnings.length}`);

    // Validate required fields
    if (!parsedData.personal.firstName || !parsedData.personal.lastName) {
      return new Response(
        JSON.stringify({
          error: "INCOMPLETE_DATA",
          message: "Could not extract required information (name)",
          debug: {
            textPreview: cleanedText.substring(0, 1000),
            textLength: cleanedText.length,
            extractionMethod: extractionResult.method,
          }
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for duplicate
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
            message: "This person's CV has already been indexed",
            existingPerson: {
              id: existingPerson.id,
              name: `${existingPerson.first_name} ${existingPerson.last_name}`,
              email: existingPerson.email,
              importedAt: existingPerson.created_at,
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
    console.error("Error in edge function:", error);
    return new Response(
      JSON.stringify({
        error: "PARSE_ERROR",
        message: error instanceof Error ? error.message : "Unknown error occurred",
        stack: error instanceof Error ? error.stack : undefined,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});